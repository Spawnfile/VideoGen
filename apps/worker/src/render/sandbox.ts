import { execFile } from 'node:child_process';

/** NVIDIA PRIME offload (same as bin/blender-gpu): plain Blender/EGL picks the Intel iGPU (~3× slower). */
export const PRIME_ENV = {
  __NV_PRIME_RENDER_OFFLOAD: '1',
  __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
  __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
} as const;

export interface SandboxOptions {
  bwrap: string;
  /** The real $HOME: replaced by an empty tmpfs (or `persistentHome`), so ~/.ssh, ~/.claude, the repo and the data dir vanish. */
  home: string;
  /** The only writable path (the run directory). */
  runDir: string;
  /** Read-only binds re-exposed under the hidden home (Blender, python/vg_blender). */
  roBinds: string[];
  /** GPU renders need the NVIDIA device nodes; agent code (build phase 1) does not. */
  gpu: boolean;
  /** GPU renders: a persistent sandbox home keeps the shader cache (13.4 s → 0.7 s per run, probe P4). */
  persistentHome?: string;
}

/** bubblewrap argv (spec §6.6, §15, plan B3): read-only root, no network, no host home, new PID namespace and session, clean env. */
export function sandboxArgv(o: SandboxOptions, cmd: string[]): { file: string; args: string[] } {
  const env: Record<string, string> = { HOME: o.home, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', ...(o.gpu ? PRIME_ENV : {}) };
  // Order matters: later mounts sit on top. Empty tmpfs layers first, then the read-only and the writable binds (which may live
  // under $HOME or /tmp, e.g. the smoke data dir).
  const args = [
    '--ro-bind', '/', '/',
    '--tmpfs', o.home,
    ...(o.persistentHome ? ['--bind', o.persistentHome, o.home] : []),
    '--tmpfs', '/tmp',
    ...(o.gpu ? ['--dev-bind', '/dev', '/dev'] : ['--dev', '/dev']),
    '--proc', '/proc',
    ...o.roBinds.flatMap((p) => ['--ro-bind', p, p]),
    '--bind', o.runDir, o.runDir,
    '--unshare-net', '--unshare-pid', '--die-with-parent', '--new-session', '--clearenv',
    ...Object.entries(env).flatMap(([k, v]) => ['--setenv', k, v]),
    '--chdir', o.runDir,
    ...cmd,
  ];
  return { file: o.bwrap, args };
}

/** Startup capability check: bubblewrap must create the namespaces on this machine (AppArmor may forbid unprivileged userns). */
export function sandboxWorks(bwrap: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    execFile(bwrap, ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-net', '--unshare-pid', '--die-with-parent', 'true'], { timeout: 5000 }, (err) => {
      resolve(err ? { ok: false, reason: `bubblewrap çalışmıyor (${(err as NodeJS.ErrnoException).code ?? 'hata'})` } : { ok: true });
    });
  });
}
