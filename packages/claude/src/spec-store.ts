import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import type { SpecKind } from './roles.ts';

export type SpecValidator = (kind: SpecKind, value: unknown) => { ok: true } | { ok: false; errors: string[] };
export interface SpecDiff { path: string; op: 'add' | 'remove' | 'replace' }

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Kinds without a schema yet (M4 brings the artifact contracts) must at least be JSON objects. */
export const permissiveValidator: SpecValidator = (_kind, value) => (isObject(value) ? { ok: true } : { ok: false, errors: ['spec must be a JSON object'] });

export function zodValidator(schemas: Partial<Record<SpecKind, z.ZodType>>): SpecValidator {
  return (kind, value) => {
    const s = schemas[kind];
    if (!s) return permissiveValidator(kind, value);
    const r = s.safeParse(value);
    return r.success ? { ok: true } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`) };
  };
}

export function diffJson(a: unknown, b: unknown, path = '$'): SpecDiff[] {
  if (a === undefined) return b === undefined ? [] : [{ path, op: 'add' }];
  if (b === undefined) return [{ path, op: 'remove' }];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: SpecDiff[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diffJson(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diffJson(a[k], b[k], `${path}.${k}`));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path, op: 'replace' }];
}

const file = (v: number) => `v${String(v).padStart(4, '0')}.json`;

/** Versioned spec files under <runDir>/spec/<kind>/vNNNN.json, written atomically. */
export class SpecStore {
  constructor(private readonly dir: string, private readonly validate: SpecValidator = permissiveValidator) {}

  private async versions(kind: SpecKind): Promise<number[]> {
    const names = await readdir(join(this.dir, kind)).catch(() => [] as string[]);
    return names.map((n) => /^v(\d{4})\.json$/.exec(n)?.[1]).filter((x): x is string => !!x).map(Number).sort((a, b) => a - b);
  }

  async read(kind: SpecKind, version?: number): Promise<{ version: number; value: unknown } | null> {
    const all = await this.versions(kind);
    const v = version ?? all.at(-1);
    if (v === undefined || !all.includes(v)) return null;
    return { version: v, value: JSON.parse(await readFile(join(this.dir, kind, file(v)), 'utf8')) };
  }

  async write(kind: SpecKind, value: unknown): Promise<{ version: number; diff: SpecDiff[] } | { errors: string[] }> {
    const check = this.validate(kind, value);
    if (!check.ok) return { errors: check.errors };
    const prev = await this.read(kind);
    const version = (prev?.version ?? 0) + 1;
    const dir = join(this.dir, kind);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.${file(version)}.tmp`);
    const fh = await open(tmp, 'w');
    try {
      await fh.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, join(dir, file(version)));
    return { version, diff: diffJson(prev?.value, value) };
  }
}
