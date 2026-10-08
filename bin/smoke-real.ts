// Real-tool profile (plan M7 Y14, spec §16.3): `npm run test:smoke:real [-- --only 1,3] [-- --skip 5]`. Machine only: step 1 spends
// one real haiku turn. Refuses a paid API key and a 5 h window at or above 80 %; works in /tmp/videogen-real-<date> and the
// temporary `videogen_real_check` database (both removed); writes only <dataDir>/reports/real-smoke-<date>.json. Exit 1 on any fail.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '@videogen/shared';
import { parseIds, runProfile, type StepId } from '../apps/worker/src/real/profile.ts';
import { DEFAULT_PILOT_VIDEO, realSteps, realWorkspace } from '../apps/worker/src/real/steps.ts';

const USAGE = `kullanım: npm run test:smoke:real [-- --only 1,3] [-- --skip 5]

Adımlar (sırayla; her biri pass | fail | skip, süre ve kanıtla):
  1  İzole Claude oturumu: haiku, tek tur; apiKeySource 'none', hook olayı 0 (gerçek kullanım harcar)
  2  Kullanım okuması (SdkUsageSource): yüzdeler 0..100, 5 sa sıfırlanma zamanı
  3  Blender önizleme: örnek kalem, 2 kare 270×480, renderer NVIDIA
  4  Remotion still: kalibrasyon kartının ilk karesi, 1080×1920
  5  TTS + Whisper: tek cümle, CER ≤ %5
  6  qc kalem pilotu üzerinde: çıkış 3 ve beklenen 7 ✗ (VG_PILOT_VIDEO, varsayılan ${DEFAULT_PILOT_VIDEO})

Ön koşullar: ortamda ücretli API anahtarı yok (ANTHROPIC_API_KEY …); 5 sa kullanımı < %80.
Geçici veri dizini /tmp/videogen-real-<tarih> ve geçici veritabanı videogen_real_check koşudan sonra silinir.
Rapor: <veri dizini>/reports/real-smoke-<tarih>.json. Herhangi bir fail → çıkış 1; ret → çıkış 2.`;

let args: { only?: string; skip?: string; help?: boolean };
try {
  ({ values: args } = parseArgs({ options: { only: { type: 'string' }, skip: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }));
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
let only: StepId[] | undefined;
let skip: StepId[] | undefined;
try {
  only = args.only === undefined ? undefined : parseIds('--only', args.only);
  skip = args.skip === undefined ? undefined : parseIds('--skip', args.skip);
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}

const config = loadConfig();
try {
  const r = await runProfile(realSteps({ config, pilotVideo: process.env.VG_PILOT_VIDEO ?? DEFAULT_PILOT_VIDEO }), {
    only, skip, env: process.env,
    // Direct read (no API GET): the same zero-token idle session the worker polls with.
    usage: async () => {
      const { SdkUsageSource } = await import('../apps/worker/src/usage.ts');
      const u = (await new SdkUsageSource().read())?.fiveHour?.utilization;
      return { fiveHour: u === null || u === undefined ? null : Math.round(u * 1000) / 10 };
    },
    workspace: realWorkspace(config),
    reportDir: join(config.dataDir, 'reports'),
  });
  // Explicit exit: an SDK or pg handle left behind must not keep the profile hanging after the report.
  process.exit(r.exitCode);
} catch (e) {
  console.error(`gerçek profil durdu: ${(e as Error).message}`);
  process.exit(1);
}
