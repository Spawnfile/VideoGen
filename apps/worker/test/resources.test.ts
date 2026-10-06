import { describe, expect, it } from 'vitest';
import { GPU_PRECHECK, parseMeminfo, parseOllamaPs, precheck, type ResourceSnapshot } from '../src/pipeline/resources.ts';

const ok: ResourceSnapshot = { memAvailableMb: 8000, swapUsedPct: 20, diskFreeMb: 50_000, vramFreeMb: 5500, ollamaModels: [] };

describe('precheck (spec §6.4)', () => {
  it('lets Claude jobs through and checks GPU jobs against RAM, swap, disk, VRAM and ollama with a Turkish reason', () => {
    expect(precheck('claude', { ...ok, memAvailableMb: 10 })).toEqual({ ok: true });
    expect(precheck('gpu', ok)).toEqual({ ok: true });
    expect(precheck('gpu', { ...ok, memAvailableMb: 1900 })).toEqual({ ok: false, status: 'waiting_gpu', reason: 'boş RAM 1,9 GB < 2,5 GB' });
    expect(precheck('gpu', { ...ok, swapUsedPct: 100 })).toEqual({ ok: false, status: 'waiting_gpu', reason: 'swap %100 ≥ %90' });
    expect(precheck('gpu', { ...ok, vramFreeMb: 3000 })).toEqual({ ok: false, status: 'waiting_gpu', reason: 'boş VRAM 2,9 GB < 4 GB' });
    expect(precheck('gpu', { ...ok, vramFreeMb: null })).toEqual({ ok: false, status: 'waiting_gpu', reason: 'VRAM okunamadı (nvidia-smi)' });
    expect(precheck('gpu', { ...ok, ollamaModels: ['gemma4:12b'] })).toEqual({ ok: false, status: 'waiting_gpu', reason: 'ollama modeli yüklü: gemma4:12b' });
    expect(precheck('gpu', { ...ok, ollamaModels: null })).toEqual({ ok: true });
    expect(precheck('gpu', { ...ok, diskFreeMb: 4000 }, 2000)).toEqual({ ok: false, status: 'waiting_disk', reason: 'boş disk 3,9 GB < 5 GB' });
    expect(precheck('heavy_cpu', { ...ok, diskFreeMb: 100, memAvailableMb: 10 })).toMatchObject({ ok: false, status: 'waiting_disk' });
    expect(GPU_PRECHECK).toEqual({ minRamMb: 2560, maxSwapPct: 90, minDiskMb: 3072, minVramMb: 4096 });
  });
});

describe('probe parsers', () => {
  it('reads MemAvailable and swap use from /proc/meminfo', () => {
    const text = 'MemTotal:       14000000 kB\nMemAvailable:    9830400 kB\nSwapTotal:       4194304 kB\nSwapFree:          28672 kB\n';
    expect(parseMeminfo(text)).toEqual({ memAvailableMb: 9600, swapUsedPct: 99.3 });
    expect(parseMeminfo('MemAvailable: 1024 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n')).toEqual({ memAvailableMb: 1, swapUsedPct: 0 });
  });

  it('lists loaded models from `ollama ps`', () => {
    expect(parseOllamaPs('NAME    ID    SIZE    PROCESSOR    UNTIL\n')).toEqual([]);
    expect(parseOllamaPs('NAME          ID     SIZE   PROCESSOR  UNTIL\ngemma4:12b    abc    9 GB   100% GPU   4 minutes from now\n')).toEqual(['gemma4:12b']);
  });
});
