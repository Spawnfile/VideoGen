import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index.ts';

describe('config', () => {
  it('dev endpoints need the fake Claude driver (M3 minor 5); render settings default to the real tools', () => {
    expect(loadConfig({ VG_DEV_ENDPOINTS: '1' }).devEndpoints).toBe(false);
    expect(loadConfig({ VG_DEV_ENDPOINTS: '1', VG_CLAUDE_DRIVER: 'fake' }).devEndpoints).toBe(true);
    expect(loadConfig({}).render).toMatchObject({ driver: 'real', bwrap: '/usr/bin/bwrap', ffmpeg: 'ffmpeg' });
    expect(loadConfig({}).render.blender).toMatch(/apps\/blender-5\.2\.2-linux-x64\/blender$/);
    expect(loadConfig({ VG_RENDER_DRIVER: 'fake', VG_FFMPEG: '/x/ffmpeg' }).render).toMatchObject({ driver: 'fake', ffmpeg: '/x/ffmpeg' });
  });

  it('VG_AUDIO_TIMEOUT_MS and VG_AUDIO_MAX_RSS_MB reach the audio driver; defaults stay 900 000 ms and 6000 MB; invalid values are refused at start', () => {
    // main.ts spreads config.audio into PythonAudioDriver's options: the keys are the driver's own (timeoutMs, maxRssMb).
    expect(loadConfig({}).audio).toMatchObject({ timeoutMs: 900_000, maxRssMb: 6000 });
    expect(loadConfig({ VG_AUDIO_TIMEOUT_MS: '1200000', VG_AUDIO_MAX_RSS_MB: '7500' }).audio).toMatchObject({ timeoutMs: 1_200_000, maxRssMb: 7500 });
    expect(loadConfig({ VG_AUDIO_TIMEOUT_MS: ' ', VG_AUDIO_MAX_RSS_MB: '' }).audio).toMatchObject({ timeoutMs: 900_000, maxRssMb: 6000 });
    for (const bad of ['0', '-5', '1.5', 'abc', '15m']) {
      expect(() => loadConfig({ VG_AUDIO_TIMEOUT_MS: bad })).toThrow('VG_AUDIO_TIMEOUT_MS: pozitif bir tam sayı bekleniyor');
      expect(() => loadConfig({ VG_AUDIO_MAX_RSS_MB: bad })).toThrow('VG_AUDIO_MAX_RSS_MB: pozitif bir tam sayı bekleniyor');
    }
  });
});
