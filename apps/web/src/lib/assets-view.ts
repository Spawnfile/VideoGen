import { formatClock, LEDGER_KINDS, OWN_VOICE_LICENSE, UPLOAD_EXTS, type AssetListItem, type LedgerKind } from '@videogen/shared/browser';
import { blobUrl } from './api.ts';

export const REVOKE_CONFIRM = 'New composes and publishes can no longer use this asset; existing finals stay as they are';

/** Plan M7 Y8: the ledger page's kind chips. */
export const KIND_LABEL: Record<LedgerKind, string> = { music: 'Music', sfx: 'Sound effects', voice_ref: 'Voice sample' };

/** The licenses the Add form offers (the gate decides; a rejected file is still recorded). */
export const LICENSE_OPTIONS: { spdx: string; label: string }[] = [
  { spdx: 'CC0-1.0', label: 'CC0' },
  { spdx: 'CC-BY-4.0', label: 'CC BY 4.0' },
  { spdx: 'LicenseRef-Pixabay', label: 'Pixabay' },
  { spdx: OWN_VOICE_LICENSE, label: 'My own voice' },
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
      licenseLabel: tone === 'revoked' ? 'Permission revoked' : tone === 'rejected' ? `Rejected · ${a.licenseSpdx}` : (LICENSE_LABEL[a.licenseSpdx] ?? a.licenseSpdx),
      tone, revoked, note: tone === 'allowed' ? null : (revoked ? a.revokeReason : a.reason),
      duration: a.durationMs === null ? '—' : formatClock(a.durationMs / 1000),
      used: a.used > 0 ? `in ${a.used} version${a.used === 1 ? '' : 's'}` : 'Not used',
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
  if (!f.fileName) out.push('Choose an audio file.');
  else if (!(UPLOAD_EXTS as readonly string[]).includes(ext)) out.push(`The file must be ${UPLOAD_EXTS.slice(0, -1).join(', ')} or ${UPLOAD_EXTS.at(-1)}.`);
  if (!f.title.trim()) out.push('Enter a title.');
  if (!f.author.trim()) out.push('Enter the author.');
  if (!f.licenseText.trim()) out.push('Enter the license text.');
  if (f.license === 'CC-BY-4.0' && !f.attribution.trim()) out.push('CC BY 4.0 needs the attribution text.');
  return out;
}
