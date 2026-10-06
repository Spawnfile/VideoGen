import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkSkills, PLUGIN_DIR } from '../src/index.ts';

describe('plugin skill links', () => {
  it('creates, keeps and repairs links from the manifest, skips missing targets and never replaces a real directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'vg-skills-home-'));
    mkdirSync(join(home, '.claude', 'skills', 'ffmpeg'), { recursive: true });
    const plug = mkdtempSync(join(tmpdir(), 'vg-skills-plug-'));
    const manifest = join(plug, 'skills.manifest.json');
    writeFileSync(manifest, JSON.stringify({ ffmpeg: '~/.claude/skills/ffmpeg', ghost: '~/nope' }));
    const skills = join(plug, 'skills');
    expect(linkSkills(manifest, skills, home)).toEqual({ created: ['ffmpeg'], kept: [], missing: ['ghost'] });
    expect(readlinkSync(join(skills, 'ffmpeg'))).toBe(join(home, '.claude', 'skills', 'ffmpeg'));
    expect(linkSkills(manifest, skills, home).kept).toEqual(['ffmpeg']);
    rmSync(join(skills, 'ffmpeg'));
    symlinkSync('/tmp', join(skills, 'ffmpeg'));
    expect(linkSkills(manifest, skills, home).created).toEqual(['ffmpeg']);
    rmSync(join(skills, 'ffmpeg'));
    mkdirSync(join(skills, 'ffmpeg'));
    expect(() => linkSkills(manifest, skills, home)).toThrow(/not a link/);
    const repo = JSON.parse(readFileSync(resolve(PLUGIN_DIR, 'skills.manifest.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(repo).sort()).toEqual(['ffmpeg', 'manim-video', 'remotion-best-practices', 'remotion-captions', 'remotion-markup', 'remotion-multimedia', 'remotion-render', 'video-use']);
    expect(Object.values(repo).every((v) => v.startsWith('~/'))).toBe(true);
  });
});
