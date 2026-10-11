import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, blobUrl } from '../../lib/api.ts';
import { toolInputView, type AuditQueryFilter } from '../../lib/audit-view.ts';
import { TraceView } from '../thinking/TraceView.tsx';

const pre = 'max-h-[320px] overflow-auto rounded-input bg-inset p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all text-ink';
const link = 'text-accent-glow underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow';
const quiet = 'min-h-8 rounded-control px-2 py-1 text-[12px] text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow';

function Part({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h4 className="text-[12px] font-medium text-ink-2">{title}</h4>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Trace({ sessionId }: { sessionId: string }) {
  const q = useQuery({ queryKey: ['audit', 'trace', sessionId], queryFn: async () => (await api.trace(sessionId)).data, staleTime: 0 });
  if (q.isError) return <p className="text-[12px] text-red">Could not load the trace.</p>;
  if (!q.data) return <p className="text-[12px] text-ink-3">Loading the trace…</p>;
  if (q.data.length === 0) return <p className="text-[12px] text-ink-3">This session’s trace is empty.</p>;
  return <TraceView rows={q.data} />;
}

/** Plan M7 Y6: the row's detail opens under it: raw row, transcript, tool input, file, artifact and the session trace. */
export function AuditDetail({ seq, onFilter }: { seq: number; onFilter: (patch: AuditQueryFilter) => void }) {
  const q = useQuery({ queryKey: ['audit', 'row', seq], queryFn: () => api.auditRow(seq), staleTime: Number.POSITIVE_INFINITY });
  const [trace, setTrace] = useState(false);
  if (q.isError) return <div data-testid="audit-detail" className="px-4 py-3 text-[13px] text-red">Could not load the row details.</div>;
  if (!q.data) return <div data-testid="audit-detail" className="px-4 py-3 text-[13px] text-ink-3">Loading…</div>;
  const { row, links } = q.data;
  const tool = links.tool ? toolInputView(links.tool.name, links.tool.input) : null;
  return (
    <div data-testid="audit-detail" className="flex flex-col gap-4 border-t border-line/60 bg-canvas/60 px-4 py-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        <span className="tabular-nums">#{row.seq}</span>
        <span className="tabular-nums">{new Date(row.ts).toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', hour12: false })}</span>
        {row.runId && <button type="button" className={quiet} onClick={() => onFilter({ runId: row.runId! })}>Rows of this run</button>}
        {row.sessionId && <button type="button" className={quiet} onClick={() => onFilter({ sessionId: row.sessionId! })}>Rows of this session</button>}
      </div>

      {links.session && (
        <Part title="Session">
          <p className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
            <span>{links.session.role} · {links.session.model}</span>
            <span className="font-mono text-[12px] break-all text-ink-3">{links.session.id}</span>
            {links.session.transcriptSha
              ? <a className={link} href={blobUrl(links.session.transcriptSha)} download={`transcript-${links.session.id}.jsonl`}>Transcript</a>
              : <span className="text-[12px] text-ink-3">No transcript</span>}
          </p>
        </Part>
      )}

      {links.tool && tool && (
        <Part title={`Tool input · ${links.tool.name}`} aside={links.tool.truncated ? <span className="text-[12px] text-ink-3">shortened</span> : undefined}>
          {tool.kind === 'edit' ? (
            <>
              <p className="font-mono text-[12px] text-ink-2">{tool.path}</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1"><span className="text-[12px] text-ink-3">Before</span><pre className={pre}>{tool.before}</pre></div>
                <div className="flex min-w-0 flex-col gap-1"><span className="text-[12px] text-ink-3">After</span><pre className={pre}>{tool.after}</pre></div>
              </div>
            </>
          ) : tool.kind === 'write' ? (
            <>
              <p className="font-mono text-[12px] text-ink-2">{tool.path}</p>
              <pre className={pre}>{tool.content}</pre>
            </>
          ) : (
            <pre className={pre}>{tool.text}</pre>
          )}
        </Part>
      )}

      {links.file && (
        <Part title="File">
          <p className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
            <span className="font-mono text-[12px] break-all">{links.file.path}</span>
            {links.file.beforeSha && <a className={link} href={blobUrl(links.file.beforeSha)} target="_blank" rel="noreferrer">Before</a>}
            {links.file.afterSha && <a className={link} href={blobUrl(links.file.afterSha)} target="_blank" rel="noreferrer">After</a>}
          </p>
        </Part>
      )}

      {links.artifact && (
        <Part title="Artifact">
          <p className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
            <span>{links.artifact.kind}</span>
            <a className={link} href={`/api/artifacts/${links.artifact.id}`} target="_blank" rel="noreferrer">Open the content</a>
            {links.artifact.blobSha && <a className={link} href={blobUrl(links.artifact.blobSha)} target="_blank" rel="noreferrer">File</a>}
          </p>
        </Part>
      )}

      {links.session && (
        <Part title="Trace" aside={<button type="button" className={quiet} onClick={() => setTrace((t) => !t)}>{trace ? 'Hide' : 'Show trace'}</button>}>
          {trace && <Trace sessionId={links.session.id} />}
        </Part>
      )}

      <Part title="Raw row">
        <pre data-testid="audit-raw" className={pre}>{JSON.stringify(row, null, 2)}</pre>
      </Part>
    </div>
  );
}
