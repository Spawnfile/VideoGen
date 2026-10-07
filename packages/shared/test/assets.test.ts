import { describe, expect, it } from 'vitest';
import { ALLOWED_LICENSES, licenseVerdict } from '../src/index.ts';

describe('license gate (spec §9)', () => {
  it('allows CC0, Pixabay and CC-BY-4.0 with attribution; rejects NC/ND/SA, unknown and CC-BY without attribution', () => {
    expect(ALLOWED_LICENSES).toEqual(['CC0-1.0', 'CC-BY-4.0', 'LicenseRef-Pixabay']);
    expect(licenseVerdict({ spdx: 'CC0-1.0' })).toEqual({ allowed: true, reason_tr: null });
    expect(licenseVerdict({ spdx: 'LicenseRef-Pixabay' }).allowed).toBe(true);
    expect(licenseVerdict({ spdx: 'CC-BY-4.0', attribution: 'Müzik: Ada Yazar (CC BY 4.0)' }).allowed).toBe(true);
    expect(licenseVerdict({ spdx: 'CC-BY-4.0' })).toEqual({ allowed: false, reason_tr: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' });
    expect(licenseVerdict({ spdx: 'CC-BY-NC-4.0' })).toEqual({ allowed: false, reason_tr: 'lisans izinli değil: CC-BY-NC-4.0 (izinli: CC0-1.0, CC-BY-4.0, LicenseRef-Pixabay)' });
    expect(licenseVerdict({ spdx: 'LicenseRef-YouTube-Audio-Library' }).allowed).toBe(false);
  });

  it('licenseVerdict: LicenseRef-Own-Voice only for voice_ref; a voice_ref with another license is refused', () => {
    expect(licenseVerdict({ spdx: 'LicenseRef-Own-Voice', kind: 'voice_ref' })).toEqual({ allowed: true, reason_tr: null });
    expect(licenseVerdict({ spdx: 'LicenseRef-Own-Voice' }).allowed).toBe(false);
    expect(licenseVerdict({ spdx: 'LicenseRef-Own-Voice', kind: 'music' })).toEqual({ allowed: false, reason_tr: 'LicenseRef-Own-Voice yalnızca voice_ref türünde izinli' });
    expect(licenseVerdict({ spdx: 'CC0-1.0', kind: 'voice_ref' }).allowed).toBe(false);
    expect(licenseVerdict({ spdx: 'CC0-1.0', kind: 'music' }).allowed).toBe(true);
    expect(licenseVerdict({ spdx: 'CC-BY-4.0', kind: 'music' }).allowed).toBe(false); // attribution rule still applies per kind
  });
});
