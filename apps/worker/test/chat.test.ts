import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createThread, getThread, insertChatMessage, listChatMessages, listSessions } from '@videogen/db';
import { FakeClaudeDriver, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { ChatService } from '../src/agents/chat.ts';
import { fakePicker } from '../src/agents/fake-picker.ts';
import { SessionManager } from '../src/agents/manager.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const stops: (() => Promise<void>)[] = [];
afterEach(async () => { for (const s of stops.splice(0)) await s(); });

function setup(o: { speed?: number; stallFirst?: boolean } = {}) {
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: o.speed ?? 0, pick: o.stallFirst ? () => ({ fixture: 'basic', stall: { afterIndex: 1, ms: 60_000 } }) : fakePicker('basic,coding') });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const manager = new SessionManager({ pool: t.pool, dataDir: mkdtempSync(join(tmpdir(), 'vg-chat-')), driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 } });
  const chat = new ChatService({ pool: t.pool, manager });
  chat.bind();
  stops.push(() => manager.stop());
  return { manager, chat, specs };
}
async function send(threadId: string, text: string) {
  const m = await insertChatMessage(t.pool, { id: randomUUID(), threadId, role: 'user', text, status: 'queued' });
  return m.id;
}
const statuses = async (threadId: string) => (await listChatMessages(t.pool, threadId)).map((m) => `${m.role}:${m.status}`);

describe('ChatService', () => {
  it('answers a message, queues one sent while busy and runs it on the same process as the next turn', async () => {
    const { chat, specs } = setup();
    const th = await createThread(t.pool, { id: randomUUID(), title: 'Kalem' });
    const a = await send(th.id, 'merhaba');
    const b = await send(th.id, 'devam');
    await chat.handleSend(a);
    await chat.handleSend(b);
    await vi.waitFor(async () => expect(await statuses(th.id)).toEqual(['user:done', 'user:done', 'assistant:done', 'assistant:done']));
    const msgs = await listChatMessages(t.pool, th.id);
    expect(msgs.filter((m) => m.role === 'assistant').map((m) => m.turn)).toEqual([0, 1]);
    expect(msgs.find((m) => m.role === 'assistant')!.text).toBe('OK');
    expect(specs).toHaveLength(1);
    expect((await getThread(t.pool, th.id))!.claudeSessionId).toBe(specs[0]!.claudeSessionId);
  });

  it('interrupt marks the running message interrupted; the next message resumes the same Claude session in a new process', async () => {
    const { chat, specs } = setup({ stallFirst: true });
    const th = await createThread(t.pool, { id: randomUUID(), title: 'İptal' });
    await chat.handleSend(await send(th.id, 'uzun iş'));
    await vi.waitFor(async () => expect(await statuses(th.id)).toEqual(['user:running']));
    await chat.interrupt(th.id);
    await vi.waitFor(async () => expect(await statuses(th.id)).toEqual(['user:interrupted']));
    await chat.handleSend(await send(th.id, 'yeniden'));
    await vi.waitFor(() => expect(specs).toHaveLength(2));
    expect(specs[1]).toMatchObject({ resume: true, claudeSessionId: specs[0]!.claudeSessionId, role: 'chat' });
  });

  it('recover() fails messages left running and processes queued ones', async () => {
    const { chat } = setup();
    const th = await createThread(t.pool, { id: randomUUID(), title: 'Kurtarma' });
    await insertChatMessage(t.pool, { id: randomUUID(), threadId: th.id, role: 'user', text: 'yarım kaldı', status: 'running' });
    await send(th.id, 'bekleyen');
    await chat.recover();
    await vi.waitFor(async () => expect(await statuses(th.id)).toEqual(['user:failed', 'user:done', 'assistant:done']));
    expect((await listSessions(t.pool, { kind: 'chat' })).length).toBeGreaterThan(0);
  });
});
