#!/usr/bin/env node
// Generates claude-plugin/skills/* symlinks from skills.manifest.json (idempotent; run by `npm start`).
import { resolve } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { linkSkills } = await import('../packages/claude/src/skill-links.ts');
const root = resolve(import.meta.dirname, '..');
const r = linkSkills(resolve(root, 'claude-plugin/skills.manifest.json'), resolve(root, 'claude-plugin/skills'));
if (r.missing.length) console.error(`[videogen] skill hedefi bulunamadı, atlandı: ${r.missing.join(', ')}`);
if (r.created.length) console.log(`[videogen] skill bağlantıları kuruldu: ${r.created.join(', ')}`);
