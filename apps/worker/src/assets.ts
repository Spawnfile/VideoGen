import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { ASSET_KINDS, licenseVerdict, SFX_NAMES, type AssetKind, type SfxName } from '@videogen/shared';
import { appendAudit, findAssetByBlob, insertAsset, type AssetRecord } from '@videogen/db';
import { putBlob } from './media.ts';
import { ffprobeOf } from './render/ffmpeg.ts';

export interface ImportAssetInput {
  kind: AssetKind; file: string; title: string; spdx: string; author: string; licenseTextFile: string;
  sourceUrl?: string; attribution?: string; tags?: string[];
}

/** Duration of an audio file (ms, ffprobe); null when it is not audio. */
export function audioDurationMs(ffmpeg: string, file: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(ffprobeOf(ffmpeg), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 15_000 }, (err, out) => {
      const s = Number(String(out).trim());
      resolve(err || !Number.isFinite(s) || s <= 0 ? null : Math.round(s * 1000));
    });
  });
}

/** Spec §9 license gate at the door: every import is recorded (rejected ones with allowed=false) and audited. */
export async function importAsset(pool: pg.Pool, dataDir: string, ffmpeg: string, i: ImportAssetInput): Promise<AssetRecord> {
  const verdict = licenseVerdict({ spdx: i.spdx, attribution: i.attribution, kind: i.kind });
  const blob = await putBlob(pool, dataDir, i.file);
  const license = await putBlob(pool, dataDir, i.licenseTextFile);
  const durationMs = i.kind === 'music' || i.kind === 'sfx' ? await audioDurationMs(ffmpeg, i.file) : null;
  const inserted = await insertAsset(pool, {
    kind: i.kind, title: i.title, blobSha: blob.sha256, licenseSpdx: i.spdx, author: i.author, allowed: verdict.allowed, sourceUrl: i.sourceUrl ?? null,
    attribution: i.attribution ?? null, licenseSnapshotSha: license.sha256, tags: i.tags ?? [], durationMs,
  });
  const row = inserted ?? (await findAssetByBlob(pool, i.kind, blob.sha256))!;
  // Review #8: a file already in the ledger keeps its stored license and verdict; the audit says so instead of judging the new input.
  await appendAudit(pool, inserted ? {
    actorType: 'user', action: verdict.allowed ? 'asset.imported' : 'asset.rejected', subjectType: 'asset', subjectId: row.id,
    data: { kind: i.kind, title: i.title, license: i.spdx, sha256: blob.sha256, ...(verdict.reason_tr ? { reason: verdict.reason_tr } : {}) },
  } : {
    actorType: 'user', action: 'asset.exists', subjectType: 'asset', subjectId: row.id,
    data: { kind: i.kind, sha256: blob.sha256, license: row.licenseSpdx, allowed: row.allowed },
  });
  return row;
}

/** Plan E10: procedural, deterministic (fixed noise seed), 48 kHz mono. CC0 by construction (made here with ffmpeg). */
const SFX_RECIPES: Record<SfxName, string> = {
  whoosh: 'anoisesrc=d=0.6:c=pink:r=48000:a=0.5:seed=7,highpass=f=300,lowpass=f=4000,afade=t=in:d=0.25,afade=t=out:st=0.3:d=0.3',
  swoosh: 'anoisesrc=d=0.4:c=white:r=48000:a=0.35:seed=11,bandpass=f=1800:width_type=h:w=1200,afade=t=in:d=0.1,afade=t=out:st=0.15:d=0.25',
  click: "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-t*90)':d=0.06:s=48000",
  snap: "aevalsrc='0.9*(sin(2*PI*1200*t)+0.5*sin(2*PI*3100*t))*exp(-t*60)':d=0.12:s=48000",
  tick: "aevalsrc='0.5*sin(2*PI*3600*t)*exp(-t*140)':d=0.04:s=48000",
  thud: "aevalsrc='0.9*sin(2*PI*90*t)*exp(-t*18)':d=0.35:s=48000",
};
const SFX_LICENSE = 'CC0 1.0 Universal. VideoGen bu sesi ffmpeg ile kendisi üretir (prosedürel; üçüncü taraf kaynak yok).\n';

const run = (ffmpeg: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 30_000 }, (err, _o, e) => (err ? reject(new Error(`ffmpeg: ${String(e).trim().split('\n').at(-1)}`)) : resolve()));
});

/** Generates the library under <dataDir>/cache/sfx once and registers it (idempotent: same bytes → same blob → existing row). */
export async function ensureSfxLibrary(pool: pg.Pool, dataDir: string, ffmpeg: string): Promise<Record<SfxName, AssetRecord>> {
  const dir = join(dataDir, 'cache', 'sfx');
  await mkdir(dir, { recursive: true });
  const lic = join(dir, 'LICENSE.txt');
  await writeFile(lic, SFX_LICENSE);
  const out = {} as Record<SfxName, AssetRecord>;
  for (const name of SFX_NAMES) {
    const file = join(dir, `${name}.wav`);
    if (!existsSync(file)) await run(ffmpeg, ['-f', 'lavfi', '-i', SFX_RECIPES[name], '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-flags:a', '+bitexact', file]);
    const blob = await putBlob(pool, dataDir, file);
    const existing = await findAssetByBlob(pool, 'sfx', blob.sha256);
    out[name] = existing ?? await importAsset(pool, dataDir, ffmpeg, { kind: 'sfx', file, title: name, spdx: 'CC0-1.0', author: 'VideoGen (prosedürel)', licenseTextFile: lic, tags: [name] });
  }
  return out;
}

/** `bin/assets.mjs add …` arguments (plan E13). */
export function parseAddArgs(argv: string[]): ImportAssetInput {
  const v: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith('--') && argv[i + 1] !== undefined) v[argv[i]!.slice(2)] = argv[i + 1]!;
  if (!(ASSET_KINDS as readonly string[]).includes(v.kind ?? '')) throw new Error(`--kind şunlardan biri olmalı: ${ASSET_KINDS.join(', ')}`);
  const missing = ['file', 'title', 'license', 'author', 'license-text'].filter((k) => !v[k]);
  if (missing.length) throw new Error(`eksik: ${missing.map((k) => `--${k}`).join(', ')}`);
  return {
    kind: v.kind as AssetKind, file: v.file!, title: v.title!, spdx: v.license!, author: v.author!, licenseTextFile: v['license-text']!,
    ...(v.source ? { sourceUrl: v.source } : {}), ...(v.attribution ? { attribution: v.attribution } : {}), ...(v.tags ? { tags: v.tags.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
  };
}
