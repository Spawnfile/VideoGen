import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatMessage, ChatMode, ChatThread } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { chatMessages, chats, seedMessages, seedTrace, traceRows, traces, useStore } from '../../lib/stores.ts';
import { TraceView } from '../thinking/TraceView.tsx';

const MODES: { id: ChatMode; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'fix', label: 'Fix' },
];
const NOTE: Partial<Record<ChatMessage['status'], string>> = {
  queued: 'Queued',
  interrupted: 'Stopped',
  failed: 'No reply came back. You can send the message again.',
  waiting_limit: 'Usage limit reached; it continues by itself when the window resets.',
};
const LS_KEY = 'vg.chat.thread';
const readLs = (): string | null => { try { return localStorage.getItem(LS_KEY); } catch { return null; } };
const writeLs = (v: string) => { try { localStorage.setItem(LS_KEY, v); } catch { /* storage unavailable */ } };

function TurnTrace({ sessionId, turn, answered }: { sessionId: string; turn: number; answered: boolean }) {
  useQuery({
    queryKey: ['trace', sessionId],
    queryFn: async () => { const r = await api.trace(sessionId); seedTrace(sessionId, r.data, r.eventId); return r.data.length; },
    staleTime: Number.POSITIVE_INFINITY,
  });
  const all = useStore(traces);
  const rows = useMemo(() => traceRows(all[sessionId]).filter((r) => r.turn === turn), [all, sessionId, turn]);
  return rows.length ? <TraceView rows={rows} answered={answered} /> : null;
}

/** `onNewThread`: "Yeni sohbet" also clears the Studio's selected video (a fresh start on both sides). */
export function ChatPanel({ onNewThread }: { onNewThread?: () => void } = {}) {
  const qc = useQueryClient();
  const threadsQ = useQuery({ queryKey: ['threads'], queryFn: api.threads });
  const threads = useMemo(() => threadsQ.data ?? [], [threadsQ.data]);
  const [threadId, setThreadId] = useState<string | null>(readLs);
  const [mode, setMode] = useState<ChatMode>('ask');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const select = (id: string) => { setThreadId(id); writeLs(id); };
  useEffect(() => {
    if (!threadsQ.isSuccess) return;
    if (threadId && threads.some((t) => t.id === threadId)) return;
    setThreadId(threads[0]?.id ?? null);
  }, [threadsQ.isSuccess, threads, threadId]);

  useQuery({
    queryKey: ['thread', threadId],
    enabled: threadId !== null,
    queryFn: async () => { const r = await api.thread(threadId!); seedMessages(threadId!, r.data.messages, r.eventId); return r.data.thread; },
  });
  const allChats = useStore(chats);
  const messages = useMemo(() => chatMessages(threadId ? allChats[threadId] : undefined), [allChats, threadId]);
  const turns = useMemo(() => {
    const replies = messages.filter((m) => m.role === 'assistant');
    return messages.filter((m) => m.role === 'user').map((u) => ({ u, reply: u.sessionId ? replies.find((a) => a.sessionId === u.sessionId && a.turn === u.turn) : undefined }));
  }, [messages]);
  const running = messages.some((m) => m.role === 'user' && m.status === 'running');

  // Spec §13.4: "/" focuses the chat unless the user is already typing somewhere.
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      boxRef.current?.focus();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);
  // Follow new content only while the reader is already near the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  });

  /** "Yeni sohbet" in flight: a message sent meanwhile belongs to that thread (not the old one, not a second new one). */
  const creatingRef = useRef<Promise<string> | null>(null);
  const newThread = async () => {
    const p = (async () => {
      const t = await api.createThread();
      // The list must hold the new thread before it is selected, or the reset effect above snaps back to threads[0] (the old thread):
      // an awaited invalidate resolves before React renders the refetched list.
      qc.setQueryData<ChatThread[]>(['threads'], (old) => [t, ...(old ?? []).filter((x) => x.id !== t.id)]);
      select(t.id);
      void qc.invalidateQueries({ queryKey: ['threads'] });
      return t.id;
    })();
    creatingRef.current = p;
    onNewThread?.();
    try { await p; } finally { if (creatingRef.current === p) creatingRef.current = null; }
    boxRef.current?.focus();
  };
  const submit = async () => {
    const value = text.trim();
    if (!value || sendingRef.current) return; // a ref, not state: two Enters in one frame must send once
    sendingRef.current = true;
    setSending(true);
    try {
      let id = creatingRef.current ? await creatingRef.current : threadId;
      if (!id) { id = (await api.createThread()).id; select(id); }
      await api.sendMessage(id, value, mode);
      setText('');
      void qc.invalidateQueries({ queryKey: ['threads'] });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // On a touch keyboard Enter is a new line; the Send button sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); void submit(); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="sr-only">Chat</h2>
      <div className="flex items-center gap-2 pb-3">
        <label htmlFor="chat-thread" className="sr-only">Conversation</label>
        <select
          id="chat-thread"
          value={threadId ?? ''}
          onChange={(e) => select(e.target.value)}
          disabled={!threads.length}
          className="min-h-10 min-w-0 flex-1 truncate rounded-input border border-line bg-paper px-3 py-1.5 text-[13px] md:min-h-0 md:rounded-control md:px-2 focus-visible:outline-2 focus-visible:outline-accent-glow disabled:text-ink-3"
        >
          {!threads.length && <option value="">No conversations yet</option>}
          {threads.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <button type="button" onClick={() => void newThread()} className="min-h-10 shrink-0 rounded-input border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-hover-2 md:min-h-0 md:rounded-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-glow">
          New chat
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span aria-disabled="true" title="Questions are about the platform; pick a video in the Library to ask about it" className="hidden rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12px] text-ink-3 md:inline">
          No video selected
        </span>
        <div role="radiogroup" aria-label="Mode" className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`min-h-9 rounded-control px-3.5 text-[13px] transition-colors duration-100 md:min-h-0 md:px-2.5 md:py-0.5 md:text-[12px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow ${mode === m.id ? 'bg-ink font-medium text-canvas' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {turns.length === 0 ? (
          <p className="max-w-[46ch] pt-8 text-[13px] leading-relaxed text-ink-2">
            Ask about the platform or a video. You can watch the agent think, search and call tools here, live, until it answers.
          </p>
        ) : (
          <ol className="flex flex-col gap-6 pb-4">
            {turns.map(({ u, reply }) => (
              <li key={u.id} className="flex flex-col gap-3">
                <div data-testid="chat-message" data-role="user" className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
                  <p className="rounded-input bg-inset px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap">{u.text}</p>
                  {(u.mode !== 'ask' || NOTE[u.status]) && (
                    <p className={`text-[11.5px] ${u.status === 'failed' ? 'text-red' : 'text-ink-3'}`}>
                      {[u.mode === 'analyze' ? 'Analysis' : u.mode === 'fix' ? 'Fix' : null, NOTE[u.status]].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {u.sessionId && u.turn !== null && <TurnTrace sessionId={u.sessionId} turn={u.turn} answered={!!reply} />}
                {reply && (
                  <p data-testid="chat-message" data-role="assistant" className="text-[14px] leading-relaxed whitespace-pre-wrap">
                    {reply.text || 'The reply came back empty.'}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-2 mb-2 rounded-input border border-line bg-paper p-2 transition-colors focus-within:border-accent-glow/60 md:mb-0">
        <textarea
          ref={boxRef}
          aria-label="Message"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask anything…"
          className="max-h-48 w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-relaxed md:text-[14px] outline-none placeholder:text-ink-3"
        />
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="hidden text-[11.5px] text-ink-3 md:inline">Enter sends, Shift+Enter adds a line</span>
          {running && threadId && (
            <button type="button" onClick={() => void api.interrupt(threadId)} className="ml-auto rounded-control border border-line-strong px-3 py-1.5 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow">
              Stop
            </button>
          )}
          <button type="submit" disabled={!text.trim() || sending} className={`${running ? '' : 'ml-auto'} min-h-10 rounded-input bg-ink px-4 py-1.5 md:min-h-0 md:rounded-control md:px-3 text-[13px] font-medium text-canvas transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow disabled:opacity-40`}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
