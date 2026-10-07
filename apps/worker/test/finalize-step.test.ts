import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { STOP_NOTE, formatScore } from '@videogen/shared';
import { appendAudit, getVideoView, insertArtifact, insertVersion, recordReviewRound } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { labelOf } from '../src/pipeline/fix-round.ts';
import { finalizeExecutor } from '../src/pipeline/finalize-step.ts';
import { fixVersionId, reviewExecutor } from '../src/pipeline/review-step.ts';
import { panelHarness } from './final-helpers.ts';

const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const best = async (videoId: string) => (await t.pool.query('SELECT best_version_id FROM videos WHERE id = $1', [videoId])).rows[0].best_version_id as string | null;
const count = async (runId: string, where: string, args: unknown[] = []) => (await t.pool.query(`SELECT count(*)::int AS n FROM ${where}`, [runId, ...args])).rows[0].n as number;

interface Round { total: number | null; verdict: 'ready' | 'fix' | 'rework'; failed: string[]; regressed?: string[] }
/** A run with finished review rounds recorded straight into the tables (one version row per round, round 0 = the run's own). */
async function seed(name: string, rounds: Round[]) {
  const h = panelHarness(t);
  cleanups.push(() => h.stop());
  const p = await h.prepare(name);
  const ids: string[] = [];
  for (const [round, r] of rounds.entries()) {
    const versionId = round === 0 ? p.r.versionId : fixVersionId(p.r.runId, round);
    if (round > 0) await insertVersion(t.pool, { id: versionId, videoId: p.r.videoId, parentVersionId: ids[round - 1]!, round, reason: 'fix:compose' });
    ids.push(versionId);
    await recordReviewRound(t.pool, {
      runId: p.r.runId, round, versionId, fixed: [],
      rows: [
        { reviewerRole: 'orchestrator', seq: 1, rubricVersion: 'final@1', total: r.total, verdict: r.verdict, findings: [] },
        { reviewerRole: 'reviewer_visual', seq: 1, rubricVersion: 'final@1', findings: r.failed.map((id) => ({ checkId: id, severity: 'major', status: r.regressed?.includes(id) ? 'regressed' as const : 'open' as const })) },
      ],
    });
  }
  const ex = finalizeExecutor(h.deps);
  const c = p.ctx('finalize');
  const run = async () => ex.run(c, await ex.inputHash(c));
  return { h, p, ids, run, ex, c };
}

describe('finalize step (plan T9)', () => {
  it('ready → best version, finish artifact, frames deleted, outcome done "Yayına hazır · 87,5 puan"', async () => {
    const h = panelHarness(t);
    cleanups.push(() => h.stop());
    const p = await h.prepare('Tükenmez kalem');
    const rv = reviewExecutor(h.deps);
    const rc = p.ctx('review');
    expect(await rv.run(rc, await rv.inputHash(rc))).toEqual({ status: 'done', note: 'Yayına hazır: 87,5 puan' });
    const frames = join(p.runDir, 'final', 'abc123', 'frames');
    mkdirSync(frames, { recursive: true });
    writeFileSync(join(frames, 'f00001.png'), 'x');

    const ex = finalizeExecutor(h.deps);
    expect(ex.key).toBe('finalize');
    expect(ex.resource).toBe('heavy_cpu');
    const c = p.ctx('finalize');
    const hash = await ex.inputHash(c);
    expect(await ex.run(c, hash)).toEqual({ status: 'done', note: 'Yayına hazır · 87,5 puan' });
    expect(await best(p.r.videoId)).toBe(p.r.versionId);
    const fin = (await t.pool.query("SELECT content, input_hash FROM artifacts WHERE run_id = $1 AND kind = 'finish'", [p.r.runId])).rows;
    expect(fin).toHaveLength(1);
    expect(fin[0].input_hash).toBe(hash);
    expect(fin[0].content).toEqual({ bestVersionId: p.r.versionId, round: 0, total: 87.5, verdict: 'ready', stop: null, openFindings: ['d7_bitrate'], aigcLabel: false });
    expect(existsSync(frames)).toBe(false);
    expect(await count(p.r.runId, "audit_log WHERE run_id = $1 AND action = 'frames.deleted'")).toBe(1);

    // a stored finish of the same hash decides the same, writes nothing twice
    expect(await ex.run(c, hash)).toEqual({ status: 'done', note: 'Yayına hazır · 87,5 puan' });
    expect(await count(p.r.runId, "artifacts WHERE run_id = $1 AND kind = 'finish'")).toBe(1);
    expect(await count(p.r.runId, "audit_log WHERE run_id = $1 AND action = 'frames.deleted'")).toBe(1);

    // H8: a cloned narrator voice ships with the AI label: the flag is on the finish and the note says so. The track is the one the BEST version's
    // music final was mixed with, not the newest one (a later round's preset track).
    const clone = await seed('Klon ses', [{ total: 85, verdict: 'ready', failed: [] }]);
    const track = (voice: object, stem: string) => insertArtifact(t.pool, { runId: clone.p.r.runId, kind: 'voice_track', inputHash: `vt-${stem}`, meta: { stemSha: stem }, content: { ...fx('voice-track-kalem'), provider: { engine: 'chatterbox', model: 'm', voice, aigc_label: true } } });
    await insertArtifact(t.pool, { runId: clone.p.r.runId, kind: 'final_video_music', versionId: clone.p.r.versionId, inputHash: 'c-best', meta: { voiceStemSha: 'stem-clone' } });
    await track({ kind: 'clone', asset_id: '6b0f6f0e-65c0-4d3c-9d5e-3b1d2f4a7c11' }, 'stem-clone');
    await track({ kind: 'preset', id: 'hazir' }, 'stem-newer');
    expect(await clone.run()).toEqual({ status: 'done', note: `Yayına hazır · ${formatScore(85)} puan · AI etiketi zorunlu (klon ses)` });
    expect((await t.pool.query("SELECT content FROM artifacts WHERE run_id = $1 AND kind = 'finish'", [clone.p.r.runId])).rows[0].content).toMatchObject({ aigcLabel: true });
    // a G4 stop: needs_human with its reason; the gate finding is not an open check
    const decl = await seed('Beyan eksik', [{ total: 85, verdict: 'fix', failed: [] }]);
    await appendAudit(t.pool, { actorType: 'orchestrator', action: 'loop.stop', runId: decl.p.r.runId, data: { reason: 'declaration', fixRound: 0, verdict: 'fix', total: 85 } });
    expect(await decl.run()).toMatchObject({ status: 'needs_human', reason: expect.stringContaining(`${STOP_NOTE.declaration}: en iyi sürüm tur 0`) });
  }, 180_000);

  it('needs_human after the limit with the best non-regressed round and open findings; the oscillation and unchanged reasons; the library shows the best round', async () => {
    // Limit: round 2 scored highest but regressed; round 1 is the best clean one. Six open findings: at most five labels.
    const six = ['text_readable', 'hook_frame0', 'hook_pattern', 'mechanism_shot', 'parts_visible', 'text_dwell'];
    const a = await seed('Tükenmez kalem sınır', [
      { total: 70, verdict: 'fix', failed: ['text_readable'] },
      { total: 76, verdict: 'fix', failed: six },
      { total: 79, verdict: 'fix', failed: ['hook_frame0'], regressed: ['hook_frame0'] },
      { total: 74, verdict: 'fix', failed: ['hook_pattern'] },
    ]);
    const out = await a.run();
    expect(out).toMatchObject({ status: 'needs_human', reason: expect.stringContaining(`${STOP_NOTE.limit}: en iyi sürüm tur 1 (${formatScore(76)} puan)`) });
    const reason = (out as { reason: string }).reason;
    expect(reason).toContain(`Açık bulgular: ${six.slice(0, 5).map(labelOf).join(', ')}`);
    expect(reason).not.toContain(labelOf(six[5]!));
    expect(reason).toMatch(/Videoyu chat'ten sürdürebilirsiniz\.$/);
    expect(await best(a.p.r.videoId)).toBe(a.ids[1]);
    expect((await getVideoView(t.pool, a.p.r.videoId))!.score).toBe(76);
    expect((await t.pool.query("SELECT content FROM artifacts WHERE run_id = $1 AND kind = 'finish'", [a.p.r.runId])).rows[0].content)
      .toMatchObject({ bestVersionId: a.ids[1], round: 1, total: 76, verdict: 'fix', stop: 'limit', openFindings: six });
    expect(await a.run()).toEqual(out);

    // Oscillation: read from the latest final_verdict.
    const b = await seed('Tükenmez kalem salınım', [{ total: 78, verdict: 'fix', failed: ['hook_frame0'] }, { total: 77, verdict: 'fix', failed: ['hook_frame0'] }]);
    await insertArtifact(t.pool, { runId: b.p.r.runId, kind: 'final_verdict', content: { verdict: 'fix', total: 77, oscillating: ['hook_frame0'], failed: ['hook_frame0'], dimensions: {} }, inputHash: 'v1', meta: { fixRound: 1, verdict: 'fix' } });
    expect(await b.run()).toMatchObject({ status: 'needs_human', reason: expect.stringContaining(`${STOP_NOTE.oscillation}: en iyi sürüm tur 0 (${formatScore(78)} puan)`) });
    expect(await best(b.p.r.videoId)).toBe(b.ids[0]);

    // Unchanged: the round's fix report says the fixer changed nothing.
    const u = await seed('Tükenmez kalem değişmez', [{ total: 72, verdict: 'fix', failed: ['text_readable'] }]);
    await insertArtifact(t.pool, { runId: u.p.r.runId, kind: 'final_verdict', content: { verdict: 'fix', total: 72, oscillating: [], failed: ['text_readable'], dimensions: {} }, inputHash: 'v0', meta: { fixRound: 0, verdict: 'fix' } });
    await insertArtifact(t.pool, { runId: u.p.r.runId, kind: 'fix_report', content: {}, inputHash: 'v0', meta: { fixRound: 0, scope: 'none' } });
    expect(await u.run()).toMatchObject({ status: 'needs_human', reason: expect.stringContaining(`${STOP_NOTE.unchanged}: en iyi sürüm tur 0 (${formatScore(72)} puan)`) });

    // Usage / no fixer: the review step audited the stop; it wins over what the artifacts suggest.
    const g = await seed('Tükenmez kalem kullanım', [{ total: 75, verdict: 'fix', failed: ['text_readable'] }]);
    await appendAudit(t.pool, { actorType: 'orchestrator', action: 'loop.stop', runId: g.p.r.runId, data: { reason: 'usage', fixRound: 0, verdict: 'fix', total: 75 } });
    expect(await g.run()).toMatchObject({ status: 'needs_human', reason: expect.stringContaining(`${STOP_NOTE.usage}: en iyi sürüm tur 0 (${formatScore(75)} puan)`) });

    // A round whose AUTO gate failed has no total: it never beats a scored round.
    const n = await seed('Tükenmez kalem otomatik', [{ total: null, verdict: 'fix', failed: ['g1_color'] }, { total: 71, verdict: 'fix', failed: ['text_readable'] }]);
    expect(await n.run()).toMatchObject({ status: 'needs_human', reason: expect.stringContaining('en iyi sürüm tur 1') });
  }, 180_000);
});
