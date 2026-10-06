import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface LinkResult { created: string[]; kept: string[]; missing: string[] }

/** claude-plugin/skills/<name> → manifest target (`~` expanded). Per-machine absolute links are generated, not committed (M0 §12). */
export function linkSkills(manifestPath: string, skillsDir: string, home = homedir()): LinkResult {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
  mkdirSync(skillsDir, { recursive: true });
  const r: LinkResult = { created: [], kept: [], missing: [] };
  for (const [name, raw] of Object.entries(manifest)) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid skill name: ${name}`);
    const target = raw.replace(/^~(?=\/)/, home);
    const link = join(skillsDir, name);
    if (!existsSync(target)) { r.missing.push(name); continue; }
    const st = lstatSync(link, { throwIfNoEntry: false });
    if (st && !st.isSymbolicLink()) throw new Error(`${link} is not a link; refusing to replace it`);
    if (st && readlinkSync(link) === target) { r.kept.push(name); continue; }
    if (st) rmSync(link);
    symlinkSync(target, link);
    r.created.push(name);
  }
  return r;
}
