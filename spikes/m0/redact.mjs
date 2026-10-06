import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const RULES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'user@example.com'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => (redactUuid.get(m) ?? setUuid(m))],
  [new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '/home/user'],
  // Claude project-dir slug: the home path with '/' -> '-' (e.g. memory_paths.auto)
  [new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('/', '-'), 'g'), '-home-user'],
];
const redactUuid = new Map();
function setUuid(m) {
  const v = `00000000-0000-4000-8000-${String(redactUuid.size + 1).padStart(12, '0')}`;
  redactUuid.set(m, v);
  return v;
}

export function redactFile(path) {
  let s = readFileSync(path, 'utf8');
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  writeFileSync(path, s);
}

if (import.meta.main) for (const p of process.argv.slice(2)) redactFile(p);
