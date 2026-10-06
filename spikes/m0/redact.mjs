import { readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';

const RULES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'user@example.com'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => (redactUuid.get(m) ?? setUuid(m))],
  [new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '/home/user'],
  // Streaming deltas split paths across chunks ("/alper/gpu"), so the homedir rule misses them: mask the bare username too
  [new RegExp(userInfo().username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'user'],
  // Claude project-dir slug: Claude replaces every non-alphanumeric char of the path with '-'
  [new RegExp(homedir().replace(/[^A-Za-z0-9]/g, '-'), 'g'), '-home-user'],
  // Thinking-block signatures are base64 and embed a plaintext account/org UUID (found by decoding); replay does not need them
  [/"signature":"[^"]*"/g, '"signature":"redacted"'],
];
const redactUuid = new Map();
function setUuid(m) {
  const v = `00000000-0000-4000-8000-${String(redactUuid.size + 1).padStart(12, '0')}`;
  redactUuid.set(m, v);
  return v;
}

// Streaming deltas split strings across chunks, so group the text-bearing delta fields of each content
// block (per parent_tool_use_id + index, reset at content_block_start) and work on the concatenation.
const FIELDS = ['text', 'thinking', 'partial_json'];
function deltaBlocks(msgs) {
  const gen = new Map();
  const blocks = new Map();
  for (const m of msgs) {
    const e = m.type === 'stream_event' ? m.event : null;
    if (!e || e.index === undefined) continue;
    const k = `${m.parent_tool_use_id}:${e.index}`;
    if (e.type === 'content_block_start') gen.set(k, (gen.get(k) ?? 0) + 1);
    const f = e.type === 'content_block_delta' && FIELDS.find((x) => typeof e.delta?.[x] === 'string');
    if (!f) continue;
    const id = `${k}:${gen.get(k) ?? 0}`;
    if (!blocks.has(id)) blocks.set(id, []);
    blocks.get(id).push([e.delta, f]);
  }
  return [...blocks.values()];
}
const readLines = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Concatenated delta text of every content block (for leak checks across chunk boundaries). */
export const blockTexts = (path) => deltaBlocks(readLines(path).map((l) => l.m)).map((b) => b.map(([d, f]) => d[f]).join(''));

const NAME = userInfo().username;
function maskSplitNames(lines) {
  for (const b of deltaBlocks(lines.map((l) => l.m))) {
    const parts = b.map(([d, f]) => d[f]);
    const text = parts.join('');
    const out = text.split('');
    for (let i = text.indexOf(NAME); i !== -1; i = text.indexOf(NAME, i + NAME.length)) {
      out[i] = 'user';
      for (let j = 1; j < NAME.length; j++) out[i + j] = '';
    }
    let pos = 0;
    b.forEach(([d, f], n) => { d[f] = out.slice(pos, pos + parts[n].length).join(''); pos += parts[n].length; });
  }
}

export function redactFile(path) {
  let s = readFileSync(path, 'utf8');
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  // Split-delta masking only applies to stream fixtures (every non-empty line is {t, m}); any other text file
  // (e.g. usage-response.json) only gets the regex rules above
  let lines;
  try {
    lines = s.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    lines = null;
  }
  const isStream = lines?.length > 0 && lines.every((l) => l && typeof l === 'object' && 't' in l && 'm' in l);
  if (!isStream) return writeFileSync(path, s);
  maskSplitNames(lines);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

if (import.meta.main) for (const p of process.argv.slice(2)) redactFile(p);
