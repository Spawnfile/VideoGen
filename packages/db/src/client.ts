import pg from 'pg';

export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(url: string, max = 8): pg.Pool {
  return new pg.Pool({ connectionString: url, max });
}
