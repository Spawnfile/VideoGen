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

  it('the audio service is only its Python (spec Z1: no voice CLI, no Freya venv, no model weights); a bad integer setting is refused at start', () => {
    expect(Object.keys(loadConfig({}).audio)).toEqual(['python']);
    expect(loadConfig({ VG_AUDIO_PYTHON: '/x/python' }).audio.python).toBe('/x/python');
    for (const bad of ['0', '-5', '1.5', 'abc', '15m']) expect(() => loadConfig({ VG_BACKUP_KEEP: bad })).toThrow('VG_BACKUP_KEEP: pozitif bir tam sayı bekleniyor');
  });
});
