import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { FinalProps } from './props.ts';
import { renderDraftVideo, renderFinalVideo } from './render.ts';

/**
 * Plan C13 / E7: the worker runs the draft render and the final compose (--composition final --frames-dir …) in this child process (a process-group leader with a "render" pid file), so a
 * cancel, a timeout or a worker restart kills Chrome with it. Protocol on stdout:
 *   VG_STAGE <bundle|browser|frames> · VG_PROGRESS <done> <total> · VG_DONE {"frames":n,"ms":n} · VG_ERROR <message>
 * Exit codes: 0 done, 2 bad arguments, 3 Chrome/WebGL (GPU) failure — the caller retries once with concurrency 1 (spec §14) —, 1 other.
 */
const GPU_FAILURE = /WebGL|GPU process|context lost|Target closed|crashed|Browser has disconnected/i;

const { values: a } = parseArgs({
  options: { props: { type: 'string' }, glb: { type: 'string' }, out: { type: 'string' }, cache: { type: 'string' }, concurrency: { type: 'string' }, frames: { type: 'string' }, composition: { type: 'string' }, 'frames-dir': { type: 'string' } },
});
if (!a.props || !a.glb || !a.out || !a.cache) {
  process.stdout.write('VG_ERROR eksik argüman: --props --glb --out --cache\n');
  process.exit(2);
}
const final = a.composition === 'final';
if (final && !a['frames-dir']) {
  process.stdout.write('VG_ERROR eksik argüman: --frames-dir\n');
  process.exit(2);
}
const range = a.frames ? (a.frames.split('-').map(Number) as [number, number]) : undefined;
const ac = new AbortController();
process.on('SIGTERM', () => ac.abort());
let last = -1;
try {
  const common = {
    glbPath: a.glb, out: a.out, cacheRoot: a.cache, concurrency: Number(a.concurrency ?? 2), frameRange: range, signal: ac.signal,
    onStage: (s: string) => process.stdout.write(`VG_STAGE ${s}\n`),
    onProgress: (done: number, total: number) => { if (done !== last) { last = done; process.stdout.write(`VG_PROGRESS ${done} ${total}\n`); } },
  };
  const props = JSON.parse(readFileSync(a.props, 'utf8')) as Omit<FinalProps, 'glbUrl' | 'framesUrl'>;
  const r = final ? await renderFinalVideo({ ...common, props, framesDir: a['frames-dir']! }) : await renderDraftVideo({ ...common, props });
  process.stdout.write(`VG_DONE ${JSON.stringify(r)}\n`);
  process.exit(0);
} catch (e) {
  const msg = ((e as Error).message ?? String(e)).split('\n')[0]!.slice(0, 300);
  process.stdout.write(`VG_ERROR ${msg}\n`);
  process.exit(GPU_FAILURE.test(msg) ? 3 : 1);
}
