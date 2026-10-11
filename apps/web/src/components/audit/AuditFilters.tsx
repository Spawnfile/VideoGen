import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.ts';
import { actionGroups, filterFromQuery, type AuditQueryFilter } from '../../lib/audit-view.ts';
import { pipeline, seedVideos, useStore, videoList } from '../../lib/stores.ts';
import { ROLE_EN } from '../../lib/i18n.ts';

const field = 'h-10 w-full rounded-control border border-line bg-inset px-2 md:h-8 md:w-auto text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow';
const label = 'flex flex-col gap-1 text-[12px] text-ink-2';

/** Plan M7 Y6 filters: run, video (from the library), agent role, action (grouped by prefix), date range. `fixed` keys are set by the host and not shown. */
export function AuditFilters({ filter, onChange, fixed = [] }: { filter: AuditQueryFilter; onChange: (f: AuditQueryFilter) => void; fixed?: (keyof AuditQueryFilter)[] }) {
  useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.roles });
  const actions = useQuery({ queryKey: ['audit', 'actions'], queryFn: api.auditActions, staleTime: 0 });
  const groups = useMemo(() => actionGroups(actions.data ?? []), [actions.data]);
  const [run, setRun] = useState(filter.runId ?? '');
  useEffect(() => setRun(filter.runId ?? ''), [filter.runId]);

  const set = (key: keyof AuditQueryFilter, value: string) => {
    const next = { ...filter };
    if (value) next[key] = value;
    else delete next[key];
    onChange(next);
  };
  const applyRun = () => {
    const v = run.trim().toLowerCase();
    if (v === (filter.runId ?? '')) return;
    // The same check the URL gets: an id that is not a uuid is left in the box, unapplied.
    if (!v || filterFromQuery(`?run=${encodeURIComponent(v)}`).runId) set('runId', v);
  };
  const runInvalid = run.trim() !== '' && !filterFromQuery(`?run=${encodeURIComponent(run.trim().toLowerCase())}`).runId;
  const show = (k: keyof AuditQueryFilter) => !fixed.includes(k);
  const active = Object.keys(filter).some((k) => show(k as keyof AuditQueryFilter));

  return (
    <section aria-label="Filters" className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:rounded-card md:bg-paper md:px-4 md:py-3">
      {show('videoId') && (
        <label className={label}>
          Video
          <select value={filter.videoId ?? ''} onChange={(e) => set('videoId', e.target.value)} className={`${field} md:w-[180px]`}>
            <option value="">All</option>
            {filter.videoId && !videos.some((v) => v.id === filter.videoId) && <option value={filter.videoId}>{filter.videoId.slice(0, 8)}…</option>}
            {videos.map((v) => <option key={v.id} value={v.id}>{v.productName}</option>)}
          </select>
        </label>
      )}
      {show('runId') && (
        <label className={label}>
          Run
          <input
            value={run}
            onChange={(e) => setRun(e.target.value)}
            onBlur={applyRun}
            onKeyDown={(e) => { if (e.key === 'Enter') applyRun(); }}
            placeholder="run id"
            aria-invalid={runInvalid || undefined}
            spellCheck={false}
            className={`${field} font-mono text-[12px] md:w-[150px] ${runInvalid ? 'border-red' : ''}`}
          />
        </label>
      )}
      {show('role') && (
        <label className={label}>
          Agent role
          <select value={filter.role ?? ''} onChange={(e) => set('role', e.target.value)} className={`${field} md:w-[140px]`}>
            <option value="">All</option>
            {filter.role && !roles.data?.some((r) => r.role === filter.role) && <option value={filter.role}>{filter.role}</option>}
            {roles.data?.map((r) => <option key={r.role} value={r.role}>{ROLE_EN[r.role] ?? r.label}</option>)}
          </select>
        </label>
      )}
      {show('action') && (
        <label className={label}>
          Action
          <select value={filter.action ?? ''} onChange={(e) => set('action', e.target.value)} className={`${field} md:w-[200px]`}>
            <option value="">All</option>
            {filter.action && !groups.some((g) => `${g.prefix}.*` === filter.action || g.actions.some((a) => a.action === filter.action)) && <option value={filter.action}>{filter.action}</option>}
            {groups.map((g) => (
              <optgroup key={g.prefix} label={g.prefix}>
                <option value={`${g.prefix}.*`}>{g.prefix}.* ({g.n})</option>
                {g.actions.map((a) => <option key={a.action} value={a.action}>{a.action} ({a.n})</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {show('from') && (
        <label className={label}>
          From
          <input type="date" value={filter.from ?? ''} max={filter.to} onChange={(e) => set('from', e.target.value)} className={field} />
        </label>
      )}
      {show('to') && (
        <label className={label}>
          To
          <input type="date" value={filter.to ?? ''} min={filter.from} onChange={(e) => set('to', e.target.value)} className={field} />
        </label>
      )}
      {show('sessionId') && filter.sessionId && (
        <span className="flex h-8 items-center gap-1 rounded-full bg-inset pl-3 pr-1 text-[12px] text-ink-2">
          Session <span className="font-mono">{filter.sessionId.slice(0, 8)}…</span>
          <button type="button" aria-label="Remove the session filter" onClick={() => set('sessionId', '')} className="flex size-6 items-center justify-center rounded-full hover:bg-hover-2 hover:text-ink">×</button>
        </span>
      )}
      {active && (
        <button
          type="button"
          onClick={() => onChange(Object.fromEntries(Object.entries(filter).filter(([k]) => !show(k as keyof AuditQueryFilter))))}
          className="h-10 rounded-control px-2 text-[13px] text-ink-2 md:h-8 transition-colors duration-100 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow"
        >
          Clear
        </button>
      )}
    </section>
  );
}
