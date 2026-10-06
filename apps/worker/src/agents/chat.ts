import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { ChatMessage, ChatMessageStatus } from '@videogen/shared';
import { chatMessagesByStatus, getChatMessage, getThread, insertChatMessage, publishEvent, setThreadClaudeSession, updateChatMessage } from '@videogen/db';
import type { SessionManager } from './manager.ts';
import type { RunEnd } from './runner.ts';

interface Active { sessionId: string; current: string | null; queue: string[] }

/** One process per thread; messages are turns of a streaming-input session, resumed after idle close (spec §6.4). */
export class ChatService {
  private active = new Map<string, Active>();
  private threadOf = new Map<string, string>();
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly d: { pool: pg.Pool; manager: SessionManager }) {}

  bind(): void {
    this.d.manager.events = {
      onTurnComplete: (id, r) => this.serial(() => this.onTurn(id, r)),
      onEnd: (id, end, info) => this.serial(() => this.onEnd(id, end, info)),
    };
  }

  handleSend(messageId: string): Promise<void> { return this.serial(() => this.send(messageId)); }

  async interrupt(threadId: string): Promise<void> {
    const a = this.active.get(threadId);
    if (a) await this.d.manager.cancel(a.sessionId);
  }

  async recover(): Promise<void> {
    for (const m of await chatMessagesByStatus(this.d.pool, ['running'])) await this.mark(m.id, { status: 'failed', completedAt: new Date() });
    for (const m of await chatMessagesByStatus(this.d.pool, ['queued'])) await this.handleSend(m.id);
  }

  async resumeWaiting(): Promise<void> {
    for (const m of await chatMessagesByStatus(this.d.pool, ['waiting_limit'])) {
      await this.mark(m.id, { status: 'queued' });
      await this.handleSend(m.id);
    }
  }

  /** Command handlers and manager callbacks touch the same maps: run them one at a time. */
  private serial(fn: () => Promise<void>): Promise<void> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => {});
    return next;
  }

  private async send(messageId: string): Promise<void> {
    const msg = await getChatMessage(this.d.pool, messageId);
    if (!msg || msg.role !== 'user' || msg.status !== 'queued') return;
    const thread = await getThread(this.d.pool, msg.threadId);
    if (!thread) return;
    const a = this.active.get(thread.id);
    if (a) {
      if (a.current) { if (!a.queue.includes(msg.id)) a.queue.push(msg.id); return; }
      if (this.d.manager.sendChat(a.sessionId, msg.text)) {
        a.current = msg.id;
        await this.mark(msg.id, { status: 'running', sessionId: a.sessionId });
        return;
      }
      this.forget(thread.id);
    }
    const sessionId = randomUUID();
    const resume = !!thread.claudeSessionId;
    const claudeSessionId = thread.claudeSessionId ?? sessionId;
    this.active.set(thread.id, { sessionId, current: msg.id, queue: [] });
    this.threadOf.set(sessionId, thread.id);
    if (!resume) await setThreadClaudeSession(this.d.pool, thread.id, claudeSessionId);
    await this.mark(msg.id, { status: 'running', sessionId });
    await this.d.manager.start({ id: sessionId, kind: 'chat', role: 'chat', prompt: msg.text, threadId: thread.id, claudeSessionId, resume });
  }

  private async onTurn(sessionId: string, r: { turn: number; text: string | null }): Promise<void> {
    const threadId = this.threadOf.get(sessionId);
    const a = threadId ? this.active.get(threadId) : undefined;
    if (!threadId || !a?.current) return;
    const done = a.current;
    a.current = null;
    await this.mark(done, { status: 'done', completedAt: new Date(), turn: r.turn });
    const reply = await insertChatMessage(this.d.pool, { id: randomUUID(), threadId, role: 'assistant', text: r.text ?? '', status: 'done', sessionId, turn: r.turn });
    await this.publish(reply);
    const next = a.queue.shift();
    if (next) await this.send(next);
  }

  private async onEnd(sessionId: string, end: RunEnd, info: { limited: boolean }): Promise<void> {
    const threadId = this.threadOf.get(sessionId);
    if (!threadId) return;
    const a = this.active.get(threadId);
    this.forget(threadId);
    if (!a) return;
    if (a.current) {
      const status: ChatMessageStatus = info.limited ? 'waiting_limit' : end.status === 'cancelled' ? 'interrupted' : 'failed';
      await this.mark(a.current, { status, completedAt: status === 'waiting_limit' ? undefined : new Date() });
    }
    if (info.limited) {
      for (const id of a.queue) await this.mark(id, { status: 'waiting_limit' });
      return;
    }
    for (const id of a.queue) await this.send(id);
  }

  private forget(threadId: string): void {
    const a = this.active.get(threadId);
    if (a) this.threadOf.delete(a.sessionId);
    this.active.delete(threadId);
  }

  private async mark(id: string, p: { status?: ChatMessageStatus; sessionId?: string; turn?: number; completedAt?: Date }): Promise<void> {
    const m = await updateChatMessage(this.d.pool, id, p);
    if (m) await this.publish(m);
  }

  private async publish(m: ChatMessage): Promise<void> {
    await publishEvent(this.d.pool, { topic: `chat:${m.threadId}`, type: 'chat.message', payload: m });
  }
}
