/** Spec §11.1 assets.kind. M5a uses music and sfx; the others are reserved (fonts, HDRIs, 3D models: M7; voice references: M5c). */
export const ASSET_KINDS = ['music', 'sfx', 'model3d', 'hdri', 'font', 'voice_ref'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Spec §9: only these may reach a render. NC, ND, SA and the YouTube Audio Library standard license are blocked. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'LicenseRef-Pixabay'] as const;

/** The license of a user's own voice reference (M5c H7): allowed for kind voice_ref and for no other kind. */
export const OWN_VOICE_LICENSE = 'LicenseRef-Own-Voice';

/** The procedural SFX library (apps/worker/src/assets.ts makes the sounds; the names are the single source here). */
export const SFX_NAMES = ['whoosh', 'swoosh', 'click', 'snap', 'tick', 'thud'] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export function licenseVerdict(a: { spdx: string; attribution?: string | null; kind?: AssetKind }): { allowed: boolean; reason_tr: string | null } {
  if (a.kind === 'voice_ref') {
    if (a.spdx !== OWN_VOICE_LICENSE) return { allowed: false, reason_tr: `ses referansı yalnızca kendi sesiniz olabilir (${OWN_VOICE_LICENSE}): ${a.spdx}` };
    return { allowed: true, reason_tr: null };
  }
  if (a.spdx === OWN_VOICE_LICENSE) return { allowed: false, reason_tr: `${OWN_VOICE_LICENSE} yalnızca voice_ref türünde izinli` };
  if (!(ALLOWED_LICENSES as readonly string[]).includes(a.spdx)) return { allowed: false, reason_tr: `lisans izinli değil: ${a.spdx} (izinli: ${ALLOWED_LICENSES.join(', ')})` };
  if (a.spdx === 'CC-BY-4.0' && !a.attribution?.trim()) return { allowed: false, reason_tr: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' };
  return { allowed: true, reason_tr: null };
}
