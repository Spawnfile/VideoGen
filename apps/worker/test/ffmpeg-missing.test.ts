import { describe, expect, it } from 'vitest';
import { ffmpegCapability, run } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';

describe('a missing ffmpeg (the service PATH lacked ~/.local/bin: every preview failed as a bare "Error")', () => {
  it('run keeps the ENOENT code and says ffmpeg was not found', async () => {
    await expect(run('/nonexistent/ffmpeg', ['-version'])).rejects.toMatchObject({ code: 'ENOENT', message: expect.stringMatching(/ffmpeg bulunamadı/) });
  });

  it('ffmpegCapability: ok with a working ffmpeg; not ok with the reason when it is missing', async () => {
    expect(await ffmpegCapability(FFMPEG)).toEqual({ ok: true });
    expect(await ffmpegCapability('/nonexistent/ffmpeg')).toMatchObject({ ok: false, reason: expect.stringMatching(/ffmpeg bulunamadı/) });
  });
});
