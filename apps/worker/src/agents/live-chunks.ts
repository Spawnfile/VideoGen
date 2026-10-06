import type { LiveTraceItem } from '@videogen/shared';

const PIECE_CHARS = 1000; // ≤ 6 bytes per char after JSON escaping → ≤ 6 KB per piece
const ENVELOPE = 256;

/**
 * vg_live payloads must stay under pg_notify's 8000-byte limit (publishLive rejects > 7900). Text deltas of the same
 * row are merged, tokens keep only the latest value per row, long texts are split, items are packed into chunks.
 */
export function chunkLive(sessionId: string, items: LiveTraceItem[], maxBytes = 7500): { sessionId: string; d: LiveTraceItem[] }[] {
  const merged: LiveTraceItem[] = [];
  const tokens = new Map<string, LiveTraceItem>();
  for (const it of items) {
    if (it.tokens !== undefined) {
      const prev = tokens.get(it.rowId);
      if (prev) prev.tokens = it.tokens;
      else { const x = { rowId: it.rowId, tokens: it.tokens }; tokens.set(it.rowId, x); merged.push(x); }
      continue;
    }
    const last = merged.at(-1);
    if (last && last.rowId === it.rowId && last.text !== undefined) last.text += it.text ?? '';
    else merged.push({ rowId: it.rowId, text: it.text ?? '' });
  }
  const out: { sessionId: string; d: LiveTraceItem[] }[] = [];
  let cur: LiveTraceItem[] = [];
  let size = ENVELOPE;
  const flush = () => { if (cur.length) out.push({ sessionId, d: cur }); cur = []; size = ENVELOPE; };
  for (const it of merged) {
    const pieces: LiveTraceItem[] = [];
    if (it.text !== undefined && it.text.length > PIECE_CHARS) {
      for (let i = 0; i < it.text.length; i += PIECE_CHARS) pieces.push({ rowId: it.rowId, text: it.text.slice(i, i + PIECE_CHARS) });
    } else pieces.push(it);
    for (const p of pieces) {
      const s = Buffer.byteLength(JSON.stringify(p)) + 1;
      if (size + s > maxBytes) flush();
      cur.push(p);
      size += s;
    }
  }
  flush();
  return out;
}
