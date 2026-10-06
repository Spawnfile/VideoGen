import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Effort, ModelAlias, RoleName } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';

const MODELS: [ModelAlias, string][] = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
const EFFORTS: [Effort, string][] = [['low', 'düşük'], ['medium', 'orta'], ['high', 'yüksek'], ['xhigh', 'çok yüksek'], ['max', 'en yüksek']];
const label = <T extends string>(list: [T, string][], v: T) => list.find(([k]) => k === v)?.[1] ?? v;
const selectClass = 'rounded-control border border-line bg-paper px-2 py-1 text-[13px] focus-visible:outline-2 focus-visible:outline-ink';

export function RolesSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['roles'], queryFn: api.roles });
  const save = async (role: RoleName, patch: { model?: ModelAlias; effort?: Effort }) => {
    await api.setRole(role, patch).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['roles'] });
  };
  return (
    <section className="rounded-card bg-paper p-4 shadow-subtle" aria-labelledby="roles-heading">
      <h2 id="roles-heading" className="text-[14px] font-medium">Agent rolleri</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">Her rolün modeli ve düşünme düzeyi. Değişiklik bir sonraki oturumda geçerli olur ve audit'e yazılır.</p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-ink-2">
            <th className="py-1 font-normal">Rol</th>
            <th className="py-1 font-normal">Model</th>
            <th className="py-1 font-normal">Düşünme</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.map((r) => (
            <tr key={r.role} className="border-t border-line">
              <td className="py-1.5 pr-3">{r.label}</td>
              <td className="py-1.5 pr-3">
                <select aria-label={`${r.label} modeli`} value={r.model} onChange={(e) => void save(r.role, { model: e.target.value as ModelAlias })} className={selectClass}>
                  {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {r.model !== r.defaults.model && <span className="ml-2 text-[11.5px] text-ink-3">varsayılan {label(MODELS, r.defaults.model)}</span>}
              </td>
              <td className="py-1.5">
                <select aria-label={`${r.label} düşünme düzeyi`} value={r.effort} onChange={(e) => void save(r.role, { effort: e.target.value as Effort })} className={selectClass}>
                  {EFFORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {r.effort !== r.defaults.effort && <span className="ml-2 text-[11.5px] text-ink-3">varsayılan {label(EFFORTS, r.defaults.effort)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
