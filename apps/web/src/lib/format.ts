export function pct(u: number | null | undefined): string {
  return u === null || u === undefined ? '—' : `%${Math.round(u * 100)}`;
}

export function resetTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `${time}'de sıfırlanır` : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}'de sıfırlanır`;
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'az önce';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} dk önce` : `${Math.round(m / 60)} sa önce`;
}
