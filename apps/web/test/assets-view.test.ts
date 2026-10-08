import { describe, expect, it } from 'vitest';
import type { AssetListItem } from '@videogen/shared/browser';
import { addFormErrors, assetsView, REVOKE_CONFIRM_TR } from '../src/lib/assets-view.ts';

const item = (o: Partial<AssetListItem>): AssetListItem => ({
  id: 'a', kind: 'music', title: 'Parça', licenseSpdx: 'CC0-1.0', author: 'Yazar', sourceUrl: null, attribution: null, allowed: true, reason: null,
  revokedAt: null, revokeReason: null, durationMs: 62_400, tags: [], blobSha: 'ab'.repeat(32), createdAt: '2026-10-08T07:00:00Z', used: 0, ...o,
});

describe('asset ledger helpers (plan M7 T5)', () => {
  it('assetsView and addFormErrors: license badges (CC0, CC-BY with attribution, Pixabay, rejected, revoked), usage counts, attribution required for CC-BY and the license text always', () => {
    const list = [
      item({ id: 'cc0', title: 'Sakin', used: 3, sourceUrl: 'https://freemusicarchive.org/music/x' }),
      item({ id: 'ccby', title: 'Yatak', licenseSpdx: 'CC-BY-4.0', attribution: 'Müzik: Bora Besteci (CC BY 4.0)', used: 1 }),
      item({ id: 'pix', title: 'Pixabay parça', licenseSpdx: 'LicenseRef-Pixabay', durationMs: null, sourceUrl: 'javascript:alert(1)' }),
      item({ id: 'nc', title: 'NC parça', licenseSpdx: 'CC-BY-NC-4.0', allowed: false, reason: 'lisans izinli değil: CC-BY-NC-4.0 (izinli: CC0-1.0, CC-BY-4.0, LicenseRef-Pixabay)' }),
      item({ id: 'rv', title: 'Geri alınan', allowed: false, revokedAt: '2026-10-08T09:00:00Z', revokeReason: 'sahibi izni çekti', used: 2 }),
      item({ id: 'sfx', kind: 'sfx', title: 'whoosh' }),
      item({ id: 'me', kind: 'voice_ref', title: 'Kendi sesim', licenseSpdx: 'LicenseRef-Own-Voice', durationMs: 9_000 }),
    ];
    const v = assetsView(list, 'music');
    expect(v.counts).toEqual({ music: 5, sfx: 1, voice_ref: 1 });
    expect(v.rows.map((r) => r.id)).toEqual(['cc0', 'ccby', 'pix', 'nc', 'rv']);
    expect(v.rows[0]).toMatchObject({ licenseLabel: 'CC0', tone: 'allowed', attribution: null, author: 'Yazar', source: { label: 'freemusicarchive.org', href: 'https://freemusicarchive.org/music/x' }, duration: '1:02', used: '3 sürümde', revoked: false, canRevoke: true });
    expect(v.rows[1]).toMatchObject({ licenseLabel: 'CC BY 4.0', tone: 'allowed', attribution: 'Müzik: Bora Besteci (CC BY 4.0)', used: '1 sürümde' });
    // Only http(s) sources become links.
    expect(v.rows[2]).toMatchObject({ licenseLabel: 'Pixabay', source: null, duration: '—', used: 'Kullanılmadı' });
    expect(v.rows[3]).toMatchObject({ licenseLabel: 'Reddedildi · CC-BY-NC-4.0', tone: 'rejected', note: 'lisans izinli değil: CC-BY-NC-4.0 (izinli: CC0-1.0, CC-BY-4.0, LicenseRef-Pixabay)', canRevoke: false });
    expect(v.rows[4]).toMatchObject({ licenseLabel: 'İzin geri alındı', tone: 'revoked', revoked: true, note: 'sahibi izni çekti', used: '2 sürümde', canRevoke: false });
    expect(v.rows[0]!.preview).toBe(`/api/blobs/${'ab'.repeat(32)}`);
    expect(assetsView(list, 'voice_ref').rows).toEqual([expect.objectContaining({ id: 'me', licenseLabel: 'Kendi sesim', tone: 'allowed', duration: '0:09' })]);

    const ok = { fileName: 'parca.mp3', kind: 'music' as const, title: 'Parça', license: 'CC0-1.0', author: 'Yazar', licenseText: 'CC0 1.0', attribution: '' };
    expect(addFormErrors(ok)).toEqual([]);
    expect(addFormErrors({ ...ok, fileName: null, title: ' ', licenseText: '' })).toEqual(['Bir ses dosyası seçin.', 'Başlık gerekli.', 'Lisans metni gerekli.']);
    expect(addFormErrors({ ...ok, fileName: 'parca.aiff' })).toEqual(['Dosya türü wav, mp3, flac, ogg ya da m4a olmalı.']);
    expect(addFormErrors({ ...ok, license: 'CC-BY-4.0' })).toEqual(['CC BY 4.0 için atıf metni gerekli.']);
    expect(addFormErrors({ ...ok, license: 'CC-BY-4.0', attribution: 'Müzik: X (CC BY 4.0)' })).toEqual([]);
    expect(addFormErrors({ ...ok, author: '' })).toEqual(['Yazar gerekli.']);
    expect(REVOKE_CONFIRM_TR).toBe('Bu varlık yeni compose ve yayınlarda kullanılamaz; mevcut finaller değişmez');
  });
});
