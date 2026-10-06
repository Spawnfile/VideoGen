import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatMessage, ChatMode } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { chatMessages, chats, seedMessages, seedTrace, traceRows, traces, useStore } from '../../lib/stores.ts';
import { TraceView } from '../thinking/TraceView.tsx';

const MODES: { id: ChatMode; label: string }[] = [
  { id: 'ask', label: 'Soru' },
  { id: 'analyze', label: 'Analiz et' },
  { id: 'fix', label: 'Düzelt' },
];
const NOTE: Partial<Record<ChatMessage['status'], string>> = {
  queued: 'Sırada',
  interrupted: 'Durduruldu',
  failed: 'Yanıt alınamadı. Mesajı yeniden gönderebilirsiniz.',
  waiting_limit: 'Kullanım limiti doldu; sıfırlanınca kendiliğinden devam edecek.',
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

export function ChatPanel() {
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

  const newThread = async () => {
    const t = await api.createThread();
    await qc.invalidateQueries({ queryKey: ['threads'] });
    select(t.id);
    boxRef.current?.focus();
  };
  const submit = async () => {
    const value = text.trim();
    if (!value || sendingRef.current) return; // a ref, not state: two Enters in one frame must send once
    sendingRef.current = true;
    setSending(true);
    try {
      let id = threadId;
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="sr-only">Chat</h2>
      <div className="flex items-center gap-2 pb-3">
        <label htmlFor="chat-thread" className="sr-only">Sohbet</label>
        <select
          id="chat-thread"
          value={threadId ?? ''}
          onChange={(e) => select(e.target.value)}
          disabled={!threads.length}
          className="min-w-0 flex-1 truncate rounded-control border border-line bg-paper px-2 py-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-ink disabled:text-ink-3"
        >
          {!threads.length && <option value="">Henüz sohbet yok</option>}
          {threads.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <button type="button" onClick={() => void newThread()} className="shrink-0 rounded-control border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
          Yeni sohbet
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span aria-disabled="true" title="Video seçimi Kütüphane ile M4'te gelecek" className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12px] text-ink-3">
          Video seçilmedi
        </span>
        <div role="radiogroup" aria-label="Mod" className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-full px-2.5 py-0.5 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${mode === m.id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {turns.length === 0 ? (
          <p className="max-w-[46ch] pt-8 text-[13px] leading-relaxed text-ink-2">
            Platform ya da bir video hakkında soru sorun. Agent'ın düşünmesini, aramalarını ve araç çağrılarını yanıt gelene kadar burada canlı izleyebilirsiniz.
          </p>
        ) : (
          <ol className="flex flex-col gap-6 pb-4">
            {turns.map(({ u, reply }) => (
              <li key={u.id} className="flex flex-col gap-3">
                <div data-testid="chat-message" data-role="user" className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
                  <p className="rounded-input bg-inset px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap">{u.text}</p>
                  {(u.mode !== 'ask' || NOTE[u.status]) && (
                    <p className={`text-[11.5px] ${u.status === 'failed' ? 'text-red/80' : 'text-ink-3'}`}>
                      {[u.mode === 'analyze' ? 'Analiz' : u.mode === 'fix' ? 'Düzeltme' : null, NOTE[u.status]].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {u.sessionId && u.turn !== null && <TurnTrace sessionId={u.sessionId} turn={u.turn} answered={!!reply} />}
                {reply && (
                  <p data-testid="chat-message" data-role="assistant" className="text-[14px] leading-relaxed whitespace-pre-wrap">
                    {reply.text || 'Yanıt boş döndü.'}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-2 rounded-input border border-line bg-paper p-2 shadow-subtle transition-colors focus-within:border-accent/60">
        <textarea
          ref={boxRef}
          aria-label="Mesaj"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Bir şey sorun…"
          className="max-h-48 w-full resize-none bg-transparent px-2 py-1 text-[14px] leading-relaxed outline-none placeholder:text-ink-3"
        />
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="text-[11.5px] text-ink-3">Enter gönderir, Shift+Enter yeni satır</span>
          {running && threadId && (
            <button type="button" onClick={() => void api.interrupt(threadId)} className="ml-auto rounded-control border border-line-strong px-3 py-1.5 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink">
              Durdur
            </button>
          )}
          <button type="submit" disabled={!text.trim() || sending} className={`${running ? '' : 'ml-auto'} rounded-control bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40`}>
            Gönder
          </button>
        </div>
      </form>
    </div>
  );
}
