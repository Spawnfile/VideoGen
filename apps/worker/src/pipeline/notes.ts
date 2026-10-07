/** Plan C25: why a run waits in the queue (no Turkish case suffix on the time). */
export const LIMIT_NOTE = (resumeAt: string | null) =>
  `Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar${resumeAt ? ` (açılış ${new Date(resumeAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})` : ''}.`;
