import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { watchParent } from '@videogen/shared';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { CliAuthStatus } from '../src/claude-account.ts';
import { findBundledClaude, sdkVersion } from '../src/claude-binary.ts';
import { listenCommands } from '../src/commands.ts';
import { fakePicker } from '../src/agents/fake-picker.ts';
import { loadRoleOverrides } from '../src/agents/role-settings.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('worker wiring', () => {
  it('passes the parsed command to its handler', async () => {
    const got: unknown[] = [];
    const stop = await listenCommands(t.appUrl, { 'chat.send': async (c) => { got.push(c); } }, { onConnectionLost: () => {} });
    await t.pool.query("SELECT pg_notify('vg_commands', $1)", [JSON.stringify({ type: 'chat.send', messageId: 'm1' })]);
    await vi.waitFor(() => expect(got).toEqual([{ type: 'chat.send', messageId: 'm1' }]));
    await stop();
  });

  it('pins the bundled binary to the file named claude and reports the SDK version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vg-bin-'));
    for (const f of ['aaa-helper', 'claude']) { writeFileSync(join(dir, f), '#!/bin/sh\n'); chmodSync(join(dir, f), 0o755); }
    expect(findBundledClaude(dir)).toBe(join(dir, 'claude'));
    expect(() => findBundledClaude(mkdtempSync(join(tmpdir(), 'vg-bin-')))).toThrow(/not found/);
    expect(findBundledClaude()).toMatch(/claude-agent-sdk-linux-x64\/claude$/);
    expect(sdkVersion()).toBe('0.3.290');
  });

  it('parses auth status JSON even when the CLI exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vg-auth-'));
    const bin = join(dir, 'claude');
    writeFileSync(bin, '#!/bin/sh\necho \'{"loggedIn":false,"authMethod":"none","subscriptionType":null}\'\nexit 1\n');
    chmodSync(bin, 0o755);
    const a = await new CliAuthStatus(bin).read();
    expect(a).toMatchObject({ loggedIn: false, authMethod: 'none' });
    expect(a.error).toBeUndefined();
  });

  it('watchParent fires once when the parent pid changes', async () => {
    let ppid = 4242;
    const gone = vi.fn();
    const stop = watchParent(gone, { everyMs: 10, getPpid: () => ppid });
    await new Promise((r) => setTimeout(r, 40));
    expect(gone).not.toHaveBeenCalled();
    ppid = 1;
    await vi.waitFor(() => expect(gone).toHaveBeenCalledTimes(1));
    stop();
  });

  it('fakePicker rotates chat fixtures and honours an explicit script on the first turn', () => {
    const pick = fakePicker('websearch,coding');
    const chat = { role: 'chat' } as never;
    expect([0, 1, 2].map((n) => pick(chat, n).fixture)).toEqual(['websearch', 'coding', 'websearch']);
    expect(pick({ role: 'researcher', fakeScript: { fixture: 'guard' } } as never, 0).fixture).toBe('guard');
    expect(pick({ role: 'researcher' } as never, 0).fixture).toBe('basic');
  });

  it('loads role overrides from settings', async () => {
    expect(await loadRoleOverrides(t.pool)).toEqual({});
    await t.pool.query("INSERT INTO settings (key, value) VALUES ('roles', $1)", [JSON.stringify({ chat: { model: 'haiku', effort: 'low' }, bogus: { model: 'x' } })]);
    expect(await loadRoleOverrides(t.pool)).toEqual({ chat: { model: 'haiku', effort: 'low' } });
  });
});
