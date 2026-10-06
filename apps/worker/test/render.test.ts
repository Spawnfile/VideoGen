import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_STYLES } from '@videogen/shared';
import { groupAlive } from '@videogen/claude';
import { reapOrphans, writePidFile } from '../src/agents/pids.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { contactSheet, testStill } from '../src/render/ffmpeg.ts';
import { withResource } from '../src/render/gate.ts';
import { ResourceLocks } from '../src/render/locks.ts';
import { runProcess } from '../src/render/process.ts';
import { PRIME_ENV, sandboxArgv } from '../src/render/sandbox.ts';
import type { Probe, ResourceSnapshot } from '../src/pipeline/resources.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const OK: ResourceSnapshot = { memAvailableMb: 8000, swapUsedPct: 0, diskFreeMb: 50_000, vramFreeMb: 5800, ollamaModels: [] };

describe('resource locks and the GPU gate', () => {
  it('grants in FIFO order and tells waiters their place in the queue', async () => {
    const locks = new ResourceLocks();
    const order: string[] = [];
    const pos: Record<string, number[]> = { b: [], c: [] };
    const ra = await locks.acquire('gpu', 'a');
    const pb = locks.acquire('gpu', 'b', { onQueue: (p) => pos.b!.push(p) }).then((r) => { order.push('b'); return r; });
    const pc = locks.acquire('gpu', 'c', { onQueue: (p) => pos.c!.push(p) }).then((r) => { order.push('c'); return r; });
    expect(locks.holder('gpu')).toBe('a');
    ra();
    ra(); // idempotent
    (await pb)();
    (await pc)();
    expect(order).toEqual(['b', 'c']);
    expect(pos).toEqual({ b: [1], c: [2, 1] });
    expect(locks.busy('gpu')).toBe(false);
  });

  it('an aborted waiter leaves the queue without blocking the others', async () => {
    const locks = new ResourceLocks();
    const ra = await locks.acquire('gpu', 'a');
    const ac = new AbortController();
    const pb = locks.acquire('gpu', 'b', { signal: ac.signal });
    const pc = locks.acquire('gpu', 'c');
    ac.abort();
    await expect(pb).rejects.toMatchObject({ name: 'AbortError' });
    ra();
    expect(locks.holder('gpu')).toBe('c');
    (await pc)();
  });

  it('waits on the spec §6.4 pre-check with its reason, then runs; an abort while waiting releases the lock', async () => {
    const locks = new ResourceLocks();
    let swap = 95;
    const probe: Probe = { snapshot: async () => ({ ...OK, swapUsedPct: swap }) };
    const waits: unknown[] = [];
    const r = withResource(locks, 'gpu', { owner: 'x', probe, waitMs: 20, onWait: (w) => { waits.push(w); swap = 10; } }, async () => 'ran');
    expect(await r).toBe('ran');
    expect(waits).toEqual([{ reason: 'swap %95 ≥ %90', status: 'waiting_gpu' }]);
    swap = 95;
    const ac = new AbortController();
    const stuck = withResource(locks, 'gpu', { owner: 'y', probe, waitMs: 20, signal: ac.signal, onWait: () => ac.abort() }, async () => 'never');
    await expect(stuck).rejects.toMatchObject({ name: 'AbortError' });
    expect(locks.busy('gpu')).toBe(false);
  });
});

describe('sandbox and process control', () => {
  it('builds a bubblewrap argv with no network, a hidden home and only the run dir writable; GPU adds devices and PRIME env', () => {
    const base = { bwrap: '/usr/bin/bwrap', home: '/home/u', runDir: '/home/u/videogen-data/runs/r1', roBinds: ['/home/u/apps/blender'] };
    const cpu = sandboxArgv({ ...base, gpu: false }, ['blender', '-b']).args.join(' ');
    expect(cpu).toContain('--ro-bind / /');
    expect(cpu.indexOf('--tmpfs /home/u')).toBeLessThan(cpu.indexOf('--ro-bind /home/u/apps/blender'));
    expect(cpu.indexOf('--tmpfs /home/u')).toBeLessThan(cpu.indexOf('--bind /home/u/videogen-data/runs/r1 /home/u/videogen-data/runs/r1'));
    expect(cpu.indexOf('--tmpfs /tmp')).toBeLessThan(cpu.indexOf('--ro-bind /home/u/apps/blender')); // binds under /tmp stay visible
    for (const f of ['--unshare-net', '--unshare-pid', '--die-with-parent', '--new-session', '--clearenv', '--dev /dev']) expect(cpu).toContain(f);
    expect(cpu).not.toContain('__NV_PRIME_RENDER_OFFLOAD');
    expect(cpu.endsWith('--chdir /home/u/videogen-data/runs/r1 blender -b')).toBe(true);
    const gpu = sandboxArgv({ ...base, gpu: true, persistentHome: '/home/u/videogen-data/cache/blender-home' }, ['blender']).args.join(' ');
    expect(gpu).toContain('--dev-bind /dev /dev');
    expect(gpu).toContain('--bind /home/u/videogen-data/cache/blender-home /home/u');
    expect(gpu).toContain(`--setenv __NV_PRIME_RENDER_OFFLOAD ${PRIME_ENV.__NV_PRIME_RENDER_OFFLOAD}`);
  });

  it('kills the whole process group on timeout and forgets its pid file', async () => {
    const data = tmp('vg-proc-');
    const r = await runProcess('bash', ['-c', 'sleep 30 & sleep 30'], { cwd: data, dataDir: data, owner: 'job', timeoutMs: 300, killGraceMs: 200, env: { PATH: process.env.PATH! } });
    expect(r.stopped).toBe('timeout');
    expect(readdirSync(join(data, 'pids')).length).toBe(0);
    // The caller survives the kill and runs the next job normally (Review Focus 1).
    const next = await runProcess('bash', ['-c', 'echo ok'], { cwd: data, dataDir: data, owner: 'job', timeoutMs: 5000, env: { PATH: process.env.PATH! } });
    expect([next.code, next.stopped, next.tail]).toEqual([0, null, ['ok']]);
  });

  it('stops a group whose memory grows past the limit, and stops on abort', async () => {
    const data = tmp('vg-proc-');
    const big = await runProcess('python3', ['-c', 'import time; x = bytearray(400 * 1024 * 1024); time.sleep(30)'], { cwd: data, dataDir: data, owner: 'job', timeoutMs: 20_000, maxRssMb: 150, sampleMs: 100, killGraceMs: 200, env: { PATH: process.env.PATH! } });
    expect(big.stopped).toBe('memory');
    const ac = new AbortController();
    const p = runProcess('sleep', ['30'], { cwd: data, dataDir: data, owner: 'job', timeoutMs: 20_000, signal: ac.signal, killGraceMs: 200, env: { PATH: process.env.PATH! } });
    setTimeout(() => ac.abort(), 100);
    expect((await p).stopped).toBe('aborted');
  });

  it('counts and kills a descendant that left the group (Chrome is spawned detached), and records its group for restart reaping (final review I2)', async () => {
    const data = tmp('vg-proc-');
    const child = 'import time; time.sleep(1); x = bytearray(400 * 1024 * 1024); time.sleep(30)';
    let seen: string[] = [];
    const r = runProcess('bash', ['-c', `setsid python3 -c '${child}' & wait`], {
      cwd: data, dataDir: data, owner: 'job', timeoutMs: 20_000, maxRssMb: 150, sampleMs: 100, killGraceMs: 200, env: { PATH: process.env.PATH! },
    });
    await vi.waitFor(() => { seen = existsSync(join(data, 'pids')) ? readdirSync(join(data, 'pids')) : []; expect(seen.length).toBe(2); }, { timeout: 5000, interval: 20 }).catch(() => {});
    expect((await r).stopped).toBe('memory');
    expect(seen).toHaveLength(2);
    const detached = seen.map((f) => Number(f.split('.')[0])).sort((a, b) => b - a)[0]!;
    // Dead or a zombie awaiting its (container) init: either way it no longer runs.
    const running = (p: number) => { try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${p}/stat`, 'utf8')); } catch { return false; } };
    await vi.waitFor(() => expect(running(detached)).toBe(false));
    expect(readdirSync(join(data, 'pids'))).toEqual([]);
  });

  it('startup recovery also reaps orphaned render groups recorded with kind "render"', async () => {
    const data = tmp('vg-reap-');
    const child = spawn('bash', ['-c', 'exec -a blender-fake sleep 30'], { detached: true, stdio: 'ignore' });
    const exited = new Promise((res) => child.once('exit', res));
    // Until exec runs, /proc/<pid>/cmdline is still the forked node process.
    // bash's own command line already contains the name: wait for argv[0] after the exec, or the reap can race execve.
    await vi.waitFor(() => expect(readFileSync(`/proc/${child.pid}/cmdline`, 'utf8').split('\0')[0]).toBe('blender-fake'));
    await writePidFile(data, child.pid!, 'job-1', 'render');
    expect(JSON.parse(readFileSync(join(data, 'pids', `${child.pid}.json`), 'utf8')).kind).toBe('render');
    expect(await reapOrphans(data)).toEqual([child.pid]);
    await exited;
    expect(groupAlive(child.pid!)).toBe(false);
  });
});

describe('ffmpeg helpers and the fake render driver', () => {
  it('tiles up to eight stills into one 4×2 contact sheet with the safe-area overlay', async () => {
    const dir = tmp('vg-sheet-');
    for (const f of [0, 30, 60]) await testStill(FFMPEG, join(dir, `f${String(f).padStart(5, '0')}.png`), { width: 540, height: 960 });
    await contactSheet(FFMPEG, dir, join(dir, 'sheet.png'));
    const size = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(dir, 'sheet.png')]).toString().trim();
    expect(size).toBe(`${4 * 270 + 3 * 6},${2 * 480 + 6}`); // padding sits between tiles only
    // Transparent stills over the style backdrop: an empty frame shows the gradient's own colour (no AgX shift).
    const clear = tmp('vg-sheet-');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=540x960,format=rgba', '-frames:v', '1', join(clear, 'f00000.png')]);
    await contactSheet(FFMPEG, clear, join(clear, 'sheet.png'), { background: { top: '#f7f5f1', bottom: '#f7f5f1' }, safeArea: false });
    const px = execFileSync(FFMPEG, ['-v', 'error', '-i', join(clear, 'sheet.png'), '-vf', 'crop=1:1:100:300', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    expect([...px]).toEqual([0xf7, 0xf5, 0xf1]);
  });

  it('fake build copies the committed pen outputs, and a vg-fake-error marker fails it like a product error', async () => {
    const run = tmp('vg-fake-');
    mkdirSync(join(run, 'scene'), { recursive: true });
    writeFileSync(join(run, 'scene', 'product.py'), 'def build(vg):\n    pass\n');
    const d = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    const input = { runDir: run, specPath: '', storyboardPath: '', productPath: join(run, 'scene', 'product.py'), outDir: join(run, 'scene', 'build'), style: CHANNEL_STYLES.gece_mavisi, owner: 'x' };
    const ok = await d.build(input);
    expect(ok.report.ok).toBe(true);
    expect(existsSync(ok.files!.glb)).toBe(true);
    writeFileSync(join(run, 'scene', 'product.py'), '# vg-fake-error: product.py satır 3: NameError: name \'x\' is not defined\ndef build(vg):\n    pass\n');
    const bad = await d.build(input);
    expect(bad).toMatchObject({ files: null, report: { ok: false, errors: ["product.py satır 3: NameError: name 'x' is not defined"] } });
  });

  it('fake stills reports per-frame progress', async () => {
    const run = tmp('vg-fake-');
    const seen: string[] = [];
    const r = await new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }).stills({ runDir: run, blendPath: 'x', frames: [0, 675], outDir: join(run, 'stills'), owner: 'x', onProgress: (a, b) => seen.push(`${a}/${b}`) });
    expect(seen).toEqual(['1/2', '2/2']);
    expect(r.files.map((f) => f.split('/').at(-1))).toEqual(['f00000.png', 'f00675.png']);
  });
});
