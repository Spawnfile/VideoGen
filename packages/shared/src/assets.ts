/** Spec §11.1 assets.kind. M5a uses music and sfx; the others are reserved (fonts, HDRIs, 3D models: M7; voice references: M5c). */
export const ASSET_KINDS = ['music', 'sfx', 'model3d', 'hdri', 'font', 'voice_ref'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Spec §9: only these may reach a render. NC, ND, SA and the YouTube Audio Library standard license are blocked. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'LicenseRef-Pixabay'] as const;

export function licenseVerdict(a: { spdx: string; attribution?: string | null }): { allowed: boolean; reason_tr: string | null } {
  if (!(ALLOWED_LICENSES as readonly string[]).includes(a.spdx)) return { allowed: false, reason_tr: `lisans izinli değil: ${a.spdx} (izinli: ${ALLOWED_LICENSES.join(', ')})` };
  if (a.spdx === 'CC-BY-4.0' && !a.attribution?.trim()) return { allowed: false, reason_tr: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' };
  return { allowed: true, reason_tr: null };
}
