import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { AUDIO_MODES, BRIEF_MAX, durationWindowErrors, IMPLEMENTED_STEPS, producePlan, STEP_KEYS } from '@videogen/shared';
import {
  appendAudit, createProduceRun, getArtifact, getRun, getRunView, getVideoView, isUuid, listArtifacts, listVersionReviews, listVersions, listVideoReviews, listRunViews, listVideoViews, publishRunAndVideo, versionVideoId,
} from '@videogen/db';
import { sendCommand } from './notify.ts';

const Produce = z.object({
  productName: z.string().trim().min(2, 'the product name needs at least 2 characters').max(80, 'the product name can be at most 80 characters')
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'the product name cannot contain control characters'),
  // YAKLASIM spec Y2: no voiceover; the field may be left out (silent).
  audioMode: z.enum(AUDIO_MODES, { error: 'the audio mode must be silent' }).refine((m) => m === 'silent', 'Voiceover is not part of the YAKLASIM approach.').default('silent'),
  /** Brief design Y4: the user's production brief (tabs and line breaks, CRLF included, allowed; no other control characters). */
  brief: z.string().max(BRIEF_MAX, `the brief can be at most ${BRIEF_MAX} characters`)
    .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), 'the brief cannot contain control characters').optional(),
  /** YAKLASIM spec Y1: the length is fixed at 12–15 s; a window from the client is refused. */
  duration: z.unknown().refine((d) => d === undefined || d === null, 'The length is fixed at 12–15 s by the YAKLASIM approach.').optional(),
  /** Dev only (VG_DEV_ENDPOINTS=1): end the plan at this step (smoke scenarios of earlier milestones). */
  until: z.enum(STEP_KEYS).optional(),
});

export function registerVideoRoutes(app: FastifyInstance, deps: { pool: pg.Pool; devEndpoints?: boolean }): void {
  const { pool } = deps;
  const id = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.post('/api/videos', async (req, reply) => {
    const b = Produce.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'invalid request' });
    if (b.data.until && !deps.devEndpoints) return reply.code(400).send({ error: 'until only works in developer mode' });
    const upTo = b.data.until && IMPLEMENTED_STEPS.includes(b.data.until) ? IMPLEMENTED_STEPS.slice(0, IMPLEMENTED_STEPS.indexOf(b.data.until) + 1) : IMPLEMENTED_STEPS;
    const created = await createProduceRun(pool, {
      productName: b.data.productName, audioMode: b.data.audioMode, plan: producePlan(b.data.audioMode, upTo), brief: b.data.brief ?? null, duration: null,
    });
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
    const version = (req.query as { version?: string }).version;
    if (version === undefined) return listVideoReviews(pool, v.id);
    // Plan M7 Y7: one version's rounds; a version of another video is a bad request, not an empty list.
    if (!isUuid(version) || (await versionVideoId(pool, version)) !== v.id) return reply.code(400).send({ error: 'this version belongs to another video' });
    return listVersionReviews(pool, version);
  });

  app.get('/api/videos/:id/versions', async (req, reply) => {
    const v = isUuid(id(req)) ? await getVideoView(pool, id(req)) : null;
    if (!v) return reply.code(404).send({ error: 'not found' });
    return listVersions(pool, v.id);
  });

  app.get('/api/runs/:id', async (req, reply) => {
    const r = isUuid(id(req)) ? await getRunView(pool, id(req)) : null;
    return r ?? reply.code(404).send({ error: 'not found' });
  });

  app.post('/api/runs/:id/cancel', async (req, reply) => {
    const r = isUuid(id(req)) ? await getRun(pool, id(req)) : null;
    if (!r) return reply.code(404).send({ error: 'not found' });
    if (r.status !== 'queued' && r.status !== 'running') return reply.code(409).send({ error: 'the run is not active' });
    await appendAudit(pool, { actorType: 'user', action: 'run.cancel_requested', runId: r.id, subjectType: 'video', subjectId: r.videoId });
    await sendCommand(pool, { type: 'run.cancel', runId: r.id });
    return reply.code(202).send({ accepted: true });
  });

  app.get('/api/artifacts/:id', async (req, reply) => {
    const a = isUuid(id(req)) ? await getArtifact(pool, id(req)) : null;
    return a ?? reply.code(404).send({ error: 'not found' });
  });
}
