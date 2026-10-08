import { execFile } from 'node:child_process';
import type { Config } from '@videogen/shared';

export type PgTool = 'pg_dump' | 'pg_restore';
export type PgVia = 'custom' | 'host' | 'docker';
/** `argv` carries no secret (Y9): the password goes in `env.PGPASSWORD`; docker gets `-e PGPASSWORD` without a value and copies it from its own env. */
export interface PgCommand { argv: string[]; via: PgVia; env: { PGPASSWORD: string } }
export type PgResolution = PgCommand | { error: string };
export type RunFn = (file: string, args: string[]) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export interface ResolveOptions {
  config: Pick<Config, 'adminDatabaseUrl' | 'backup'>;
  serverMajor: number;
  /** Version probes (`--version`); injected in tests. */
  run?: RunFn;
  /** Target database (restore); default the owner URL's. */
  database?: string;
}

/** Probes only: a short timeout, never throws (a missing binary is `code: null`). */
export const defaultRun: RunFn = (file, args) => new Promise((resolve) => {
  execFile(file, args, { timeout: 15_000, env: childEnv() }, (err, stdout, stderr) => {
    resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? Number((err as { code: number }).code) : null) : 0, stdout: String(stdout), stderr: String(stderr) });
  });
});

/** What a dump/restore child needs from our env (docker's client settings included); never the worker's other variables. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY'];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  return { ...env, ...extra };
}

const majorOf = (out: string): number | null => {
  const m = /\(PostgreSQL\)\s+(\d+)/.exec(out) ?? /\b(\d+)\.\d+/.exec(out);
  return m ? Number(m[1]) : null;
};

/** The owner role's connection (P3: `videogen_app` cannot read the drizzle schema), split so no URL reaches argv. */
function ownerConnection(url: string, database?: string) {
  const u = new URL(url);
  return {
    host: u.hostname || '127.0.0.1', port: u.port || '5432',
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    db: database ?? decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

async function resolveTool(tool: PgTool, o: ResolveOptions): Promise<PgResolution> {
  const run = o.run ?? defaultRun;
  const c = ownerConnection(o.config.adminDatabaseUrl, o.database);
  const env = { PGPASSWORD: c.password };
  const hostArgs = ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db];
  const custom = tool === 'pg_dump' ? o.config.backup.pgDump : o.config.backup.pgRestore;
  if (custom) return { via: 'custom', argv: [...custom, ...hostArgs], env };

  const host = await run(tool, ['--version']).catch(() => ({ code: null, stdout: '', stderr: '' }));
  const hostMajor = host.code === 0 ? majorOf(host.stdout) : null;
  if (hostMajor === o.serverMajor) return { via: 'host', argv: [tool, ...hostArgs], env };

  // Inside the container the configured 127.0.0.1:5433 means nothing: its own server on localhost:5432 (Y9).
  const container = o.config.backup.container;
  const inside = await run('docker', ['exec', container, tool, '--version']).catch(() => ({ code: null, stdout: '', stderr: '' }));
  if (inside.code === 0 && majorOf(inside.stdout) === o.serverMajor) {
    return { via: 'docker', argv: ['docker', 'exec', '-i', '-e', 'PGPASSWORD', container, tool, '-h', 'localhost', '-p', '5432', '-U', c.user, '-d', c.db], env };
  }
  const name = tool === 'pg_dump' ? 'VG_PG_DUMP' : 'VG_PG_RESTORE';
  return { error: `${tool} ${hostMajor ?? 'bulunamadı'}, sunucu ${o.serverMajor}: ${name} ayarlayın (docker exec ${container} ${tool} de kullanılamadı)` };
}

/**
 * Plan M7 Y9: `VG_PG_DUMP` if set; else the host's pg_dump when its major version is the server's; else `docker exec <VG_PG_CONTAINER>`;
 * else a reasoned refusal. Always the owner role (`adminDatabaseUrl`).
 */
export const resolvePgDump = (o: ResolveOptions) => resolveTool('pg_dump', o);
/** The same order for pg_restore (`VG_PG_RESTORE`): a 16 client cannot read a 17 archive. */
export const resolvePgRestore = (o: ResolveOptions) => resolveTool('pg_restore', o);

/** Error text that may echo a connection: the password and any URL are cut (Y9: neither reaches logs or audit). */
export function scrub(text: string, password: string): string {
  let s = text.replace(/postgres(?:ql)?:\/\/\S+/gi, '<bağlantı>');
  if (password) s = s.split(password).join('***');
  return s;
}
