import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { appendAudit, createThread, getThread, insertChatMessage, isUuid, listChatMessages, listThreads, publishEvent, renameThread } from '@videogen/db';
import { sendCommand } from './notify.ts';

const DEFAULT_TITLE = 'Yeni sohbet';
const NewThread = z.object({ title: z.string().trim().min(1).max(120).optional() });
const NewMessage = z.object({ text: z.string().trim().min(1).max(20_000) });

export function registerChatRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  const { pool } = deps;
  const thread = async (id: string) => (isUuid(id) ? getThread(pool, id) : null);

  app.post('/api/chat/threads', async (req, reply) => {
    const b = NewThread.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'başlık 1–120 karakter olmalı' });
    const th = await createThread(pool, { id: randomUUID(), title: b.data.title ?? DEFAULT_TITLE });
    await appendAudit(pool, { actorType: 'user', action: 'chat.thread_created', subjectType: 'chat_thread', subjectId: th.id });
    return reply.code(201).send(th);
  });

  app.get('/api/chat/threads', async () => listThreads(pool));

  app.get('/api/chat/threads/:id', async (req, reply) => {
    const th = await thread((req.params as { id: string }).id);
    if (!th) return reply.code(404).send({ error: 'not found' });
    return { thread: th, messages: await listChatMessages(pool, th.id) };
  });

  app.post('/api/chat/threads/:id/messages', async (req, reply) => {
    const th = await thread((req.params as { id: string }).id);
    if (!th) return reply.code(404).send({ error: 'not found' });
    const b = NewMessage.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'mesaj 1–20.000 karakter olmalı' });
    const m = await insertChatMessage(pool, { id: randomUUID(), threadId: th.id, role: 'user', text: b.data.text, status: 'queued' });
    if (th.title === DEFAULT_TITLE) await renameThread(pool, th.id, b.data.text.slice(0, 60));
    await appendAudit(pool, { actorType: 'user', action: 'chat.message_sent', subjectType: 'chat_thread', subjectId: th.id, data: { messageId: m.id, chars: m.text.length, preview: m.text.slice(0, 200) } });
    await publishEvent(pool, { topic: `chat:${th.id}`, type: 'chat.message', payload: m });
    await sendCommand(pool, { type: 'chat.send', messageId: m.id });
    return reply.code(202).send(m);
  });

  app.post('/api/chat/threads/:id/interrupt', async (req, reply) => {
    const th = await thread((req.params as { id: string }).id);
    if (!th) return reply.code(404).send({ error: 'not found' });
    await appendAudit(pool, { actorType: 'user', action: 'chat.interrupt_requested', subjectType: 'chat_thread', subjectId: th.id });
    await sendCommand(pool, { type: 'chat.interrupt', threadId: th.id });
    return reply.code(202).send({ accepted: true });
  });
}
