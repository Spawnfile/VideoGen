#!/usr/bin/env node
// Stands in for `python -m audio_service.voice_cli --job <job.json>` in the driver test (plan M5c T4).
// Control file: <out_dir>/fake.json { exit?: number, mode?: 'sleep' | 'alloc', stderr?: string }. It also leaves
// env.json (the environment it was started with) and pid.txt (its pid) in out_dir.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const jobPath = process.argv[process.argv.indexOf('--job') + 1];
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
mkdirSync(job.out_dir, { recursive: true });
writeFileSync(join(job.out_dir, 'argv.json'), JSON.stringify(process.argv.slice(2)));
writeFileSync(join(job.out_dir, 'env.json'), JSON.stringify(process.env));
writeFileSync(join(job.out_dir, 'pid.txt'), String(process.pid));
let ctl = {};
try { ctl = JSON.parse(readFileSync(join(job.out_dir, 'fake.json'), 'utf8')); } catch { /* none */ }

const total = job.lines.length * 2;
const lines = job.lines.map((l) => ({
  id: l.id, wav: `${ctl.wavPrefix ?? ''}${l.id}.wav`, duration_ms: 1000, seed: l.seed, attempts: 1, cer: 0, normalized: l.text.toLowerCase(), asr: l.text.toLowerCase(),
  words: l.text.split(/\s+/).map((w, i) => ({ text: w, start_ms: i * 200, end_ms: i * 200 + 150 })),
}));
const result = (failed) => writeFileSync(join(job.out_dir, 'result.json'), ctl.resultRaw ?? JSON.stringify({ engine: job.engine, model: 'fake-model', lines, failed, ms: 5, peak_vram_mb: null }));

if (ctl.mode === 'sleep') {
  process.stdout.write(`VG_PROGRESS 0 ${total}\n`);
  setInterval(() => {}, 1000);
} else if (ctl.mode === 'alloc') {
  process.stdout.write(`VG_PROGRESS 0 ${total}\n`);
  const keep = [];
  setInterval(() => { keep.push(Buffer.alloc(40 * 1024 * 1024, 1)); }, 20);
} else {
  for (let i = 1; i <= total; i++) process.stdout.write(`VG_PROGRESS ${i} ${total}\n`);
  if (ctl.noProgressTail) process.stdout.write(`VG_PROGRESS 6 6\n`);
  if (ctl.stderr) process.stderr.write(`${ctl.stderr}\n`);
  const code = ctl.exit ?? 0;
  if (code === 0 || ctl.resultRaw || ctl.wavPrefix) result([]);
  if (code === 4) result([job.lines[1].id]);
  process.exit(code);
}
