import type { Publication } from '@videogen/shared/browser';
import { PUBLICATION_STATUS_EN as LABEL } from '../../lib/i18n.ts';
import { dateTime as when } from '../../lib/locale.ts';


/** The video's TikTok sends, newest first (plan Y22). */
export function PublishHistory({ publications }: { publications: Publication[] }) {
  if (publications.length < 2) return null;
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer py-1 text-ink-2">Send history ({publications.length})</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {publications.map((p) => (
          <li key={p.id} className="flex flex-wrap gap-2">
            <span className="tabular-nums text-ink-2">{when(p.createdAt)}</span>
            <span>{p.variant === 'tiktok' ? 'No music' : 'With music'}</span>
            <span className={p.status === 'failed' ? 'text-red' : p.status === 'published' ? 'text-green' : ''}>{LABEL[p.status]}</span>
            {p.failReason && <span className="text-ink-2">{p.failReason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
