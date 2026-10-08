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

/** Plan M7 Y8: the kinds the ledger page lists (the pipeline uses these; fonts, HDRIs and 3D models are not shown). */
export const LEDGER_KINDS = ['music', 'sfx', 'voice_ref'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Y8 uploads: `POST /api/uploads?ext=…` (application/octet-stream, streamed to `<dataDir>/uploads/<uuid>.<ext>`). */
export const UPLOAD_EXTS = ['wav', 'mp3', 'flac', 'ogg', 'm4a'] as const;
export const UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

/** Y8: the revoke dialog's text (the UI shows it, the test pins it). */
export const REVOKE_CONFIRM_TR = 'Bu varlık yeni compose ve yayınlarda kullanılamaz; mevcut finaller değişmez';

/** `GET /api/assets` row: the ledger fields, the verdict's reason (or the revocation's), and the usage count (versions whose audio plan plays it). */
export interface AssetListItem {
  id: string; kind: AssetKind; title: string; licenseSpdx: string; author: string; sourceUrl: string | null; attribution: string | null;
  allowed: boolean; reason: string | null; revokedAt: string | null; revokeReason: string | null; durationMs: number | null; tags: string[];
  blobSha: string; createdAt: string; used: number;
}

/**
 * Y8 / P8: why a clone voice may not use this ledger row (null: it may). The voice preflight and the voice step both ask; the stored verdict,
 * the revocation and today's license rule all count.
 */
export function voiceRefProblem(a: { kind: AssetKind; title: string; allowed: boolean; licenseSpdx: string; attribution: string | null; revokedAt?: string | null } | null): string | null {
  if (!a || a.kind !== 'voice_ref') return 'ses referansı defterde yok';
  if (a.revokedAt) return `ses referansının izni geri alındı: ${a.title}`;
  if (!a.allowed || !licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: 'voice_ref' }).allowed) return `ses referansı izinli değil: ${a.title}`;
  return null;
}
