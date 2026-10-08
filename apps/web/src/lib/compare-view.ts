import { DIMENSION_IDS, DIMENSIONS, type DimensionId, type VersionView } from '@videogen/shared/browser';

export type CompareVariant = 'music' | 'tiktok';
export interface CompareSide { id: string; round: number; label: string; sha: string; coverSha: string | null; durationS: number; total: number | null; best: boolean }
export interface CompareDelta { total: number | null; dims: { id: DimensionId; label: string; a: number | null; b: number | null; delta: number | null }[] }
export interface CompareView { a: CompareSide | null; b: CompareSide | null; delta: CompareDelta; canCompare: boolean; reason?: string }

/** Plan M7 Y7: a sync correction is due only past this drift (s). */
export const SYNC_DRIFT_S = 0.15;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const versionLabel = (v: Pick<VersionView, 'round'>): string => `Sürüm ${v.round + 1}`;
export const finished = (versions: VersionView[]): VersionView[] => versions.filter((v) => !!v.finals);

function side(v: VersionView | undefined, variant: CompareVariant): CompareSide | null {
  if (!v?.finals) return null;
  const sha = variant === 'tiktok' ? (v.finals.tiktokSha ?? v.finals.musicSha) : v.finals.musicSha;
  return { id: v.id, round: v.round, label: versionLabel(v), sha, coverSha: v.finals.coverSha, durationS: v.finals.durationS, total: v.total, best: v.best };
}

/**
 * The default pair: B is the best finished version (else the newest finished), A the finished version just before it (else the newest
 * other finished one).
 */
export function defaultPair(versions: VersionView[]): { aId: string | null; bId: string | null } {
  const done = finished(versions);
  const b = done.find((v) => v.best) ?? done.at(-1);
  if (!b) return { aId: null, bId: null };
  const before = done.filter((v) => v.round < b.round).at(-1);
  const a = before ?? done.filter((v) => v.id !== b.id).at(-1);
  return { aId: a?.id ?? null, bId: b.id };
}

/** Two versions side by side: deltas are B − A. A version without a final cannot be picked (an unfinished round). */
export function compareView(versions: VersionView[], aId: string | null | undefined, bId: string | null | undefined, variant: CompareVariant): CompareView {
  const pair = aId || bId ? { aId: aId ?? null, bId: bId ?? null } : defaultPair(versions);
  const va = versions.find((v) => v.id === pair.aId);
  const vb = versions.find((v) => v.id === pair.bId);
  const a = side(va, variant);
  const b = side(vb, variant);
  const dims = DIMENSION_IDS.map((id) => {
    const x = va?.finals ? (va.dims?.[id] ?? null) : null;
    const y = vb?.finals ? (vb.dims?.[id] ?? null) : null;
    return { id, label: DIMENSIONS[id].label_tr, a: x, b: y, delta: x !== null && y !== null ? r2(y - x) : null };
  });
  const delta = { total: a?.total != null && b?.total != null ? r2(b.total - a.total) : null, dims };
  const unfinished = [va, vb].find((v) => v && !v.finals);
  const reason = unfinished ? `${versionLabel(unfinished)} tamamlanmadı: finali yok, karşılaştırılamaz`
    : !a || !b ? 'Karşılaştırmak için finali olan iki sürüm gerekir'
    : a.id === b.id ? 'Aynı sürüm iki kez seçildi'
    : undefined;
  return { a, b, delta, canCompare: !reason, ...(reason ? { reason } : {}) };
}

/** Side-by-side sync: A leads; B is moved to A's time only when it drifted more than 0.15 s. */
export function syncPlan(aTime: number, bTime: number): { seekB?: number } {
  return Math.abs(aTime - bTime) > SYNC_DRIFT_S + 1e-9 ? { seekB: aTime } : {};
}
