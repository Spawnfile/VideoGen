import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type pg from 'pg';
import { insertBlob } from '@videogen/db';

const MIME: Record<string, string> = {
  '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown', '.py': 'text/x-python', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac',
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
export async function putBlob(pool: pg.Pool, dataDir: string, absPath: string): Promise<{ sha256: string; path: string; bytes: number; mime: string; created: boolean }> {
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
