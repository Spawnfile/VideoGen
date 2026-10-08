import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findPaidKeys } from '@videogen/shared';

/**
 * Plan M7 Y14: the `test:smoke:real` runner. Pure orchestration (preconditions, order, --only/--skip, timing, report, exit code);
 * the real steps live in steps.ts and are injected, so the cloud tests run it with fakes only.
 */

export type StepId = 1 | 2 | 3 | 4 | 5 | 6;
export const STEP_IDS: readonly StepId[] = [1, 2, 3, 4, 5, 6];
export type StepStatus = 'pass' | 'fail' | 'skip';

export interface RealContext {
  /** The temporary data dir (`/tmp/videogen-real-<date>`); never the real one. */
  dataDir: string;
  /** The temporary database (`videogen_real_check`). */
  databaseUrl: string;
  env: NodeJS.ProcessEnv;
}

export interface StepOutcome { status: StepStatus; evidence: Record<string, unknown>; reason?: string }
export interface RealStep { id: StepId; title_tr: string; run(ctx: RealContext): Promise<StepOutcome> }
export interface StepResult extends StepOutcome { id: StepId; title_tr: string; ms: number }

export interface Workspace { dataDir: string; databaseUrl: string; dispose(): Promise<void> }

export interface ProfileOptions {
  only?: StepId[];
  skip?: StepId[];
  env: NodeJS.ProcessEnv;
  /** The direct usage read (no API GET); fiveHour in percent 0..100, null when unknown. */
  usage: () => Promise<{ fiveHour: number | null }>;
  clock?: () => number;
  now?: () => Date;
  /** Creates the temporary data dir and database; disposed after the steps, also on failure. */
  workspace: (date: string) => Promise<Workspace>;
  /** `~/videogen-data/reports` on the machine: the only thing written outside the workspace. */
  reportDir: string;
  log?: (line: string) => void;
}

export interface ProfileResult { results: StepResult[]; exitCode: 0 | 1 | 2; refused?: string; reportPath?: string }

/** Y14: the 5 h window at or above this percent refuses the run (step 1 spends real usage). */
export const USAGE_LIMIT_PCT = 80;

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** `--only 1,3` / `--skip 5`: comma-separated step ids 1..6, sorted and de-duplicated. */
export function parseIds(flag: string, v: string): StepId[] {
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  const ids = parts.map(Number);
  if (!parts.length || ids.some((n) => !STEP_IDS.includes(n as StepId))) throw new Error(`${flag}: 1–6 arası, virgülle ayrılmış adım numaraları bekleniyor (ör. ${flag} 1,3)`);
  return [...new Set(ids as StepId[])].sort((a, b) => a - b);
}

export function formatTable(results: StepResult[]): string {
  const mark = { pass: '✓', fail: '✗', skip: '–' } as const;
  return results.map((r) => `${mark[r.status]} ${r.id}. ${r.title_tr.padEnd(34)} ${r.status.padEnd(4)} ${String(r.ms).padStart(7)} ms${r.reason ? `  ${r.reason}` : ''}`).join('\n');
}

export async function runProfile(steps: RealStep[], o: ProfileOptions): Promise<ProfileResult> {
  const clock = o.clock ?? Date.now;
  const log = o.log ?? ((l: string) => console.log(l));
  const refuse = (why: string): ProfileResult => { log(`reddedildi: ${why}`); return { results: [], exitCode: 2, refused: why }; };

  // §6.6: a paid key is refused before anything else (the usage read itself would open a session with it).
  const keys = findPaidKeys(o.env);
  if (keys.length) return refuse(`ücretli API anahtarı ortamda (${keys.join(', ')}); gerçek profil yalnızca abonelik oturumuyla koşar`);
  let fiveHour: number | null;
  try {
    ({ fiveHour } = await o.usage());
  } catch (e) {
    return refuse(`kullanım okunamadı (${errMsg(e)})`);
  }
  if (fiveHour === null || !Number.isFinite(fiveHour)) return refuse('kullanım okunamadı (5 sa penceresi yok)');
  if (fiveHour >= USAGE_LIMIT_PCT) return refuse(`5 sa kullanımı %${fiveHour} (sınır %${USAGE_LIMIT_PCT}); pencere sıfırlanınca yeniden deneyin`);

  const startedAt = (o.now ?? (() => new Date()))();
  const date = startedAt.toISOString().slice(0, 10);
  const norm = (ids: StepId[]) => [...new Set(ids)].sort((a, b) => a - b);
  const only = o.only ? norm(o.only) : null;
  const skip = norm(o.skip ?? []);
  const selected = (id: StepId): string | null => (only && !only.includes(id) ? '--only' : skip.includes(id) ? '--skip' : null);
  const results: StepResult[] = [];
  const ws = await o.workspace(date);
  try {
    const ctx: RealContext = { dataDir: ws.dataDir, databaseUrl: ws.databaseUrl, env: o.env };
    for (const step of [...steps].sort((a, b) => a.id - b.id)) {
      const off = selected(step.id);
      if (off) {
        results.push({ id: step.id, title_tr: step.title_tr, status: 'skip', ms: 0, evidence: {}, reason: off });
        continue;
      }
      log(`… ${step.id}. ${step.title_tr}`);
      const t0 = clock();
      let out: StepOutcome;
      try {
        out = await step.run(ctx);
      } catch (e) {
        out = { status: 'fail', evidence: {}, reason: errMsg(e) };
      }
      results.push({ id: step.id, title_tr: step.title_tr, ms: Math.round(clock() - t0), ...out });
    }
  } finally {
    await ws.dispose();
  }

  const exitCode = results.some((r) => r.status === 'fail') ? 1 : 0;
  await mkdir(o.reportDir, { recursive: true });
  const reportPath = join(o.reportDir, `real-smoke-${date}.json`);
  await writeFile(reportPath, `${JSON.stringify({
    date, startedAt: startedAt.toISOString(), only, skip, preconditions: { fiveHour }, results, exitCode,
  }, null, 2)}\n`);
  log(formatTable(results));
  log(`rapor: ${reportPath}`);
  return { results, exitCode, reportPath };
}
