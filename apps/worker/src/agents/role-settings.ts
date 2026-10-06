import type pg from 'pg';
import { ROLE_NAMES, type Effort, type ModelAlias, type RoleName } from '@videogen/shared';
import type { RoleOverrides } from '@videogen/claude';

const MODELS = new Set<ModelAlias>(['opus', 'sonnet', 'haiku']);
const EFFORTS = new Set<Effort>(['low', 'medium', 'high', 'xhigh', 'max']);

/** settings.roles = { [role]: { model?, effort? } }; unknown roles and values are ignored. */
export async function loadRoleOverrides(pool: pg.Pool): Promise<RoleOverrides> {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'roles'");
  const raw = (rows[0]?.value ?? {}) as Record<string, { model?: unknown; effort?: unknown }>;
  const out: RoleOverrides = {};
  for (const r of ROLE_NAMES as readonly RoleName[]) {
    const v = raw[r];
    if (!v) continue;
    const model = MODELS.has(v.model as ModelAlias) ? (v.model as ModelAlias) : undefined;
    const effort = EFFORTS.has(v.effort as Effort) ? (v.effort as Effort) : undefined;
    if (model || effort) out[r] = { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
  }
  return out;
}
