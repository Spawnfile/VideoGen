import type { TraceItem, TraceOp, TraceRow, TraceVariant } from '@videogen/shared';
import { arr, contentBlocks, num, obj, str, type Msg } from './messages.ts';

export const TEXT_CAP = 4000;
const SEARCH_TOOLS = new Set(['WebSearch', 'WebFetch']);
const STEP_TOOLS = new Set(['Agent', 'Task', 'TodoWrite', 'TaskCreate', 'TaskUpdate']);
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);
const TITLES: Record<string, string> = {
  Read: 'Oku', Write: 'Yaz', Edit: 'Düzenle', NotebookEdit: 'Not defteri', Bash: 'Komut', Glob: 'Dosya ara', Grep: 'İçerik ara',
  WebSearch: 'Web araması', WebFetch: 'Sayfa okundu', Skill: 'Skill', StructuredOutput: 'Sonuç', Agent: 'Alt ajan', Task: 'Alt ajan',
  TodoWrite: 'Yapılacaklar', TaskCreate: 'Görev', TaskUpdate: 'Görev',
};
const DENIED = /^PreToolUse:\S+ hook error: /;

export function variantOf(tool: string): TraceVariant {
  return SEARCH_TOOLS.has(tool) ? 'search' : STEP_TOOLS.has(tool) ? 'steps' : 'coding';
}
export function toolTitle(tool: string): string {
  if (tool.startsWith('mcp__')) return tool.split('__').slice(2).join('__') || tool;
  return TITLES[tool] ?? tool;
}
export function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
const cap = (s: string): string => (s.length > TEXT_CAP ? `${s.slice(0, TEXT_CAP)}…` : s);
function countLines(s: string): number {
  if (!s) return 0;
  const n = s.split('\n').length;
  return s.endsWith('\n') ? n - 1 : n;
}
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

type RowInit = Partial<TraceRow> & Pick<TraceRow, 'kind' | 'variant' | 'title' | 'turn' | 'parentToolUseId'>;

function textInit(type: 'thinking' | 'text', turn: number, parent: string | null): RowInit {
  return type === 'thinking'
    ? { kind: 'thinking', variant: 'reasoning', title: 'Düşünce', turn, parentToolUseId: parent }
    : { kind: 'text', variant: 'text', title: 'Yanıt', turn, parentToolUseId: parent };
}
function toolInit(tool: string, turn: number, parent: string | null): RowInit {
  return { kind: SUBAGENT_TOOLS.has(tool) ? 'subagent' : 'tool', variant: variantOf(tool), title: toolTitle(tool), tool, turn, parentToolUseId: parent };
}

export interface TraceMapperOptions { sessionId: string; cwd?: string; now?: () => number }

/**
 * Turns SDK messages into ThinkingState rows. Works on the live stream (stream_event deltas give liveness) and on
 * persisted messages alone (assistant/user/system are authoritative), producing the same rows either way.
 */
export class TraceMapper {
  private rows = new Map<string, TraceRow>();
  private seq = 0;
  private at = 0;
  private curMsg: string | null = null;
  private streamRows = new Map<number, string>();
  private partialJson = new Map<string, string>();
  private ordinals = new Map<string, number>();
  private thinkingRow: string | null = null;
  private readonly now: () => number;

  constructor(private readonly o: TraceMapperOptions) {
    this.now = o.now ?? Date.now;
  }

  push(m: Msg, turn: number, at?: number): TraceOp[] {
    this.at = at ?? this.now();
    switch (m.type) {
      case 'stream_event': return this.onStream(obj(m.event) ?? {}, turn);
      case 'assistant': return this.onAssistant(m, turn);
      case 'user': return this.onUser(m);
      case 'system': return this.onSystem(m, turn);
      case 'result': return this.settle('done', false);
      default: return [];
    }
  }

  /** Closes rows left running (interrupt, crash, end of session). Tools become errors unless the session ended normally. */
  finish(how: 'done' | 'cancelled' | 'failed'): TraceOp[] {
    this.at = this.now();
    return this.settle(how, true);
  }

  list(): TraceRow[] {
    return [...this.rows.values()].sort((a, b) => a.seq - b.seq);
  }

  /** Main-thread activity for the session card. */
  activity(): 'tool' | 'thinking' {
    for (const r of this.rows.values()) if (r.status === 'running' && r.kind === 'tool' && r.parentToolUseId === null) return 'tool';
    return 'thinking';
  }

  private rel(p: string): string {
    const c = this.o.cwd;
    return c && p.startsWith(`${c}/`) ? p.slice(c.length + 1) : p;
  }

  private put(id: string, init: RowInit): TraceOp {
    const prev = this.rows.get(id);
    const row: TraceRow = prev
      ? { ...prev, ...defined(init), turn: prev.turn, parentToolUseId: prev.parentToolUseId ?? init.parentToolUseId }
      : ({ id, sessionId: this.o.sessionId, seq: ++this.seq, status: 'running', startedAt: this.at, ...defined(init) } as TraceRow);
    this.rows.set(id, row);
    return { op: 'upsert', row };
  }

  private patch(id: string, p: Partial<TraceRow>): TraceOp[] {
    const r = this.rows.get(id);
    if (!r) return [];
    const row = { ...r, ...defined(p) };
    this.rows.set(id, row);
    return [{ op: 'upsert', row }];
  }

  private onStream(e: Record<string, unknown>, turn: number): TraceOp[] {
    const type = str(e.type);
    if (type === 'message_start') {
      this.curMsg = str(obj(e.message)?.id) ?? null;
      this.streamRows.clear();
      return [];
    }
    const idx = num(e.index);
    if (idx === undefined || !this.curMsg) return [];
    if (type === 'content_block_start') {
      const cb = obj(e.content_block) ?? {};
      const t = str(cb.type);
      if (t === 'thinking' || t === 'text') {
        const id = `${this.curMsg}:${idx}`;
        this.streamRows.set(idx, id);
        if (t === 'thinking') this.thinkingRow = id;
        return this.rows.has(id) ? [] : [this.put(id, textInit(t, turn, null))];
      }
      if (t === 'tool_use') {
        const id = str(cb.id);
        if (!id) return [];
        this.streamRows.set(idx, id);
        return this.rows.has(id) ? [] : [this.put(id, toolInit(str(cb.name) ?? 'tool', turn, null))];
      }
      return [];
    }
    const id = this.streamRows.get(idx);
    if (!id) return [];
    const row = this.rows.get(id)!;
    if (type === 'content_block_delta') {
      const d = obj(e.delta) ?? {};
      const piece = str(d.thinking) ?? str(d.text);
      if ((d.type === 'thinking_delta' || d.type === 'text_delta') && piece) {
        this.rows.set(id, { ...row, text: cap((row.text ?? '') + piece) });
        return [{ op: 'delta', rowId: id, text: piece }];
      }
      if (d.type === 'input_json_delta') {
        const acc = (this.partialJson.get(id) ?? '') + (str(d.partial_json) ?? '');
        this.partialJson.set(id, acc);
        if (row.tool === 'WebSearch') {
          const q = /"query"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(acc)?.[1];
          if (q && q !== row.detail) return this.patch(id, { detail: q });
        }
      }
      return [];
    }
    if (type === 'content_block_stop' && (row.kind === 'thinking' || row.kind === 'text') && row.status === 'running') {
      if (this.thinkingRow === id) this.thinkingRow = null;
      return this.patch(id, { status: 'done', endedAt: this.at });
    }
    return [];
  }

  private onAssistant(m: Msg, turn: number): TraceOp[] {
    const msgId = str(obj(m.message)?.id) ?? `anon-${this.seq}`;
    const parent = str(m.parent_tool_use_id) ?? null;
    const ops: TraceOp[] = [];
    for (const b of contentBlocks(m)) {
      const ord = this.ordinals.get(msgId) ?? 0;
      this.ordinals.set(msgId, ord + 1);
      if (b.type === 'thinking' || b.type === 'text') {
        const id = `${msgId}:${ord}`;
        if (this.thinkingRow === id) this.thinkingRow = null;
        ops.push(this.put(id, { ...textInit(b.type, turn, parent), text: cap(str(b.thinking) ?? str(b.text) ?? ''), status: 'done', endedAt: this.at }));
      } else if (b.type === 'tool_use') {
        const id = str(b.id);
        if (!id) continue;
        const tool = str(b.name) ?? 'tool';
        ops.push(this.put(id, { ...toolInit(tool, turn, parent), ...this.describe(tool, obj(b.input) ?? {}), status: this.rows.get(id)?.status ?? 'running' }));
      }
    }
    return ops;
  }

  private describe(tool: string, input: Record<string, unknown>): Partial<TraceRow> {
    const path = str(input.file_path) ?? str(input.notebook_path);
    if (path) return { detail: this.rel(path), mono: true };
    switch (tool) {
      case 'Bash': return { detail: (str(input.command) ?? '').slice(0, 200), mono: true };
      case 'WebSearch': return { detail: str(input.query) };
      case 'WebFetch': { const u = str(input.url); return u ? { detail: domainOf(u), href: u } : {}; }
      case 'Glob': case 'Grep': return { detail: str(input.pattern), mono: true };
      case 'Agent': case 'Task': return { title: str(input.description) ?? 'Alt ajan', detail: str(input.subagent_type) };
      case 'Skill': return { detail: str(input.skill) ?? str(input.command) };
    }
    if (tool.endsWith('__report_progress')) return { detail: `%${num(input.percent) ?? '?'} · ${str(input.message) ?? ''}` };
    const first = ['subject', 'content', 'description', 'activeForm', 'message', 'kind'].map((k) => str(input[k])).find(Boolean);
    return first ? { detail: first.slice(0, 200) } : {};
  }

  private onUser(m: Msg): TraceOp[] {
    const ops: TraceOp[] = [];
    const result = obj(m.tool_use_result);
    for (const b of contentBlocks(m)) {
      if (b.type !== 'tool_result') continue;
      const id = str(b.tool_use_id);
      const row = id ? this.rows.get(id) : undefined;
      if (!id || !row) continue;
      const text = typeof b.content === 'string' ? b.content : arr(b.content).map((c) => str(obj(c)?.text) ?? '').join('');
      if (b.is_error === true) {
        const denied = DENIED.test(text);
        ops.push(...this.patch(id, { status: denied ? 'denied' : 'error', text: cap(text.replace(DENIED, '')), endedAt: this.at }));
        continue;
      }
      const p: Partial<TraceRow> = { status: 'done', endedAt: this.at, ...(result ? this.resultFields(row, result) : {}) };
      if (row.kind === 'subagent' && result?.status === 'async_launched') {
        p.status = 'running';
        delete p.endedAt;
        p.note = 'arka planda';
      }
      ops.push(...this.patch(id, p));
    }
    return ops;
  }

  private resultFields(row: TraceRow, o: Record<string, unknown>): Partial<TraceRow> {
    if (o.type === 'create' && typeof o.content === 'string') return { add: countLines(o.content), del: 0 };
    if (Array.isArray(o.structuredPatch)) {
      let add = 0;
      let del = 0;
      for (const h of o.structuredPatch) {
        for (const l of arr(obj(h)?.lines)) {
          const s = str(l) ?? '';
          if (s.startsWith('+')) add++;
          else if (s.startsWith('-')) del++;
        }
      }
      return { add, del };
    }
    const file = obj(o.file);
    const lines = num(file?.numLines);
    if (lines !== undefined) return { note: `${lines} satır` };
    if (Array.isArray(o.results)) {
      const items: TraceItem[] = [];
      for (const g of o.results) {
        for (const c of arr(obj(g)?.content)) {
          const url = str(obj(c)?.url);
          if (url) items.push({ title: str(obj(c)?.title) ?? domainOf(url), href: url, domain: domainOf(url) });
        }
      }
      return { items, count: num(o.searchCount) ?? 1, detail: str(o.query) ?? row.detail };
    }
    return {};
  }

  private onSystem(m: Msg, turn: number): TraceOp[] {
    if (m.subtype === 'thinking_tokens') {
      const n = num(m.estimated_tokens);
      const id = this.thinkingRow;
      const row = id ? this.rows.get(id) : undefined;
      if (!id || !row || n === undefined) return [];
      this.rows.set(id, { ...row, tokens: n });
      return [{ op: 'tokens', rowId: id, tokens: n }];
    }
    if (m.subtype === 'task_started') {
      const id = str(m.tool_use_id);
      if (!id) return [];
      return [this.put(id, { ...toolInit('Agent', turn, null), title: str(m.description) ?? 'Alt ajan', detail: str(m.subagent_type), note: m.is_backgrounded === true ? 'arka planda' : undefined })];
    }
    if (m.subtype === 'task_notification') {
      const id = str(m.tool_use_id);
      if (!id) return [];
      return this.patch(id, { status: str(m.status) === 'completed' ? 'done' : 'error', text: cap((str(m.summary) ?? '').slice(0, 600)), endedAt: this.at });
    }
    return [];
  }

  private settle(how: 'done' | 'cancelled' | 'failed', includeTools: boolean): TraceOp[] {
    const ops: TraceOp[] = [];
    for (const r of [...this.rows.values()]) {
      if (r.status !== 'running') continue;
      const isTool = r.kind === 'tool' || r.kind === 'subagent';
      if (isTool && !includeTools) continue;
      ops.push(...this.patch(r.id, { status: isTool && how !== 'done' ? 'error' : 'done', endedAt: this.at }));
    }
    this.thinkingRow = null;
    return ops;
  }
}

/** Rows from persisted agent_events (no stream_event / thinking_tokens), e.g. for GET /api/sessions/:id/trace. */
export function mapHistory(sessionId: string, events: { m: Msg; turn: number; at?: number }[], cwd?: string): TraceRow[] {
  const mp = new TraceMapper({ sessionId, cwd, now: () => 0 });
  for (const e of events) mp.push(e.m, e.turn, e.at ?? 0);
  return mp.list();
}
