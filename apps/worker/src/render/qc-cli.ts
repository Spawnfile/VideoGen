import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { evaluateQc, QC_CHECKS } from '@videogen/shared';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { probeQc } from './qc.ts';

/** Calibration and manual checks (spec §8.3): node --import tsx apps/worker/src/render/qc-cli.ts <video> [--layout layout.json] */
const { values, positionals } = parseArgs({ allowPositionals: true, options: { layout: { type: 'string' } } });
const file = positionals[0];
if (!file) { console.error('kullanım: qc-cli <video> [--layout layout.json]'); process.exit(2); }
const layout = values.layout ? layoutIssues(JSON.parse(readFileSync(values.layout, 'utf8')) as LayoutManifest) : null;
const m = await probeQc(process.env.VG_FFMPEG ?? 'ffmpeg', file, { edges: !layout });
const r = evaluateQc(m, { variant: 'music', layoutIssues: layout, coverOk: true });
console.log(JSON.stringify({ measure: m, checks: r }, null, 2));
const bad = r.filter((c) => !c.pass);
for (const c of bad) console.log(`✗ ${c.id} ${QC_CHECKS[c.id].label_tr}: ${c.value} (${c.limit})${c.at !== undefined ? ` @ ${c.at} sn` : ''}`);
process.exit(bad.some((c) => QC_CHECKS[c.id].gate) ? 3 : 0);
