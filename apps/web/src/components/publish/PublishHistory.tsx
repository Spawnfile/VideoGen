import type { Publication, PublicationStatus } from '@videogen/shared/browser';

const LABEL: Record<PublicationStatus, string> = {
  queued: 'kuyrukta', uploading: 'yükleniyor', processing: 'işleniyor', waiting: 'yanıt bekleniyor', sent: 'gelen kutusunda', failed: 'gönderilemedi', published: 'yayında',
};
const when = (d: Date | string) => new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/** The video's TikTok sends, newest first (plan Y22). */
export function PublishHistory({ publications }: { publications: Publication[] }) {
  if (publications.length < 2) return null;
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer text-ink-2">Gönderim geçmişi ({publications.length})</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {publications.map((p) => (
          <li key={p.id} className="flex flex-wrap gap-2">
            <span className="tabular-nums text-ink-2">{when(p.createdAt)}</span>
            <span>{p.variant === 'tiktok' ? 'Müziksiz' : 'Müzikli'}</span>
            <span className={p.status === 'failed' ? 'text-red/80' : p.status === 'published' ? 'text-green' : ''}>{LABEL[p.status]}</span>
            {p.failReason && <span className="text-ink-2">{p.failReason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
