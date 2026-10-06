import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ROLE_LABELS, ROLE_NAMES, type RoleName } from '@videogen/shared';
import { appendAudit } from '@videogen/db';
import { ROLES, type RoleOverrides } from '@videogen/claude';
import { sendCommand } from './notify.ts';

const Patch = z.object({ model: z.enum(['opus', 'sonnet', 'haiku']).optional(), effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional() })
  .strict().refine((v) => v.model || v.effort, 'model veya effort gerekli');
const DevSession = z.object({
  role: z.enum(ROLE_NAMES),
  prompt: z.string().max(2000).optional(),
  script: z.object({ fixture: z.string().regex(/^[a-z0-9-]+$/) }).passthrough().optional(),
});

async function readOverrides(pool: pg.Pool): Promise<RoleOverrides> {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'roles'");
  return (rows[0]?.value ?? {}) as RoleOverrides;
}

export function registerRoleRoutes(app: FastifyInstance, deps: { pool: pg.Pool; devEndpoints: boolean }): void {
  const { pool } = deps;

  app.get('/api/roles', async () => {
    const o = await readOverrides(pool);
    return ROLE_NAMES.map((r) => ({
      role: r, label: ROLE_LABELS[r], model: o[r]?.model ?? ROLES[r].model, effort: o[r]?.effort ?? ROLES[r].effort,
      defaults: { model: ROLES[r].model, effort: ROLES[r].effort },
    }));
  });

  app.put('/api/roles/:role', async (req, reply) => {
    const role = (req.params as { role: string }).role;
    if (!(ROLE_NAMES as readonly string[]).includes(role)) return reply.code(404).send({ error: 'not found' });
    const b = Patch.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz model veya effort' });
    const before = await readOverrides(pool);
    const r = role as RoleName;
    const next: RoleOverrides = { ...before, [r]: { ...before[r], ...b.data } };
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('roles', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(next)],
    );
    await appendAudit(pool, { actorType: 'user', action: 'settings.role_changed', subjectType: 'role', subjectId: r, data: { role: r, before: before[r] ?? null, after: next[r] } });
    await sendCommand(pool, { type: 'roles.changed' });
    return { role: r, model: next[r]?.model ?? ROLES[r].model, effort: next[r]?.effort ?? ROLES[r].effort };
  });

  if (deps.devEndpoints) {
    app.post('/api/dev/sessions', async (req, reply) => {
      const b = DevSession.safeParse(req.body ?? {});
      if (!b.success) return reply.code(400).send({ error: 'geçersiz rol veya senaryo' });
      await sendCommand(pool, { type: 'dev.session.start', ...b.data });
      return reply.code(202).send({ accepted: true });
    });
  }
}
