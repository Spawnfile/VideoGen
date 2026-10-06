import type { SessionStatus, TraceRow } from '@videogen/shared/browser';

export type BlockVariant = 'steps' | 'reasoning' | 'search' | 'coding';
export type RowTone = 'normal' | 'running' | 'denied' | 'error';
export interface ThinkingRowView {
  id: string;
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  tone: RowTone;
  /** Shown when the row is opened: guard reason, error, subagent summary. */
  detail?: string;
  kind?: 'query' | 'result' | 'text' | 'item';
  children?: TraceBlock[];
}
export interface ThinkingBlock {
  kind: 'thinking';
  key: string;
  variant: BlockVariant;
  rows: ThinkingRowView[];
  live: boolean;
  startedAt: number;
  endedAt: number | null;
  tools: number;
  sources: number;
}
export interface TextBlock { kind: 'text'; key: string; text: string; live: boolean }
export type TraceBlock = ThinkingBlock | TextBlock;

const MAX_RESULTS = 8;
const toneOf = (r: TraceRow): RowTone => (r.status === 'denied' ? 'denied' : r.status === 'error' ? 'error' : r.status === 'running' ? 'running' : 'normal');
const join = (parts: (string | undefined)[], sep: string) => parts.filter(Boolean).join(sep) || undefined;

function views(r: TraceRow, all: TraceRow[]): ThinkingRowView[] {
  const tone = toneOf(r);
  if (r.variant === 'reasoning' || r.variant === 'text') {
    return [{ id: r.id, kind: 'text', primary: r.text?.trim() || (r.tokens ? `${r.tokens} token düşündü` : 'Düşünüyor…'), tone }];
  }
  if (r.variant === 'search') {
    if (r.tool === 'WebFetch') return [{ id: r.id, kind: 'item', primary: r.detail ?? 'Sayfa', secondary: 'okundu', href: r.href, tone }];
    const items = r.items ?? [];
    const out: ThinkingRowView[] = [{
      id: r.id, kind: 'query', primary: r.detail ?? 'Web araması', tone,
      ...(tone === 'denied' ? { detail: `Koruma reddetti: ${r.text ?? ''}` } : tone === 'error' ? { detail: r.text } : {}),
    }];
    items.slice(0, MAX_RESULTS).forEach((it, i) => out.push({ id: `${r.id}#${i}`, kind: 'result', primary: it.title, secondary: it.domain, href: it.href, tone: 'normal' }));
    if (items.length > MAX_RESULTS) out.push({ id: `${r.id}#more`, kind: 'result', primary: `+${items.length - MAX_RESULTS} kaynak daha`, tone: 'normal' });
    return out;
  }
  if (r.variant === 'steps') {
    const children = r.kind === 'subagent' ? buildBlocks(all, r.id) : [];
    return [{ id: r.id, primary: r.title, secondary: join([r.detail, r.note], ', '), tone, detail: r.text, ...(children.length ? { children } : {}) }];
  }
  return [{
    id: r.id, primary: r.title, secondary: join([r.detail, r.note], ' — '), mono: r.mono, add: r.add, del: r.del, tone,
    ...(tone === 'denied' ? { detail: `Koruma reddetti: ${r.text ?? ''}` } : tone === 'error' ? { detail: r.text } : {}),
  }];
}

/** Consecutive rows of one variant form one ThinkingState; the assistant's prose between them is a text block (spec §13.2). */
export function buildBlocks(rows: TraceRow[], parent: string | null = null): TraceBlock[] {
  const mine = rows.filter((r) => r.parentToolUseId === parent).sort((a, b) => a.seq - b.seq);
  const out: TraceBlock[] = [];
  for (const r of mine) {
    if (r.variant === 'text' && parent === null) {
      out.push({ kind: 'text', key: r.id, text: r.text ?? '', live: r.status === 'running' });
      continue;
    }
    const variant: BlockVariant = r.variant === 'text' ? 'reasoning' : r.variant;
    const last = out.at(-1);
    const block: ThinkingBlock = last?.kind === 'thinking' && last.variant === variant
      ? last
      : { kind: 'thinking', key: r.id, variant, rows: [], live: false, startedAt: r.startedAt, endedAt: null, tools: 0, sources: 0 };
    if (block !== last) out.push(block);
    block.rows.push(...views(r, rows));
    block.tools += 1;
    block.sources += r.items?.length ?? 0;
    block.live ||= r.status === 'running';
    block.startedAt = Math.min(block.startedAt, r.startedAt);
    block.endedAt = block.live ? null : Math.max(block.endedAt ?? r.startedAt, r.endedAt ?? r.startedAt);
  }
  return out;
}

/** A finished chat turn shows its reply as a message; that is the turn's last text block (result.text), so only it is dropped. */
export function withoutAnswer(blocks: TraceBlock[]): TraceBlock[] {
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]!.kind === 'text') return [...blocks.slice(0, i), ...blocks.slice(i + 1)];
  return blocks;
}

export function blockLabels(b: ThinkingBlock): { active: string; done: string } {
  const secs = b.endedAt === null ? 0 : Math.max(1, Math.round((b.endedAt - b.startedAt) / 1000));
  switch (b.variant) {
    case 'reasoning': return { active: 'Düşünüyor', done: `${secs} saniye düşündü` };
    case 'search': return { active: "Web'de arıyor", done: b.sources ? `Web'de arandı, ${b.sources} kaynak` : "Web'de arandı" };
    case 'coding': return { active: 'Araç çalıştırıyor', done: `${b.tools} araç çalıştırdı` };
    case 'steps': return { active: 'Adımlar sürüyor', done: `${b.tools} adım tamamlandı` };
  }
}

/** The latest main-thread tool call: the card's "▸ Edit scene/product.py +84 −12" line. */
export function lastActivity(rows: TraceRow[]): TraceRow | null {
  let best: TraceRow | null = null;
  for (const r of rows) if (r.parentToolUseId === null && r.kind === 'tool' && (!best || r.seq > best.seq)) best = r;
  return best;
}

export function subagents(rows: TraceRow[]): TraceRow[] {
  return rows.filter((r) => r.kind === 'subagent' && r.parentToolUseId === null).sort((a, b) => a.seq - b.seq);
}

export function modelLabel(model: string): string {
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model);
  return m ? `${cap(m[1]!)} ${m[2]}.${m[3]}` : cap(model);
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  queued: 'sırada',
  starting: 'başlıyor',
  thinking: 'düşünüyor',
  tool: 'araç çalıştırıyor',
  idle: 'boşta',
  waiting_limit: 'limit bekleniyor',
  waiting_gpu: 'GPU bekliyor',
  done: 'tamamlandı',
  failed: 'başarısız',
  cancelled: 'durduruldu',
};

export function statusTone(s: SessionStatus): 'active' | 'waiting' | 'ok' | 'error' | 'muted' {
  if (s === 'thinking' || s === 'tool' || s === 'starting') return 'active';
  if (s === 'queued' || s === 'waiting_limit' || s === 'waiting_gpu' || s === 'idle') return 'waiting';
  if (s === 'done') return 'ok';
  if (s === 'failed') return 'error';
  return 'muted';
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} sn önce` : `${Math.round(s / 60)} dk önce`;
}

export function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
}
