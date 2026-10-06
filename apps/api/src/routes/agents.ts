import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { appendAudit, getSession, listSessions, readAgentEvents, toSessionView } from '@videogen/db';
import { mapHistory, type Msg } from '@videogen/claude';
import { sendCommand } from './notify.ts';

export function registerAgentRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  const { pool } = deps;

  app.get('/api/sessions', async (req) => {
    const q = req.query as { scope?: string; kind?: string };
    const kind = q.kind === 'chat' || q.kind === 'pipeline' ? q.kind : undefined;
    const rows = await listSessions(pool, q.scope === 'active' ? { activeOnly: true, kind, limit: 100 } : { kind, limit: 30 });
    return rows.map(toSessionView);
  });

  app.get('/api/sessions/:id', async (req, reply) => {
    const s = await getSession(pool, (req.params as { id: string }).id);
    return s ? toSessionView(s) : reply.code(404).send({ error: 'not found' });
  });

  app.get('/api/sessions/:id/trace', async (req, reply) => {
    const s = await getSession(pool, (req.params as { id: string }).id);
    if (!s) return reply.code(404).send({ error: 'not found' });
    const events = await readAgentEvents(pool, s.id);
    return mapHistory(s.id, events.map((e) => ({ m: e.payload as Msg, turn: e.turn, at: Date.parse(e.ts) })), s.runDir);
  });

  for (const action of ['cancel', 'retry'] as const) {
    app.post(`/api/sessions/:id/${action}`, async (req, reply) => {
      const s = await getSession(pool, (req.params as { id: string }).id);
      if (!s) return reply.code(404).send({ error: 'not found' });
      // M4a minor 11 / M3 minor 12: a step's session is retried by its step, a chat session by its next message.
      if (action === 'retry' && (s.stepId || s.kind === 'chat')) return reply.code(409).send({ error: s.stepId ? 'adım oturumunu adım yeniden dener' : 'chat oturumu bir sonraki mesajla sürer' });
      await appendAudit(pool, { actorType: 'user', action: `session.${action}_requested`, sessionId: s.id, subjectType: 'agent_session', subjectId: s.id });
      await sendCommand(pool, { type: `session.${action}`, sessionId: s.id });
      return reply.code(202).send({ accepted: true });
    });
  }
}
