import { z } from 'zod';

/** Plan M7 Y15: the one source of the text safe area (spec §8.1 G6), shared by Remotion, the G6 manifest check, contact sheets and qc. */
/** The frame the area is measured in; every consumer scales it to its own size. */
export const SAFE_AREA_FRAME = { width: 1080, height: 1920 } as const;

/**
 * Pixels of a 1080×1920 frame: no text above `top`, below `bottom` (the y of the lower edge, not a margin) or in the right `right` px;
 * `left` is the text's left margin.
 */
export interface SafeArea { top: number; bottom: number; right: number; left: number }

/** Spec §8.1 G6 (no text above 150 px, below 1510 px or in the right 130 px) plus the 24 px left margin. */
export const DEFAULT_SAFE_AREA: Readonly<SafeArea> = Object.freeze({ top: 150, bottom: 1510, right: 130, left: 24 });
/** The text band must stay at least this tall (the hook, the labels and the beat line share it). */
export const SAFE_AREA_MIN_HEIGHT = 900;
/** A calibrated side further than this from the default is stored but flagged (Y16: a misread ruler moves G6). */
export const SAFE_AREA_WARN_PX = 150;

const px = z.number().int().min(0);
export const SafeAreaSchema = z.strictObject({ top: px, bottom: px.max(SAFE_AREA_FRAME.height), right: px, left: px })
  .refine((a) => a.top < a.bottom, { message: 'üst sınır alt sınırdan küçük olmalı' })
  .refine((a) => a.left + a.right < SAFE_AREA_FRAME.width, { message: 'sol + sağ 1080 px\'ten küçük olmalı' })
  .refine((a) => a.bottom - a.top >= SAFE_AREA_MIN_HEIGHT, { message: `yazı bandı en az ${SAFE_AREA_MIN_HEIGHT} px yüksek olmalı` });

/** Settings `safe_area`: the area, whether it was measured on a phone, when and on what (Y16). */
export type SafeAreaSource = 'default' | 'calibrated';
export interface SafeAreaSetting { area: SafeArea; source: SafeAreaSource; measuredAt: string | null; note: string | null }
/** GET /api/safe-area */
export interface SafeAreaState extends SafeAreaSetting { warnings: string[] }

export const defaultSafeAreaSetting = (): SafeAreaSetting => ({ area: { ...DEFAULT_SAFE_AREA }, source: 'default', measuredAt: null, note: null });

/** The area in a `width`×`height` frame (rounded px; same shape, so `right` stays a margin). */
export function scaleSafeArea(a: SafeArea, width: number, height: number): SafeArea {
  const sx = width / SAFE_AREA_FRAME.width;
  const sy = height / SAFE_AREA_FRAME.height;
  return { top: Math.round(a.top * sy), bottom: Math.round(a.bottom * sy), right: Math.round(a.right * sx), left: Math.round(a.left * sx) };
}

const SIDE_TR: Record<keyof SafeArea, string> = { top: 'üst', bottom: 'alt', right: 'sağ', left: 'sol' };

/** Turkish warnings for every side more than SAFE_AREA_WARN_PX from the default (empty: plausible). */
export function safeAreaWarnings(a: SafeArea): string[] {
  return (['top', 'bottom', 'right', 'left'] as const)
    .filter((k) => Math.abs(a[k] - DEFAULT_SAFE_AREA[k]) > SAFE_AREA_WARN_PX)
    .map((k) => `${SIDE_TR[k]} ${a[k]} px, varsayılan ${DEFAULT_SAFE_AREA[k]} px'ten ${Math.abs(a[k] - DEFAULT_SAFE_AREA[k])} px uzak: cetvel değerini yeniden okuyun`);
}
