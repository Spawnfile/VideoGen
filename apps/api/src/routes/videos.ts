import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { AUDIO_MODES, IMPLEMENTED_STEPS, producePlan, STEP_KEYS } from '@videogen/shared';
import {
  appendAudit, createProduceRun, getArtifact, getRun, getRunView, getVideoView, isUuid, listArtifacts, listVideoReviews, listRunViews, listVideoViews, publishRunAndVideo,
} from '@videogen/db';
import { sendCommand } from './notify.ts';

const Produce = z.object({
  productName: z.string().trim().min(2, 'ürün adı en az 2 karakter olmalı').max(80, 'ürün adı en çok 80 karakter olabilir')
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'ürün adında kontrol karakteri olamaz'),
  audioMode: z.enum(AUDIO_MODES, { error: 'ses modu vo ya da silent olmalı' }),
  /** Dev only (VG_DEV_ENDPOINTS=1): end the plan at this step (smoke scenarios of earlier milestones). */
  until: z.enum(STEP_KEYS).optional(),
});

export function registerVideoRoutes(app: FastifyInstance, deps: { pool: pg.Pool; devEndpoints?: boolean }): void {
  const { pool } = deps;
  const id = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.post('/api/videos', async (req, reply) => {
    const b = Produce.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'geçersiz istek' });
    if (b.data.until && !deps.devEndpoints) return reply.code(400).send({ error: 'until yalnızca geliştirici kipinde' });
    const upTo = b.data.until && IMPLEMENTED_STEPS.includes(b.data.until) ? IMPLEMENTED_STEPS.slice(0, IMPLEMENTED_STEPS.indexOf(b.data.until) + 1) : IMPLEMENTED_STEPS;
    const created = await createProduceRun(pool, { productName: b.data.productName, audioMode: b.data.audioMode, plan: producePlan(b.data.audioMode, upTo) });
    await publishRunAndVideo(pool, created.runId);
    await sendCommand(pool, { type: 'run.start', runId: created.runId });
    return reply.code(202).send({ videoId: created.videoId, runId: created.runId });
  });

  app.get('/api/videos', async () => listVideoViews(pool));

  app.get('/api/videos/:id', async (req, reply) => {
    const v = isUuid(id(req)) ? await getVideoView(pool, id(req)) : null;
    if (!v) return reply.code(404).send({ error: 'not found' });
    return { video: v, runs: await listRunViews(pool, v.id), artifacts: await listArtifacts(pool, v.id) };
  });

  app.get('/api/videos/:id/reviews', async (req, reply) => {
    const v = isUuid(id(req)) ? await getVideoView(pool, id(req)) : null;
    if (!v) return reply.code(404).send({ error: 'not found' });
    return listVideoReviews(pool, v.id);
  });

  app.get('/api/runs/:id', async (req, reply) => {
    const r = isUuid(id(req)) ? await getRunView(pool, id(req)) : null;
    return r ?? reply.code(404).send({ error: 'not found' });
  });

  app.post('/api/runs/:id/cancel', async (req, reply) => {
    const r = isUuid(id(req)) ? await getRun(pool, id(req)) : null;
    if (!r) return reply.code(404).send({ error: 'not found' });
    if (r.status !== 'queued' && r.status !== 'running') return reply.code(409).send({ error: 'run aktif değil' });
    await appendAudit(pool, { actorType: 'user', action: 'run.cancel_requested', runId: r.id, subjectType: 'video', subjectId: r.videoId });
    await sendCommand(pool, { type: 'run.cancel', runId: r.id });
    return reply.code(202).send({ accepted: true });
  });

  app.get('/api/artifacts/:id', async (req, reply) => {
    const a = isUuid(id(req)) ? await getArtifact(pool, id(req)) : null;
    return a ?? reply.code(404).send({ error: 'not found' });
  });
}
