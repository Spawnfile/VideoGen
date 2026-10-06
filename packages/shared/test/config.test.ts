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
});
