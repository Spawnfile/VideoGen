import { execFile } from 'node:child_process';
import { readFile, statfs } from 'node:fs/promises';
import type { Resource } from '@videogen/shared';

export interface ResourceSnapshot {
  memAvailableMb: number;
  swapUsedPct: number;
  diskFreeMb: number;
  /** null: nvidia-smi could not be read. */
  vramFreeMb: number | null;
  /** null: ollama is not installed (no blocker). */
  ollamaModels: string[] | null;
}
export interface Probe { snapshot(): Promise<ResourceSnapshot> }
export type PrecheckResult = { ok: true } | { ok: false; status: 'waiting_gpu' | 'waiting_disk'; reason: string };

/** Spec §6.4 GPU pre-check. */
export const GPU_PRECHECK = { minRamMb: 2560, maxSwapPct: 90, minDiskMb: 3072, minVramMb: 4096 };

const gb = (mb: number) => (Math.round((mb / 1024) * 10) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export function precheck(resource: Resource, s: ResourceSnapshot, extraDiskMb = 0): PrecheckResult {
  if (resource === 'claude') return { ok: true };
  const needDisk = GPU_PRECHECK.minDiskMb + extraDiskMb;
  if (s.diskFreeMb < needDisk) return { ok: false, status: 'waiting_disk', reason: `boş disk ${gb(s.diskFreeMb)} GB < ${gb(needDisk)} GB` };
  if (resource === 'heavy_cpu') return { ok: true };
  if (s.memAvailableMb < GPU_PRECHECK.minRamMb) return { ok: false, status: 'waiting_gpu', reason: `boş RAM ${gb(s.memAvailableMb)} GB < ${gb(GPU_PRECHECK.minRamMb)} GB` };
  if (s.swapUsedPct >= GPU_PRECHECK.maxSwapPct) return { ok: false, status: 'waiting_gpu', reason: `swap %${Math.round(s.swapUsedPct)} ≥ %${GPU_PRECHECK.maxSwapPct}` };
  if (s.vramFreeMb === null) return { ok: false, status: 'waiting_gpu', reason: 'VRAM okunamadı (nvidia-smi)' };
  if (s.vramFreeMb < GPU_PRECHECK.minVramMb) return { ok: false, status: 'waiting_gpu', reason: `boş VRAM ${gb(s.vramFreeMb)} GB < ${gb(GPU_PRECHECK.minVramMb)} GB` };
  if (s.ollamaModels?.length) return { ok: false, status: 'waiting_gpu', reason: `ollama modeli yüklü: ${s.ollamaModels.join(', ')}` };
  return { ok: true };
}

export function parseMeminfo(text: string): { memAvailableMb: number; swapUsedPct: number } {
  const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0);
  const total = kb('SwapTotal');
  const used = total > 0 ? ((total - kb('SwapFree')) / total) * 100 : 0;
  return { memAvailableMb: Math.round(kb('MemAvailable') / 1024), swapUsedPct: Math.round(used * 10) / 10 };
}

export function parseOllamaPs(text: string): string[] {
  return text.split('\n').slice(1).map((l) => l.trim().split(/\s+/)[0] ?? '').filter(Boolean);
}

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

/** Real machine probe: /proc/meminfo, statfs(dataDir), nvidia-smi, `ollama ps`. */
export class SystemProbe implements Probe {
  constructor(private readonly dataDir: string) {}

  async snapshot(): Promise<ResourceSnapshot> {
    const mem = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
    const fs = await statfs(this.dataDir);
    const smi = await run('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits']);
    const vram = smi === null ? null : Number(smi.trim().split('\n')[0]);
    const ollama = await run('ollama', ['ps']);
    return {
      ...mem,
      diskFreeMb: Math.round((fs.bavail * fs.bsize) / 1024 / 1024),
      vramFreeMb: vram === null || Number.isNaN(vram) ? null : vram,
      ollamaModels: ollama === null ? null : parseOllamaPs(ollama),
    };
  }
}
