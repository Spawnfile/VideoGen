import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { licenseVerdict, type AssetKind } from '@videogen/shared';
import { findAssetByBlob, insertAsset, type AssetRecord } from './assets.ts';
import { appendAudit } from './audit.ts';
import { insertBlob } from './blobs.ts';
import type { Queryable } from './client.ts';

/**
 * Plan M7 Y8: the blob store and the asset import core, moved here from the worker so the API's upload import shares them.
 * This package starts no process: the audio duration (ffprobe) is handed in by the caller.
 */
const MIME: Record<string, string> = {
  '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown', '.py': 'text/x-python', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.glb': 'model/gltf-binary', '.blend': 'application/x-blender', '.gz': 'application/gzip', '.svg': 'image/svg+xml',
};

async function sha256File(p: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(p)) h.update(chunk as Buffer);
  return h.digest('hex');
}

export async function fileSha256(p: string): Promise<string | null> {
  try { return await sha256File(p); } catch { return null; }
}

/** Spec §11.3: copy to a temp file next to the target, fsync, rename; identical content is stored once. */
export async function putBlob(pool: Queryable, dataDir: string, absPath: string): Promise<{ sha256: string; path: string; bytes: number; mime: string; created: boolean }> {
  const sha256 = await sha256File(absPath);
  const ext = extname(absPath).toLowerCase();
  const rel = join('media', 'sha256', sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}${ext}`);
  const dest = join(dataDir, rel);
  const bytes = (await stat(absPath)).size;
  const mime = MIME[ext] ?? 'application/octet-stream';
  const exists = await stat(dest).then(() => true, () => false);
  if (!exists) {
    await mkdir(join(dest, '..'), { recursive: true });
    const tmp = `${dest}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await copyFile(absPath, tmp);
      const fh = await open(tmp, 'r');
      try { await fh.sync(); } finally { await fh.close(); }
      await rename(tmp, dest);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }
  const created = await insertBlob(pool, { sha256, path: rel, bytes, mime });
  return { sha256, path: rel, bytes, mime, created };
}

export interface ImportAssetInput {
  kind: AssetKind; file: string; title: string; spdx: string; author: string; licenseTextFile: string;
  sourceUrl?: string; attribution?: string; tags?: string[];
}

/**
 * Spec §9 license gate at the door: every import is recorded (rejected ones with allowed=false) and audited. `inserted: false` = the file was
 * already in the ledger for this kind (its stored license and verdict stand). `durationMs` measures an audio file (null: not audio).
 */
export async function importAssetFile(pool: Queryable, dataDir: string, i: ImportAssetInput, o: { durationMs: (file: string) => Promise<number | null> }): Promise<{ asset: AssetRecord; inserted: boolean }> {
  const verdict = licenseVerdict({ spdx: i.spdx, attribution: i.attribution, kind: i.kind });
  const blob = await putBlob(pool, dataDir, i.file);
  const license = await putBlob(pool, dataDir, i.licenseTextFile);
  const durationMs = i.kind === 'music' || i.kind === 'sfx' ? await o.durationMs(i.file) : null;
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
  return { asset: row, inserted: inserted !== null };
}
