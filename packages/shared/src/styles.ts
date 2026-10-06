/** K19: the channel's fixed visual identity. Three options; the user picks one (Ayarlar → Kanal kimliği). */
export const CHANNEL_STYLE_IDS = ['atolye', 'beyaz_lab', 'gece_mavisi'] as const;
export type ChannelStyleId = (typeof CHANNEL_STYLE_IDS)[number];

export interface ChannelStyle {
  id: ChannelStyleId;
  name_tr: string;
  description_tr: string;
  /** Vertical background gradient (top → bottom), sRGB hex. Blender world and the Remotion backdrop use the same pair. */
  background: { top: string; bottom: string };
  lighting: 'key_rim_warm' | 'key_rim_cool' | 'soft_box';
  /** Labels and on-screen text (Remotion layer). */
  text: { color: string; plate: string; line: string; accent: string };
}

export const CHANNEL_STYLES: Record<ChannelStyleId, ChannelStyle> = {
  atolye: {
    id: 'atolye', name_tr: 'Atölye', description_tr: 'Sıcak, koyu stüdyo; pirinç vurgular, mühendis masası hissi.',
    background: { top: '#2a241d', bottom: '#0f0d0b' }, lighting: 'key_rim_warm',
    text: { color: '#f6efe4', plate: 'rgba(18,15,12,0.72)', line: '#e8b85c', accent: '#e8b85c' },
  },
  beyaz_lab: {
    id: 'beyaz_lab', name_tr: 'Beyaz laboratuvar', description_tr: 'Açık, temiz, katalog netliği; yumuşak kutu ışığı.',
    background: { top: '#f7f5f1', bottom: '#d9d5cd' }, lighting: 'soft_box',
    text: { color: '#1d1c19', plate: 'rgba(255,255,255,0.82)', line: '#016a71', accent: '#016a71' },
  },
  gece_mavisi: {
    id: 'gece_mavisi', name_tr: 'Gece mavisi', description_tr: 'Koyu mavi teknik çizim havası; soğuk kenar ışığı (pilot videonun tonu).',
    background: { top: '#16203a', bottom: '#070a14' }, lighting: 'key_rim_cool',
    text: { color: '#eef3ff', plate: 'rgba(8,12,24,0.72)', line: '#5cc8ff', accent: '#5cc8ff' },
  },
};

/** Used until the user picks one (K19 gate); recorded as provisional. The pilot's tone. */
export const DEFAULT_CHANNEL_STYLE: ChannelStyleId = 'gece_mavisi';
