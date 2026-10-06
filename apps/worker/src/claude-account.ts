import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type pg from 'pg';
import { type ClaudeAuth, cleanChildEnv, parseAuthStatus } from '@videogen/shared';
import { publishEvent } from '@videogen/db';

const execFileP = promisify(execFile);

export interface AuthStatusSource { read(): Promise<ClaudeAuth> }

export class CliAuthStatus implements AuthStatusSource {
  constructor(private readonly bin: string) {}
  async read(): Promise<ClaudeAuth> {
    // Failure messages are fixed strings: CLI stdout/stderr (or JSON.parse snippets of it) may carry identifying text.
    const fail = (error: string): ClaudeAuth => ({ loggedIn: false, authMethod: null, subscriptionType: null, checkedAt: new Date().toISOString(), error });
    let stdout: string;
    try {
      ({ stdout } = await execFileP(this.bin, ['auth', 'status'], { env: cleanChildEnv(), timeout: 15_000 }));
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      return fail(`auth status failed (${typeof code === 'number' ? `exit ${code}` : 'could not run'})`);
    }
    try {
      return parseAuthStatus(stdout);
    } catch {
      return fail('auth status: unparseable output');
    }
  }
}

export class FixtureAuthStatus implements AuthStatusSource {
  constructor(private readonly path: string) {}
  async read(): Promise<ClaudeAuth> {
    return parseAuthStatus(await readFile(this.path, 'utf8'));
  }
}

export async function refreshAuth(pool: pg.Pool, src: AuthStatusSource): Promise<ClaudeAuth> {
  const a = await src.read();
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('claude.auth', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(a)],
  );
  await publishEvent(pool, { topic: 'system', type: 'claude.auth', payload: a });
  return a;
}
