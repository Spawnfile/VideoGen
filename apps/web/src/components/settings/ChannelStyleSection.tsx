import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ChannelStyleId } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { STYLE_EN } from '../../lib/i18n.ts';

/** K19: the channel's fixed look. Each option shows the example pen at frame 0 and with the explode open. */
export function ChannelStyleSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['channel-style'], queryFn: api.channelStyle });
  const [saving, setSaving] = useState<ChannelStyleId | null>(null);
  const choose = async (id: ChannelStyleId) => {
    if (saving || (q.data?.chosen && q.data.id === id)) return;
    setSaving(id);
    await api.setChannelStyle(id).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['channel-style'] });
    setSaving(null);
  };
  const current = q.data;
  return (
    <section className="rounded-card bg-paper p-4" aria-labelledby="channel-heading">
      <h2 id="channel-heading" className="text-[14px] font-medium">Channel identity</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">
        The background, light and text colors every video shares. A new choice applies from the next scene build and is written to the audit log.
        {current && !current.chosen && <> Not chosen yet: <span className="text-ink">{STYLE_EN[current.id]?.name ?? current.id}</span> is used for now.</>}
      </p>
      <div role="radiogroup" aria-label="Channel identity" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {current?.options.map((o) => {
          const selected = current.chosen && current.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving !== null}
              onClick={() => void choose(o.id)}
              className={`flex flex-col gap-2 rounded-input border p-2 text-left transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent-glow disabled:opacity-60 ${selected ? 'border-accent-glow' : 'border-line'}`}
            >
              <img src={o.image} alt={`${STYLE_EN[o.id]?.name ?? o.id}: the example pen, first frame and exploded view`} className="aspect-[9/8] w-full rounded-control object-cover" />
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                {selected && <span aria-hidden className="size-1.5 rounded-full bg-ink" />}
                {STYLE_EN[o.id]?.name ?? o.name_tr}
              </span>
              <span className="text-[12px] leading-snug text-ink-2">{STYLE_EN[o.id]?.description ?? o.description_tr}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
