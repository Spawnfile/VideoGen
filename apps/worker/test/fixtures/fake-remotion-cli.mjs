// Stand-in for packages/remotion/src/render-cli.ts (same stdout protocol and exit codes); behaviour picked by the --out file name.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { props: { type: 'string' }, glb: { type: 'string' }, out: { type: 'string' }, cache: { type: 'string' }, concurrency: { type: 'string' }, frames: { type: 'string' }, composition: { type: 'string' }, 'frames-dir': { type: 'string' } } });
writeFileSync(`${a.out}.env.json`, JSON.stringify(Object.keys(process.env).sort()));
if (a.out.includes('gpu') && a.concurrency === '2') { process.stdout.write('VG_ERROR WebGL context lost\n'); process.exit(3); }
if (a.out.includes('fail')) { process.stdout.write('VG_ERROR Bundle failed\n'); process.exit(1); }
process.stdout.write('VG_STAGE bundle\nVG_STAGE frames\n');
for (const d of [10, 20, 30]) process.stdout.write(`VG_PROGRESS ${d} 30\n`);
writeFileSync(a.out, 'mp4');
process.stdout.write(`VG_DONE ${JSON.stringify({ frames: 30, ms: 5 })}\n`);
