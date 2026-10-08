import { formatClock, LEDGER_KINDS, OWN_VOICE_LICENSE, UPLOAD_EXTS, type AssetListItem, type LedgerKind } from '@videogen/shared/browser';
import { blobUrl } from './api.ts';

export { REVOKE_CONFIRM_TR } from '@videogen/shared/browser';

/** Plan M7 Y8: the ledger page's kind chips. */
export const KIND_LABEL: Record<LedgerKind, string> = { music: 'Müzik', sfx: 'SFX', voice_ref: 'Ses örneği' };

/** The licenses the Add form offers (the gate decides; a rejected file is still recorded). */
export const LICENSE_OPTIONS: { spdx: string; label: string }[] = [
  { spdx: 'CC0-1.0', label: 'CC0' },
  { spdx: 'CC-BY-4.0', label: 'CC BY 4.0' },
  { spdx: 'LicenseRef-Pixabay', label: 'Pixabay' },
  { spdx: OWN_VOICE_LICENSE, label: 'Kendi sesim' },
];
const LICENSE_LABEL: Record<string, string> = Object.fromEntries(LICENSE_OPTIONS.map((o) => [o.spdx, o.label]));

export type AssetTone = 'allowed' | 'rejected' | 'revoked';
export interface AssetRowView {
  id: string; title: string; licenseLabel: string; tone: AssetTone; attribution: string | null; author: string;
  source: { label: string; href: string } | null; duration: string; used: string; revoked: boolean;
  /** The rejection or revocation reason (null for an allowed row). */
  note: string | null; preview: string; canRevoke: boolean;
}

function sourceOf(url: string | null): AssetRowView['source'] {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? { label: u.hostname, href: u.href } : null;
  } catch {
    return null;
  }
}

/** Rows of one kind (ledger order) and the count per kind for the chips. */
export function assetsView(list: AssetListItem[], kind: LedgerKind): { rows: AssetRowView[]; counts: Record<LedgerKind, number> } {
  const counts = Object.fromEntries(LEDGER_KINDS.map((k) => [k, list.filter((a) => a.kind === k).length])) as Record<LedgerKind, number>;
  const rows = list.filter((a) => a.kind === kind).map((a): AssetRowView => {
    const revoked = a.revokedAt !== null;
    const tone: AssetTone = revoked ? 'revoked' : a.allowed ? 'allowed' : 'rejected';
    return {
      id: a.id, title: a.title, author: a.author, attribution: a.attribution?.trim() || null, source: sourceOf(a.sourceUrl),
      licenseLabel: tone === 'revoked' ? 'İzin geri alındı' : tone === 'rejected' ? `Reddedildi · ${a.licenseSpdx}` : (LICENSE_LABEL[a.licenseSpdx] ?? a.licenseSpdx),
      tone, revoked, note: tone === 'allowed' ? null : (revoked ? a.revokeReason : a.reason),
      duration: a.durationMs === null ? '—' : formatClock(a.durationMs / 1000),
      used: a.used > 0 ? `${a.used} sürümde` : 'Kullanılmadı',
      preview: blobUrl(a.blobSha), canRevoke: tone === 'allowed',
    };
  });
  return { rows, counts };
}

export interface AddForm { fileName: string | null; kind: LedgerKind; title: string; license: string; author: string; licenseText: string; attribution: string }

/** The Add form's own checks (the server's license gate still judges): a file of a listed type, title, author, the license text; CC BY needs the attribution. */
export function addFormErrors(f: AddForm): string[] {
  const out: string[] = [];
  const ext = f.fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (!f.fileName) out.push('Bir ses dosyası seçin.');
  else if (!(UPLOAD_EXTS as readonly string[]).includes(ext)) out.push(`Dosya türü ${UPLOAD_EXTS.slice(0, -1).join(', ')} ya da ${UPLOAD_EXTS.at(-1)} olmalı.`);
  if (!f.title.trim()) out.push('Başlık gerekli.');
  if (!f.author.trim()) out.push('Yazar gerekli.');
  if (!f.licenseText.trim()) out.push('Lisans metni gerekli.');
  if (f.license === 'CC-BY-4.0' && !f.attribution.trim()) out.push('CC BY 4.0 için atıf metni gerekli.');
  return out;
}
