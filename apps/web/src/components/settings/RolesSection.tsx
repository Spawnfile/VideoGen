import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Effort, ModelAlias, RoleName } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { ROLE_EN } from '../../lib/i18n.ts';

const MODELS: [ModelAlias, string][] = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
const EFFORTS: [Effort, string][] = [['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['xhigh', 'very high'], ['max', 'max']];
const label = <T extends string>(list: [T, string][], v: T) => list.find(([k]) => k === v)?.[1] ?? v;
const selectClass = 'min-h-10 rounded-control border border-line bg-inset px-2 py-1 text-[13px] md:min-h-0 focus-visible:outline-2 focus-visible:outline-accent-glow';

export function RolesSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['roles'], queryFn: api.roles });
  const save = async (role: RoleName, patch: { model?: ModelAlias; effort?: Effort }) => {
    await api.setRole(role, patch).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['roles'] });
  };
  return (
    <section className="rounded-card bg-paper p-4" aria-labelledby="roles-heading">
      <h2 id="roles-heading" className="text-[14px] font-medium">Agent roles</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">The model and thinking effort of each role. A change applies from the next session and is written to the audit log.</p>
      <table className="w-full text-[13px] [&_tr]:max-md:grid [&_tr]:max-md:grid-cols-2 [&_tr]:max-md:gap-x-3 [&_thead]:max-md:hidden [&_td:first-child]:max-md:col-span-2">
        <thead>
          <tr className="text-left text-[12px] text-ink-2">
            <th className="py-1 font-normal">Role</th>
            <th className="py-1 font-normal">Model</th>
            <th className="py-1 font-normal">Thinking</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.map((r) => (
            <tr key={r.role} className="border-t border-line">
              <td className="py-1.5 pr-3 font-medium md:font-normal">{ROLE_EN[r.role] ?? r.label}</td>
              <td className="py-1.5 pr-3">
                <select aria-label={`${ROLE_EN[r.role] ?? r.label} model`} value={r.model} onChange={(e) => void save(r.role, { model: e.target.value as ModelAlias })} className={selectClass}>
                  {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {r.model !== r.defaults.model && <span className="ml-2 text-[11.5px] text-ink-3">default {label(MODELS, r.defaults.model)}</span>}
              </td>
              <td className="py-1.5">
                <select aria-label={`${ROLE_EN[r.role] ?? r.label} thinking effort`} value={r.effort} onChange={(e) => void save(r.role, { effort: e.target.value as Effort })} className={selectClass}>
                  {EFFORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {r.effort !== r.defaults.effort && <span className="ml-2 text-[11.5px] text-ink-3">default {label(EFFORTS, r.defaults.effort)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
