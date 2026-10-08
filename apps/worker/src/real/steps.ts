import { copyFile, mkdir, open, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHANNEL_STYLES, cleanChildEnv, DEFAULT_NARRATOR, QC_CHECKS, type Config, type QcCheckResult, type UsageSnapshot } from '@videogen/shared';
import type { VoiceOutput } from '../audio/driver.ts';
import type { RealStep, StepOutcome, Workspace } from './profile.ts';

/**
 * Plan M7 Y14: the six real steps of `test:smoke:real` and their pure evidence parsers. Every heavy dependency (the Claude SDK,
 * Blender, Remotion/Chrome, the audio venv, Postgres) is imported inside `run`, so `--help`, a refused run and the unit tests
 * never load or start any of them.
 */

// ---------------------------------------------------------------- pure evidence parsers

type Msg = { type?: unknown; subtype?: unknown; apiKeySource?: unknown };

/** Step 1: the isolated session must run on the subscription (`apiKeySource: 'none'`) and see no hook at all (no settings leaked). */
export function initEvidence(messages: unknown[]): { apiKeySource: string | null; hookEvents: number; ok: boolean } {
  const ms = messages as Msg[];
  const init = ms.find((m) => m?.type === 'system' && m.subtype === 'init');
  const apiKeySource = typeof init?.apiKeySource === 'string' ? init.apiKeySource : null;
  const hookEvents = ms.filter((m) => m?.type === 'system' && typeof m.subtype === 'string' && m.subtype.startsWith('hook_')).length;
  return { apiKeySource, hookEvents, ok: apiKeySource === 'none' && hookEvents === 0 };
}

const pct = (u: number | null | undefined): number | null => (u === null || u === undefined ? null : Math.round(u * 1000) / 10);

/** Step 2: both windows as percents in 0..100, and a reset time for the 5 h window. */
export function usageEvidence(u: UsageSnapshot | null): { ok: boolean; reason?: string; fiveHour?: number | null; sevenDay?: number | null; fiveHourResetsAt?: string | null } {
  if (!u) return { ok: false, reason: 'kullanım verisi yok' };
  const fiveHour = pct(u.fiveHour?.utilization);
  const sevenDay = pct(u.sevenDay?.utilization);
  const fiveHourResetsAt = u.fiveHour?.resetsAt ?? null;
  const base = { fiveHour, sevenDay, fiveHourResetsAt };
  const bad = [['5 sa', fiveHour], ['7 gün', sevenDay]].filter(([, v]) => v === null || (v as number) < 0 || (v as number) > 100);
  if (bad.length) return { ok: false, reason: `yüzde 0..100 dışında ya da yok: ${bad.map(([k, v]) => `${k} ${v}`).join(', ')}`, ...base };
  if (!fiveHourResetsAt) return { ok: false, reason: '5 sa penceresinin sıfırlanma zamanı yok', ...base };
  return { ok: true, ...base };
}

/** Step 3: Blender's `VG_RENDERER` line; previews must run on the NVIDIA GPU. */
export function rendererEvidence(text: string): { nvidia: boolean; renderer: string; ok: boolean } {
  const renderer = text.trim();
  const nvidia = /nvidia/i.test(renderer);
  return { nvidia, renderer, ok: nvidia };
}

/** Step 5: the worst line's CER against the 5 % gate (voice_cli.py), and no line left over the gate. */
export function cerEvidence(result: Pick<VoiceOutput, 'lines' | 'failed'>): { cer: number; ok: boolean } {
  const cer = result.lines.reduce((m, l) => Math.max(m, l.cer), 0);
  return { cer, ok: result.lines.length > 0 && result.failed.length === 0 && cer <= 0.05 };
}

/** docs/m5/real-check.md:22–28: the seven failures the pen pilot must show. */
export const PILOT_EXPECTED_FAILURES = ['d6_loudness', 'd6_lra', 'd6_first_audio', 'd6_silence', 'd3_freeze', 'g1_color', 'g6_edges'] as const;

/** Step 6: qc-cli's exit (3 when a gate check fails, else 0) and the expected failures that did not show. */
export function qcEvidence(checks: QcCheckResult[]): { exit: 0 | 3; missing: string[]; unexpected: string[]; ok: boolean } {
  const failing = checks.filter((c) => !c.pass).map((c) => c.id as string);
  const exit = checks.some((c) => !c.pass && QC_CHECKS[c.id].gate) ? 3 : 0;
  const missing = PILOT_EXPECTED_FAILURES.filter((id) => !failing.includes(id));
  const unexpected = failing.filter((id) => !(PILOT_EXPECTED_FAILURES as readonly string[]).includes(id));
  return { exit, missing, unexpected, ok: exit === 3 && missing.length === 0 };
}

// ---------------------------------------------------------------- real steps

const verdict = (ok: boolean, evidence: Record<string, unknown>, reason?: string): StepOutcome =>
  (ok ? { status: 'pass', evidence } : { status: 'fail', evidence, reason: reason ?? 'kanıt beklentiyi karşılamadı' });

/** Width × height from a PNG's IHDR chunk; null when the file is not a PNG. */
async function pngSize(path: string): Promise<{ width: number; height: number } | null> {
  const f = await open(path, 'r');
  try {
    const b = Buffer.alloc(24);
    await f.read(b, 0, 24, 0);
    if (b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } finally {
    await f.close();
  }
}

export const DEFAULT_PILOT_VIDEO = join(homedir(), 'icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4');
const FIXTURES = resolve(import.meta.dirname, '../../../../tests/fixtures/artifacts');
const CLAUDE_TIMEOUT_MS = 120_000;
const TTS_LINE = 'Bu kalemin içinde küçük bir yay saklı.';

export interface RealStepsOptions { config: Config; pilotVideo: string }

export function realSteps(o: RealStepsOptions): RealStep[] {
  const { config } = o;
  return [
    {
      id: 1,
      title_tr: 'İzole Claude oturumu (haiku, 1 tur)',
      async run(ctx) {
        const { query } = await import('@anthropic-ai/claude-agent-sdk');
        const { findBundledClaude } = await import('../claude-binary.ts');
        const cwd = join(ctx.dataDir, 'claude');
        await mkdir(cwd, { recursive: true });
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), CLAUDE_TIMEOUT_MS);
        const messages: unknown[] = [];
        let result: { subtype?: string; num_turns?: number } | null = null;
        try {
          // spikes/m3/probe.mjs isolation: no settings, no MCP config, scrubbed env; no plugin and no hook of our own, so any hook event is a leak.
          const q = query({
            prompt: 'Yalnızca "tamam" yaz.',
            options: {
              model: 'haiku', effort: 'low', maxTurns: 1, cwd, settingSources: [], strictMcpConfig: true, mcpServers: {}, env: cleanChildEnv(ctx.env),
              permissionMode: 'dontAsk', permissionPrompts: 'none', allowedTools: [], includeHookEvents: true,
              pathToClaudeCodeExecutable: findBundledClaude(), abortController: abort,
            },
          });
          for await (const m of q) {
            messages.push(m);
            if (m.type === 'result') result = m;
          }
        } finally {
          clearTimeout(timer);
        }
        const init = initEvidence(messages);
        const evidence = { ...init, result: result?.subtype ?? null, turns: result?.num_turns ?? null, messages: messages.length };
        if (result?.subtype !== 'success') return verdict(false, evidence, `oturum başarıyla bitmedi (${result?.subtype ?? 'sonuç yok'})`);
        return verdict(init.ok, evidence, `apiKeySource ${init.apiKeySource}, hook olayı ${init.hookEvents}`);
      },
    },
    {
      id: 2,
      title_tr: 'Kullanım okuması (SdkUsageSource)',
      async run() {
        const { SdkUsageSource } = await import('../usage.ts');
        const u = usageEvidence(await new SdkUsageSource().read());
        const { ok, reason, ...evidence } = u;
        return verdict(ok, evidence, reason);
      },
    },
    {
      id: 3,
      title_tr: 'Blender önizleme (2 kare, NVIDIA)',
      async run(ctx) {
        const { BlenderRenderDriver, PYTHON_DIR } = await import('../render/driver.ts');
        const driver = new BlenderRenderDriver({ blender: config.render.blender, bwrap: config.render.bwrap, dataDir: ctx.dataDir, home: homedir() });
        const cap = await driver.capabilities();
        if (!cap.ok) return { status: 'fail', evidence: {}, reason: cap.reason };
        const run = join(ctx.dataDir, 'runs', 'real-blender');
        await mkdir(join(run, 'scene'), { recursive: true });
        await copyFile(join(FIXTURES, 'scene-kalem.json'), join(run, 'scene/spec.json'));
        await copyFile(join(FIXTURES, 'storyboard-kalem.json'), join(run, 'scene/storyboard.json'));
        await copyFile(join(PYTHON_DIR, 'examples/kalem/product.py'), join(run, 'scene/product.py'));
        const b = await driver.build({
          runDir: run, specPath: join(run, 'scene/spec.json'), storyboardPath: join(run, 'scene/storyboard.json'), productPath: join(run, 'scene/product.py'),
          outDir: join(run, 'scene/build'), style: CHANNEL_STYLES.gece_mavisi, owner: 'real-smoke',
        });
        if (!b.files) return { status: 'fail', evidence: { buildMs: b.ms }, reason: `örnek kalem kurulamadı: ${b.report.errors.join('; ').slice(0, 300)}` };
        // scale 25 of 1080×1920 → 270×480.
        const s = await driver.stills({ runDir: run, blendPath: b.files.blend, frames: [0, 675], outDir: join(run, 'scene/stills'), scale: 25, samples: 4, owner: 'real-smoke' });
        const sizes = await Promise.all(s.files.map((f) => (existsSync(f) ? pngSize(f) : null)));
        const r = rendererEvidence(s.renderer);
        const sized = sizes.length === 2 && sizes.every((z) => z?.width === 270 && z.height === 480);
        const evidence = { renderer: r.renderer, nvidia: r.nvidia, frames: sizes.map((z) => (z ? `${z.width}×${z.height}` : 'yok')), buildMs: b.ms, stillsMs: s.ms };
        if (!r.ok) return verdict(false, evidence, `renderer NVIDIA değil: ${r.renderer || 'bilinmiyor'}`);
        return verdict(sized, evidence, 'iki 270×480 kare beklenirdi');
      },
    },
    {
      id: 4,
      title_tr: 'Remotion still (kalibrasyon kartı)',
      async run(ctx) {
        const { renderStill, SAFE_AREA_CARD, CHROME } = await import('@videogen/remotion/render');
        const out = join(ctx.dataDir, 'real', 'safe-area-card.png');
        const r = await renderStill({ composition: SAFE_AREA_CARD, props: {}, frame: 0, out, cacheRoot: join(ctx.dataDir, 'cache', 'remotion') });
        const size = await pngSize(r.out);
        const evidence = { size: size ? `${size.width}×${size.height}` : null, ms: r.ms, gl: CHROME.gl };
        return verdict(size?.width === 1080 && size.height === 1920, evidence, 'bir 1080×1920 PNG beklenirdi');
      },
    },
    {
      id: 5,
      title_tr: 'TTS + Whisper (tek cümle, CER ≤ %5)',
      async run(ctx) {
        const { PythonAudioDriver } = await import('../audio/driver.ts');
        const audio = new PythonAudioDriver({ ...config.audio, dataDir: ctx.dataDir });
        const cap = await audio.capabilities(DEFAULT_NARRATOR);
        if (!cap.ok) return { status: 'fail', evidence: {}, reason: cap.reason };
        const dir = join(ctx.dataDir, 'runs', 'real-voice');
        const v = await audio.voice({
          runDir: dir, outDir: join(dir, 'voice'), cacheDir: join(dir, 'voice-cache'), owner: 'real-smoke', narrator: { ...DEFAULT_NARRATOR },
          refWav: null, lines: [{ id: 'l1', text: TTS_LINE, targetMs: 3000, seed: 1 }],
        });
        const c = cerEvidence(v);
        const line = v.lines[0];
        const evidence = { engine: v.engine, model: v.model, cer: c.cer, text: TTS_LINE, asr: line?.asr ?? null, durationMs: line?.durationMs ?? null, ms: v.ms };
        return verdict(c.ok, evidence, `CER %${(c.cer * 100).toFixed(1)} (sınır %5)`);
      },
    },
    {
      id: 6,
      title_tr: 'qc — kalem pilotu (çıkış 3, 7 ✗)',
      async run() {
        if (!existsSync(o.pilotVideo)) return { status: 'fail', evidence: { video: o.pilotVideo }, reason: 'pilot videosu bulunamadı (VG_PILOT_VIDEO)' };
        const { probeQc } = await import('../render/qc.ts');
        const { evaluateQc } = await import('@videogen/shared');
        // As qc-cli without --layout: edge bands measured, music variant, cover not judged.
        const m = await probeQc(config.render.ffmpeg, o.pilotVideo, { edges: true });
        const checks = evaluateQc(m, { variant: 'music', layoutIssues: null, coverOk: true });
        const q = qcEvidence(checks);
        const evidence = { video: o.pilotVideo, exit: q.exit, missing: q.missing, unexpected: q.unexpected, failing: checks.filter((c) => !c.pass).map((c) => `${c.id} ${c.value}`) };
        return verdict(q.ok, evidence, q.exit !== 3 ? `çıkış ${q.exit} (3 beklenirdi)` : `eksik ✗: ${q.missing.join(', ')}`);
      },
    },
  ];
}

// ---------------------------------------------------------------- workspace

export const REAL_DB = 'videogen_real_check';

const withDb = (url: string, db: string): string => { const u = new URL(url); u.pathname = `/${db}`; return u.toString(); };

/** Y14: `/tmp/videogen-real-<date>` and the `videogen_real_check` database (migrated), both removed by dispose. */
export function realWorkspace(config: Config): (date: string) => Promise<Workspace> {
  return async (date) => {
    const { default: pg } = await import('pg');
    const { runMigrations } = await import('@videogen/db');
    const admin = async (sql: string) => {
      const c = new pg.Client({ connectionString: config.adminDatabaseUrl });
      await c.connect();
      try { await c.query(sql); } finally { await c.end(); }
    };
    const dataDir = `/tmp/videogen-real-${date}`;
    await rm(dataDir, { recursive: true, force: true });
    await mkdir(dataDir, { recursive: true });
    await admin(`DROP DATABASE IF EXISTS ${REAL_DB} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${REAL_DB}`);
    const dispose = async () => {
      await admin(`DROP DATABASE IF EXISTS ${REAL_DB} WITH (FORCE)`).catch((e) => console.error(`geçici veritabanı silinemedi: ${(e as Error).message}`));
      await rm(dataDir, { recursive: true, force: true });
    };
    try {
      await runMigrations(withDb(config.adminDatabaseUrl, REAL_DB));
    } catch (e) {
      await dispose();
      throw e;
    }
    return { dataDir, databaseUrl: withDb(config.databaseUrl, REAL_DB), dispose };
  };
}
