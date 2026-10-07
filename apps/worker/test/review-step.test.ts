import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { averageVisual, FinalReviewSchema, panelScore, STOP_NOTE, type FinalReview, type ProductResearch, type Storyboard } from '@videogen/shared';
import { insertArtifact, insertVersion, latestArtifact, listRunReviews, recordReviewRound } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { LIMIT_NOTE } from '../src/pipeline/orchestrator.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { webCheckTargets } from '../src/pipeline/review-inputs.ts';
import { fixVersionId, reviewExecutor, type FixerRun } from '../src/pipeline/review-step.ts';
import { panelHarness, qcReportFailing } from './final-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
function setup() {
  const h = panelHarness(t);
  cleanups.push(() => h.stop());
  return h;
}
/** A stalled sibling must not hang the suite: fail with a clear message instead. */
const within = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> => Promise.race([p, new Promise<never>((_, rej) => { setTimeout(() => rej(new Error(msg)), ms).unref(); })]);
const stall = (structured: unknown) => ({ fixture: 'basic' as const, structured, stall: { afterIndex: 1, ms: 600_000, cpuPct: 20 } });
const auditCount = async (runId: string, action: string) => (await t.pool.query('SELECT count(*)::int AS n FROM audit_log WHERE run_id = $1 AND action = $2', [runId, action])).rows[0].n as number;
const stored = async (runId: string, kind: string) => (await latestArtifact(t.pool, runId, kind))!;

describe('review step (final panel)', () => {
  it('ready: three reviewers in one fan-out, the panel score from checks + qc, reviews/findings rows and the final_verdict; the note says Yayına hazır', async () => {
    const h = setup();
    const p = await h.prepare('Tükenmez kalem');
    const ex = reviewExecutor(h.deps);
    const c = p.ctx('review');
    expect(await ex.run(c, await ex.inputHash(c))).toEqual({ status: 'done', note: 'Yayına hazır: 87,5 puan' });
    expect(await h.sessionRoles(c.stepId)).toEqual(['reviewer_facts', 'reviewer_retention', 'reviewer_visual']);
    const facts = h.specs.find((s) => s.role === 'reviewer_facts')!;
    const targets = webCheckTargets(fx('research-kalem') as ProductResearch, fx('storyboard-kalem') as Storyboard, `${p.r.runId}:0`);
    expect(targets.length).toBeGreaterThan(0);
    for (const x of targets) expect(facts.prompt).toContain(x.url);
    expect(facts.prompt).toContain('- claims_verified (kapı G2)');
    const rows = await listRunReviews(t.pool, p.r.runId);
    expect(rows.map((r) => [r.reviewerRole, r.seq, r.round])).toEqual([['orchestrator', 1, 0], ['reviewer_facts', 1, 0], ['reviewer_retention', 1, 0], ['reviewer_visual', 1, 0]]);
    expect(rows[0]).toMatchObject({ total: 87.5, verdict: 'ready', stepId: c.stepId, versionId: p.r.versionId });
    expect(rows[0]!.dimensionScores).toMatchObject({ D1: 13, D6: 12, D7: 4 });
    expect(rows[0]!.gates).toEqual({ G1: true, G2: true, G3: true, G4: true, G5: true, G6: true });
    const verdict = await stored(p.r.runId, 'final_verdict');
    expect(verdict.content).toMatchObject({ verdict: 'ready', total: 87.5, low: [], failed: ['d7_bitrate'], regressed: [], fixed: [], oscillating: [] });
    expect(verdict.meta).toMatchObject({ fixRound: 0 });
    for (const k of ['final_review_visual', 'final_review_facts', 'final_review_retention']) expect(FinalReviewSchema.safeParse((await stored(p.r.runId, k)).content).success, k).toBe(true);
    expect((await t.pool.query("SELECT meta FROM artifacts WHERE run_id = $1 AND kind = 'final_review_sheet' ORDER BY meta->>'kind'", [p.r.runId])).rows.map((x) => x.meta.kind)).toEqual(['hook', 'main']);
    for (const role of ['reviewer_visual', 'reviewer_facts', 'reviewer_retention'] as const) expect(h.deps.reviews!.get(c.stepId, role)).toBeUndefined();
    expect(await auditCount(p.r.runId, 'review.verdict')).toBe(1);

    // A numeric claim of the video without a rule-satisfying source fails G2 deterministically, whatever the reviewer said; the finding sits on
    // the orchestrator row with the first frame of the claim's beat as evidence.
    const g = setup();
    const q = await g.prepare('Tükenmez kalem');
    const research = fx('research-kalem') as ProductResearch;
    const board = fx('storyboard-kalem') as Storyboard;
    research.claims = research.claims.map((x) => (x.id === 'bilye-capi' ? { ...x, sources: [{ ...x.sources[0]!, type: 'independent' as const }] } : x));
    await insertArtifact(t.pool, { runId: q.r.runId, kind: 'research', content: research });
    const beat = board.beats.find((b) => b.claim_ids.includes('bilye-capi'))!;
    g.deps.fakeScript = (role, ctx, n, extra) => {
      const sc = fakePipelineScript(role, ctx, n, extra);
      if (role !== 'reviewer_facts') return sc;
      return { ...sc, structured: { ...(sc.structured as FinalReview), web_checks: webCheckTargets(research, board, `${ctx.runId}:0`).map((x) => ({ claim_id: x.claim_id, url: x.url, reachable: true, supports: true })) } };
    };
    const ex2 = reviewExecutor(g.deps);
    const c2 = q.ctx('review');
    expect(await ex2.run(c2, await ex2.inputHash(c2))).toEqual({ status: 'done', note: `${STOP_NOTE.no_fixer}: 87,5 puan` });
    const rows2 = await listRunReviews(t.pool, q.r.runId);
    expect(rows2[0]).toMatchObject({ total: 87.5, verdict: 'fix' });
    expect(rows2[0]!.gates).toMatchObject({ G2: false });
    expect(rows2[0]!.findings.filter((f) => f.checkId === 'claims_verified').map((f) => [f.gate, f.evidence])).toEqual([['G2', { frame: Math.round(beat.t_start * 30), timecode: Math.round(beat.t_start * 100) / 100 }]]);
    expect(rows2.find((r) => r.reviewerRole === 'reviewer_facts')!.findings).toEqual([]);
    expect((await stored(q.r.runId, 'final_verdict')).content).toMatchObject({ verdict: 'fix', failed: expect.arrayContaining(['claims_verified']) });
  }, 120_000);

  it('a usage block holds the whole fan-out (waiting_limit with the reason) and starts all three when it clears', async () => {
    const h = setup();
    let open = false;
    h.deps.gate = { allowsNewPipeline: () => open, resumeAt: () => null };
    const p = await h.prepare('Tükenmez kalem');
    const statuses: [string, string | null | undefined][] = [];
    // A failed assertion must not leak the polling loop: the cleanup opens the gate and aborts the run.
    const ac = new AbortController();
    cleanups.push(() => { open = true; ac.abort(); });
    const c = p.ctx('review', { signal: ac.signal, status: (s, n) => { statuses.push([s, n]); } });
    const ex = reviewExecutor(h.deps, { pollMs: 20 });
    const done = ex.run(c, await ex.inputHash(c));
    await vi.waitFor(() => expect(statuses[0]).toEqual(['waiting_limit', LIMIT_NOTE(null)]));
    await new Promise((r) => setTimeout(r, 150));
    expect(await h.sessionRoles(c.stepId)).toEqual([]);
    expect(h.deps.reviews!.get(c.stepId, 'reviewer_visual')).toBeUndefined();
    open = true;
    expect(await done).toEqual({ status: 'done', note: 'Yayına hazır: 87,5 puan' });
    expect(await h.sessionRoles(c.stepId)).toEqual(['reviewer_facts', 'reviewer_retention', 'reviewer_visual']);
    expect(statuses.some(([s]) => s === 'running')).toBe(true);
    expect(statuses.at(-1)![0]).not.toBe('waiting_limit');

    // The run is cancelled while the gate is closed: the step is cancelled, nothing was started or left registered.
    open = false;
    const q = await h.prepare('Tükenmez kalem');
    const ac2 = new AbortController();
    cleanups.push(() => ac2.abort());
    const waits: string[] = [];
    const c2 = q.ctx('review', { signal: ac2.signal, status: (s) => { waits.push(s); } });
    const held = ex.run(c2, await ex.inputHash(c2));
    await vi.waitFor(() => expect(waits[0]).toBe('waiting_limit'));
    ac2.abort();
    expect(await within(held, 5000, 'the closed gate did not release on abort')).toEqual({ status: 'cancelled' });
    expect(await h.sessionRoles(c2.stepId)).toEqual([]);
    for (const role of ['reviewer_visual', 'reviewer_facts', 'reviewer_retention'] as const) expect(h.deps.reviews!.get(c2.stepId, role)).toBeUndefined();
  }, 120_000);

  it('restart mid-panel: stored reviewer outputs are reused, only the missing role opens a session; a replay of the round gives the same verdict without sessions', async () => {
    const h = setup();
    const p = await h.prepare('Tükenmez kalem');
    const ex = reviewExecutor(h.deps);
    const c = p.ctx('review');
    const hash = await ex.inputHash(c);
    const first = await ex.run(c, hash);
    expect(first).toEqual({ status: 'done', note: 'Yayına hazır: 87,5 puan' });
    expect(await h.sessionRoles(c.stepId)).toHaveLength(3);
    const sheets = async () => (await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE run_id = $1 AND kind = 'final_review_sheet'", [p.r.runId])).rows[0].n as number;
    expect(await sheets()).toBe(2);
    // The worker died after two reviewers were stored but before the third and the verdict: forget those two.
    await t.pool.query("DELETE FROM artifacts WHERE run_id = $1 AND kind IN ('final_review_retention', 'final_verdict')", [p.r.runId]);
    const again = p.ctx('review', { attempt: 2 });
    expect(await ex.run(again, hash)).toEqual(first);
    expect(await h.sessionRoles(c.stepId)).toEqual(['reviewer_facts', 'reviewer_retention', 'reviewer_retention', 'reviewer_visual']);
    expect(h.specs.at(-1)).toMatchObject({ role: 'reviewer_retention', resume: true });
    expect(await auditCount(p.r.runId, 'review.recorded')).toBe(1);
    expect((await listRunReviews(t.pool, p.r.runId))).toHaveLength(4);
    expect(await sheets()).toBe(2); // the restart found its sheets
    // Everything stored: the decision is made again without a session.
    expect(await ex.run(p.ctx('review', { attempt: 3 }), hash)).toEqual(first);
    expect(await h.sessionRoles(c.stepId)).toHaveLength(4);
    expect((await listRunReviews(t.pool, p.r.runId))).toHaveLength(4);

    // Fix round 1: the step still carries the round-0 sessions, but a restart (attempt 2) never resumes a session of an earlier round.
    const before = h.specs.length;
    await insertVersion(t.pool, { id: fixVersionId(p.r.runId, 1), videoId: p.r.videoId, parentVersionId: p.r.versionId, round: 1, reason: 'fix:pending' });
    const c1 = p.ctx('review', { fixRound: 1, attempt: 2 });
    expect(await ex.run(c1, await ex.inputHash(c1))).toEqual(first);
    const fresh = h.specs.slice(before);
    expect(fresh.map((x) => x.role).sort()).toEqual(['reviewer_facts', 'reviewer_retention', 'reviewer_visual']);
    expect(fresh.every((x) => !x.resume)).toBe(true);
  }, 120_000);

  it('failed qc gate: no reviewer runs; the round is recorded with total null and the verdict fix; without a fixer the step stops (no_fixer)', async () => {
    const h = setup();
    const p = await h.prepare('Tükenmez kalem', { qc: ['g6_layout'] });
    const ex = reviewExecutor(h.deps);
    const c = p.ctx('review');
    expect(await ex.run(c, await ex.inputHash(c))).toEqual({ status: 'done', note: STOP_NOTE.no_fixer });
    expect(await h.sessionRoles(c.stepId)).toEqual([]);
    expect(h.deps.reviews!.get(c.stepId, 'reviewer_visual')).toBeUndefined();
    const rows = await listRunReviews(t.pool, p.r.runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reviewerRole: 'orchestrator', total: null, verdict: 'fix' });
    expect(rows[0]!.gates).toMatchObject({ G1: true, G6: false });
    expect(rows[0]!.findings.map((f) => [f.checkId, f.gate, f.status])).toEqual([['g6_layout', 'G6', 'open']]);
    expect((await stored(p.r.runId, 'final_verdict')).content).toMatchObject({ verdict: 'fix', total: null, failed: ['g6_layout'] });
    const stop = (await t.pool.query("SELECT data FROM audit_log WHERE run_id = $1 AND action = 'loop.stop'", [p.r.runId])).rows;
    expect(stop.map((x) => x.data)).toEqual([expect.objectContaining({ reason: 'no_fixer', fixRound: 0, verdict: 'fix' })]);
    // A replay of the stored verdict decides again and does not audit the stop twice.
    expect(await ex.run(c, await ex.inputHash(c))).toEqual({ status: 'done', note: STOP_NOTE.no_fixer });
    expect(await auditCount(p.r.runId, 'loop.stop')).toBe(1);
    // F15: with the usage guard closed no new fix round starts (stop usage, ahead of no_fixer); nothing is spent either.
    h.deps.gate = { allowsNewPipeline: () => false, resumeAt: () => null };
    const u = await h.prepare('Tükenmez kalem', { qc: ['g6_layout'] });
    const cu = u.ctx('review');
    expect(await ex.run(cu, await ex.inputHash(cu))).toEqual({ status: 'done', note: STOP_NOTE.usage });
    expect(await h.sessionRoles(cu.stepId)).toEqual([]);
  }, 120_000);

  it('borderline 78–82: a second, independent reviewer_visual runs once and the scores are averaged', async () => {
    const h = setup();
    const p = await h.prepare('Tükenmez kalem sınırda');
    const ex = reviewExecutor(h.deps);
    const c = p.ctx('review');
    const out = await ex.run(c, await ex.inputHash(c));
    expect(await h.sessionRoles(c.stepId)).toEqual(['reviewer_facts', 'reviewer_retention', 'reviewer_visual', 'reviewer_visual']);
    const visual = h.specs.filter((s) => s.role === 'reviewer_visual');
    expect(visual).toHaveLength(2);
    expect(visual.every((s) => !s.resume)).toBe(true);
    const rows = await listRunReviews(t.pool, p.r.runId);
    expect(rows.map((r) => [r.reviewerRole, r.seq])).toEqual([['orchestrator', 1], ['reviewer_facts', 1], ['reviewer_retention', 1], ['reviewer_visual', 1], ['reviewer_visual', 2]]);
    // The merged panel is the deterministic average of the two stored visual reviews.
    const one = (await stored(p.r.runId, 'final_review_visual')).content as FinalReview;
    const two = (await stored(p.r.runId, 'final_review_visual2')).content as FinalReview;
    const first = panelScore({ qc: qcReportFailing(), reviews: { reviewer_visual: one, reviewer_facts: (await stored(p.r.runId, 'final_review_facts')).content as FinalReview, reviewer_retention: (await stored(p.r.runId, 'final_review_retention')).content as FinalReview }, g4: true });
    expect(first.total).toBeGreaterThanOrEqual(78);
    expect(first.total).toBeLessThanOrEqual(82);
    const merged = panelScore({ qc: qcReportFailing(), reviews: { reviewer_visual: averageVisual(one, two), reviewer_facts: (await stored(p.r.runId, 'final_review_facts')).content as FinalReview, reviewer_retention: (await stored(p.r.runId, 'final_review_retention')).content as FinalReview }, g4: true });
    expect(merged.total).toBeGreaterThan(80);
    expect(rows[0]).toMatchObject({ total: merged.total, verdict: 'ready' });
    expect(out).toEqual({ status: 'done', note: expect.stringMatching(/^Yayına hazır: \d\d,\d puan$/) });
    // A restart does not open a third visual session: the second review is stored.
    await t.pool.query("DELETE FROM artifacts WHERE run_id = $1 AND kind = 'final_verdict'", [p.r.runId]);
    expect(await ex.run(p.ctx('review', { attempt: 2 }), await ex.inputHash(c))).toEqual(out);
    expect((await h.sessionRoles(c.stepId)).filter((r) => r === 'reviewer_visual')).toHaveLength(2);

    // The average decides what history and the fixer see: the seq-1 visual row carries the MERGED findings, the seq-2 row and the artifacts stay raw.
    // First pass: parts_visible fails (0.4), the second review gives 1 → the average (0.7) passes it. Second review: materials (0.2 → 0.45) and the
    // G3 gate check fail while the first review passed them → they fail in the merged result.
    const g = setup();
    const second = fx('final-review-visual-pass') as FinalReview;
    const bad = (id: string, frame: number, hint: string) => ({ id, pass: false, score: 0.2, evidence: { frame, timecode: Math.round((frame / 30) * 100) / 100 }, fix_hint: hint });
    second.checks = second.checks.map((x) => (x.id === 'materials' ? bad('materials', 20, 'Malzemeyi düzelt') : x.id === 'no_third_party' ? bad('no_third_party', 10, 'Logoyu kaldır') : x) as FinalReview['checks'][number]);
    g.deps.fakeScript = (role, ctx, n, extra) => {
      const sc = fakePipelineScript(role, ctx, n, extra);
      if (role !== 'reviewer_visual') return sc;
      if (extra?.seq === 2) return { ...sc, structured: second };
      const r = sc.structured as FinalReview;
      return { ...sc, structured: { ...r, checks: r.checks.map((x) => (x.id === 'parts_visible' ? bad('parts_visible', 30, 'Parçalar görünsün') : { ...x })) } };
    };
    const seen: Parameters<FixerRun>[2][] = [];
    g.deps.fixer = async (_d, _c, input) => { seen.push(input); return { status: 'done', note: 'fixer stub' }; };
    const q = await g.prepare('Tükenmez kalem sınırda');
    const exg = reviewExecutor(g.deps);
    const cg = q.ctx('review');
    expect(await exg.run(cg, await exg.inputHash(cg))).toEqual({ status: 'done', note: 'fixer stub' });
    const rowsG = await listRunReviews(t.pool, q.r.runId);
    const ids = (role: string, seq: number) => rowsG.find((r) => r.reviewerRole === role && r.seq === seq)!.findings.map((f) => f.checkId).sort();
    expect(ids('reviewer_visual', 1)).toEqual(['materials', 'no_third_party']); // not parts_visible (rescued by the average)
    expect(rowsG.find((r) => r.reviewerRole === 'reviewer_visual' && r.seq === 1)!.findings.find((f) => f.checkId === 'materials')).toMatchObject({ fixHint: 'Malzemeyi düzelt', evidence: { frame: 20 } });
    expect(ids('reviewer_visual', 2)).toEqual(['materials', 'no_third_party']); // raw
    const raw1 = (await stored(q.r.runId, 'final_review_visual')).content as FinalReview;
    expect(raw1.checks.find((x) => x.id === 'parts_visible')).toMatchObject({ pass: false });
    expect(raw1.checks.find((x) => x.id === 'materials')).toMatchObject({ pass: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ round: 1, verdict: 'fix', versionId: fixVersionId(q.r.runId, 1) });
    expect(seen[0]!.findings.map((f) => f.check_id).sort()).toEqual(['d7_bitrate', 'materials', 'no_third_party']);
    expect(seen[0]!.findings.find((f) => f.check_id === 'no_third_party')).toMatchObject({ fix_hint: 'Logoyu kaldır' });
  }, 120_000);

  it('rework below 70 rewinds to storyboard in the final loop with a new version; at fixRound 3 it stops with the limit note; F→P→F stops early', async () => {
    const h = setup();
    const ex = reviewExecutor(h.deps);
    // vasat: every score 0.55 in round 0 → under 70 → rework with the round-1 version row (deterministic id, parent = the current version).
    const a = await h.prepare('Tükenmez kalem vasat');
    const ca = a.ctx('review');
    const out = await ex.run(ca, await ex.inputHash(ca));
    const id = fixVersionId(a.r.runId, 1);
    expect(out).toEqual({ status: 'rewind', to: 'storyboard', loop: 'final', reason: expect.stringMatching(/^puan < 70/), version: { id, reason: 'fix:rework' } });
    expect((await listRunReviews(t.pool, a.r.runId))[0]).toMatchObject({ verdict: 'rework' });
    expect((await listRunReviews(t.pool, a.r.runId))[0]!.total).toBeLessThan(70);
    const versions = async () => (await t.pool.query('SELECT id, parent_version_id, round, reason FROM versions WHERE video_id = $1 ORDER BY round', [a.r.videoId])).rows;
    expect(await versions()).toEqual([expect.objectContaining({ round: 0 }), { id, parent_version_id: a.r.versionId, round: 1, reason: 'fix:pending' }]);
    // A replay (the rewind did not commit) reuses the row.
    expect(await ex.run(a.ctx('review', { attempt: 2 }), await ex.inputHash(ca))).toEqual(out);
    expect(await versions()).toHaveLength(2);
    expect(fixVersionId(a.r.runId, 1)).toBe(id);
    expect(fixVersionId(a.r.runId, 2)).not.toBe(id);

    // fixRound 3 and still failing (değişmez): the round limit stops the loop, the step is done with the reason.
    const b = await h.prepare('Tükenmez kalem değişmez');
    const cb = b.ctx('review', { fixRound: 3 });
    const stop = await ex.run(cb, await ex.inputHash(cb));
    expect(stop).toEqual({ status: 'done', note: expect.stringContaining(STOP_NOTE.limit) });
    expect((await listRunReviews(t.pool, b.r.runId))[0]).toMatchObject({ round: 3, verdict: 'fix' });
    expect(((await t.pool.query('SELECT 1 FROM versions WHERE video_id = $1 AND round > 0', [b.r.videoId])).rowCount)).toBe(0);

    // dengesiz: hook_frame0 and hook_pattern fail in rounds 0 and 2 and pass in round 1 → fail, pass, fail stops the loop.
    const d = await h.prepare('Tükenmez kalem dengesiz');
    const seed = (round: number, failing: boolean) => recordReviewRound(t.pool, {
      runId: d.r.runId, round, versionId: null, fixed: round === 1 ? ['hook_frame0', 'hook_pattern'] : [],
      rows: [
        { reviewerRole: 'orchestrator', seq: 1, rubricVersion: 'final@1', total: 78, verdict: 'fix', findings: [] },
        { reviewerRole: 'reviewer_visual', seq: 1, rubricVersion: 'final@1', findings: [] },
        { reviewerRole: 'reviewer_facts', seq: 1, rubricVersion: 'final@1', findings: [] },
        { reviewerRole: 'reviewer_retention', seq: 1, rubricVersion: 'final@1', findings: failing ? [{ checkId: 'hook_frame0', severity: 'blocker', dimension: 'D1' }, { checkId: 'hook_pattern', severity: 'major', dimension: 'D1' }] : [] },
      ],
    });
    await seed(0, true);
    await seed(1, false);
    const cd = d.ctx('review', { fixRound: 2 });
    expect(await ex.run(cd, await ex.inputHash(cd))).toEqual({ status: 'done', note: expect.stringContaining(STOP_NOTE.oscillation) });
    expect((await stored(d.r.runId, 'final_verdict')).content).toMatchObject({ verdict: 'fix', regressed: expect.arrayContaining(['hook_frame0', 'hook_pattern']), oscillating: expect.arrayContaining(['hook_frame0', 'hook_pattern']), fixed: [] });
    const round2 = (await listRunReviews(t.pool, d.r.runId)).find((r) => r.round === 2 && r.reviewerRole === 'reviewer_retention')!;
    expect(round2.findings.map((f) => [f.checkId, f.status])).toEqual([['hook_frame0', 'regressed'], ['hook_pattern', 'regressed']]);
    const old = (await listRunReviews(t.pool, d.r.runId)).find((r) => r.round === 0 && r.reviewerRole === 'reviewer_retention')!;
    expect(old.findings.every((f) => f.status === 'fixed')).toBe(true);
  }, 180_000);

  it('contract breaches go back to the same reviewer session at most twice; a stale final is never reviewed', async () => {
    // A failure without evidence breaks the contract; the retention reviewer stalls and must be cancelled when its sibling fails.
    const bad = fx('final-review-visual-fix') as FinalReview;
    bad.checks = bad.checks.map((c) => (c.id === 'text_readable' ? { id: c.id, pass: false, score: 0.3 } : c));
    const h = setup();
    h.deps.fakeScript = (role, ctx, n, extra) => (role === 'reviewer_visual' ? { fixture: 'basic', structured: bad }
      : role === 'reviewer_retention' ? stall(fx('final-review-retention-pass'))
        : fakePipelineScript(role, ctx, n, extra));
    const p = await h.prepare('Tükenmez kalem');
    const ex = reviewExecutor(h.deps);
    const c = p.ctx('review');
    const out = await within(ex.run(c, await ex.inputHash(c)), 30_000, 'the stalled retention sibling was not cancelled when the visual reviewer failed');
    expect(out).toMatchObject({ status: 'failed', retry: false, error: expect.stringMatching(/^görsel reviewer: .*kanıt/) });
    const visual = h.specs.filter((s) => s.role === 'reviewer_visual');
    expect(visual).toHaveLength(3);
    expect(visual.slice(1).every((s) => s.resume && s.prompt.startsWith('Yapılandırılmış çıktın doğrulamadan geçmedi'))).toBe(true);
    const retention = (await t.pool.query("SELECT status FROM agent_sessions WHERE step_id = $1 AND role = 'reviewer_retention'", [c.stepId])).rows;
    expect(retention).toHaveLength(1);
    expect(retention[0].status).toBe('cancelled');
    expect(await listRunReviews(t.pool, p.r.runId)).toEqual([]);
    expect(await latestArtifact(t.pool, p.r.runId, 'final_verdict')).toBeNull();
    expect(h.deps.reviews!.get(c.stepId, 'reviewer_visual')).toBeUndefined();

    // A web target that was not checked is a breach too (facts), and goes back the same way.
    const g = setup();
    g.deps.fakeScript = (role, ctx, n, extra) => {
      const s = fakePipelineScript(role, ctx, n, extra);
      if (role !== 'reviewer_facts') return s;
      const r = s.structured as FinalReview;
      return { ...s, structured: { ...r, web_checks: r.web_checks!.slice(1) } };
    };
    const q = await g.prepare('Tükenmez kalem');
    const exq = reviewExecutor(g.deps);
    const cq = q.ctx('review');
    expect(await exq.run(cq, await exq.inputHash(cq))).toMatchObject({ status: 'failed', error: expect.stringMatching(/^doğruluk reviewer: .*hedef kontrol edilmedi/) });
    expect(g.specs.filter((s) => s.role === 'reviewer_facts')).toHaveLength(3);

    // Stale: the scene changed after the compose → no budget is spent; same for a qc report of another music.
    const s = setup();
    const st = await s.prepare('Tükenmez kalem');
    const scene = fx('scene-kalem');
    scene.camera_keys[0].lens_mm += 5;
    await insertArtifact(t.pool, { runId: st.r.runId, kind: 'scene', content: scene });
    const exs = reviewExecutor(s.deps);
    const cs = st.ctx('review');
    expect(await exs.run(cs, await exs.inputHash(cs))).toEqual({ status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    const o = await s.prepare('Tükenmez kalem', { musicShaInQc: 'f'.repeat(64) });
    const co = o.ctx('review');
    expect(await exs.run(co, await exs.inputHash(co))).toEqual({ status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    expect(s.specs).toHaveLength(0);
    expect(await listRunReviews(t.pool, st.r.runId)).toEqual([]);

    // Cancelled mid-panel (all three sessions running, stalled): the step is cancelled and every session with it.
    const m = setup();
    m.deps.fakeScript = (role) => stall(fx(role === 'reviewer_visual' ? 'final-review-visual-pass' : role === 'reviewer_facts' ? 'final-review-facts-pass' : 'final-review-retention-pass'));
    const mp = await m.prepare('Tükenmez kalem');
    const ac = new AbortController();
    cleanups.push(() => ac.abort());
    const cm = mp.ctx('review', { signal: ac.signal });
    const exm = reviewExecutor(m.deps);
    const running = exm.run(cm, await exm.inputHash(cm));
    await vi.waitFor(async () => expect(await m.sessionRoles(cm.stepId)).toHaveLength(3), { timeout: 20_000 });
    ac.abort();
    expect(await within(running, 20_000, 'the panel did not stop after the abort')).toEqual({ status: 'cancelled' });
    await vi.waitFor(async () => expect((await t.pool.query('SELECT status FROM agent_sessions WHERE step_id = $1', [cm.stepId])).rows.map((x) => x.status)).toEqual(['cancelled', 'cancelled', 'cancelled']), { timeout: 10_000 });
    for (const role of ['reviewer_visual', 'reviewer_facts', 'reviewer_retention'] as const) expect(m.deps.reviews!.get(cm.stepId, role)).toBeUndefined();
    expect(await listRunReviews(t.pool, mp.r.runId)).toEqual([]);
  }, 180_000);
});
