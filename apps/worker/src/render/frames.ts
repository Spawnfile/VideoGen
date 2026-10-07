import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const framePath = (dir: string, f: number) => join(dir, `f${String(f).padStart(5, '0')}.png`);

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Same rule as vg_blender render.complete_png: PNG signature + IEND at the tail (a killed write leaves neither). */
export function isCompletePng(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(file, 'r');
    const size = fstatSync(fd).size;
    if (size < 57) return false;
    const head = Buffer.alloc(8);
    const tail = Buffer.alloc(12);
    readSync(fd, head, 0, 8, 0);
    readSync(fd, tail, 0, 12, size - 12);
    return head.equals(SIG) && tail.subarray(4, 8).toString('latin1') === 'IEND';
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function missingFrames(dir: string, lastFrame: number): number[] {
  const out: number[] = [];
  for (let f = 0; f <= lastFrame; f++) if (!isCompletePng(framePath(dir, f))) out.push(f);
  return out;
}

/** Plan E6: the PNG frame directories of a finished run (runs/<id>/final/<hash>/frames) and the .blend copy next to them; returns the frame dirs relative to dataDir. */
export function removeRunFrames(dataDir: string, runId: string): string[] {
  const root = join(dataDir, 'runs', runId, 'final');
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const h of readdirSync(root)) {
    rmSync(join(root, h, 'scene.blend'), { force: true });
    const dir = join(root, h, 'frames');
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(relative(dataDir, dir));
  }
  return removed;
}

/**
 * Plan F12: a new final render starts with the hash `keepHash16`; this run's other `final/<hash>/` frame dirs (and their .blend copies) are
 * stale and go. `compose`, `qc` and the kept hash are never touched. Returns the deleted frame dirs relative to dataDir.
 */
export function removeStaleFrames(dataDir: string, runId: string, keepHash16: string): string[] {
  const root = join(dataDir, 'runs', runId, 'final');
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const h of readdirSync(root)) {
    // Only `final/<16 hex>` directories are frame dirs of a render hash; anything else (compose, qc, a stray file) stays.
    if (!/^[0-9a-f]{16}$/.test(h) || h === keepHash16 || !statSync(join(root, h)).isDirectory()) continue;
    rmSync(join(root, h, 'scene.blend'), { force: true });
    const dir = join(root, h, 'frames');
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(relative(dataDir, dir));
  }
  return removed;
}
