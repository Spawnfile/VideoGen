#!/usr/bin/env node
// Video library L8–L10: `node bin/import-episodes.mjs [--dry-run] [--manifest <path>] [--data-dir <dir>]` — the episodes listed in
// episodes/manifest.json, from <dataDir>/episodes/<slug>/final.mp4 (+ caption.txt), become ready, read-only videos in the Library.
// Idempotent (an episode whose file is already a final is reported as "exists"); exit 1 when any episode is missing or does not match.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { register } from 'tsx/esm/api';

register();
const ROOT = resolve(import.meta.dirname, '..');
const { values: o } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, manifest: { type: 'string' }, 'data-dir': { type: 'string' } } });
const { loadConfig, EpisodeManifestSchema } = await import('../packages/shared/src/index.ts');
const { createPool, fileSha256, importEpisode } = await import('../packages/db/src/index.ts');

const config = loadConfig();
const dataDir = o['data-dir'] ?? config.dataDir;
const manifest = EpisodeManifestSchema.parse(JSON.parse(readFileSync(o.manifest ?? join(ROOT, 'episodes/manifest.json'), 'utf8')));
const probe = (f) => {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,r_frame_rate:format=duration', '-of', 'json', f], { encoding: 'utf8' }));
  const s = j.streams[0];
  return { width: s.width, height: s.height, codec: s.codec_name, fps: s.r_frame_rate, durationMs: Math.round(Number(j.format.duration) * 1000) };
};

const pool = createPool(config.databaseUrl, 2);
const tmp = mkdtempSync(join(tmpdir(), 'vg-import-'));
let failed = 0;
try {
  for (const e of manifest.episodes) {
    const dir = join(dataDir, 'episodes', e.slug);
    const file = join(dir, 'final.mp4');
    if (!existsSync(file)) { console.log(`${e.slug}: missing (${file})`); failed++; continue; }
    const sha = await fileSha256(file);
    if (sha !== e.sha256) { console.log(`${e.slug}: sha mismatch (file ${sha}, manifest ${e.sha256})`); failed++; continue; }
    const p = probe(file);
    const warn = p.width !== 1080 || p.height !== 1920 || p.fps !== '30/1' ? ` (warning: ${p.width}x${p.height} @ ${p.fps})` : '';
    if (o['dry-run']) { console.log(`${e.slug}: would import ${(p.durationMs / 1000).toFixed(1)} s${warn}`); continue; }
    const cover = join(tmp, `${e.slug}.png`);
    execFileSync(config.render.ffmpeg, ['-v', 'error', '-i', file, '-frames:v', '1', '-y', cover]);
    const captionFile = join(dir, 'caption.txt');
    const caption = existsSync(captionFile) ? readFileSync(captionFile, 'utf8') : null;
    const out = await importEpisode(pool, dataDir, e, { file, cover, durationMs: p.durationMs, width: p.width, height: p.height, codec: p.codec, caption });
    if (out.kind === 'sha_mismatch') { console.log(`${e.slug}: sha mismatch while storing (${out.actual})`); failed++; continue; }
    console.log(`${e.slug}: ${out.kind}${out.kind === 'imported' ? warn : ''}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await pool.end();
}
process.exit(failed ? 1 : 0);
