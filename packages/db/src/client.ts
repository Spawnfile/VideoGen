import pg from 'pg';

export type Queryable = Pick<pg.Pool, 'query'>;

/** Error class (+ code) only — pg messages can embed connection details. */
function tag(e: unknown): string {
  if (!(e instanceof Error)) return 'UnknownError';
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? `${e.name}:${code}` : e.name;
}

export function createPool(url: string, max = 8): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max });
  // An idle client that dies (server restart, pg_terminate_backend) is emitted on the pool; without a
  // listener EventEmitter throws and the process exits. pg-pool already discards the broken client.
  pool.on('error', (e) => { process.stderr.write(`db: idle client error (${tag(e)})\n`); });
  return pool;
}
