import { licenseVerdict, type AssetKind } from './assets.ts';

/** The ledger assets that play in a final: its sound plan's cues and music bed (the composer's own music has no asset). */
export interface SoundPlanLike { cues: { assetId: string }[]; music: { assetId: string } | null }
export interface AttributionAsset { id: string; title: string; licenseSpdx: string; attribution: string | null; own: boolean; allowed: boolean; kind?: AssetKind }

/**
 * Video library (kept from the removed publish path, plan M6 Y12): the attribution lines a caption must carry, and the assets that are
 * no longer allowed (revoked, unknown, or CC-BY without attribution) — a final using one of them must not be uploaded.
 */
export function attributionLines(plan: SoundPlanLike, assets: AttributionAsset[]): { lines: string[]; refused: string[] } {
  const ids = [...plan.cues.map((c) => c.assetId), ...(plan.music ? [plan.music.assetId] : [])];
  const lines: string[] = [];
  const refused: string[] = [];
  for (const id of [...new Set(ids)]) {
    const a = assets.find((x) => x.id === id);
    if (!a) { refused.push(id); continue; }
    if (a.own) continue;
    if (!a.allowed || !licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: a.kind }).allowed) { refused.push(a.title); continue; }
    if (a.licenseSpdx === 'CC-BY-4.0') lines.push(a.attribution!.trim());
  }
  return { lines: [...new Set(lines)], refused };
}
