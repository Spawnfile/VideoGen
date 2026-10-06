/** SDK messages are handled structurally: fixtures are recorded JSON and the SDK union is large and partly @alpha. */
export type Msg = { type: string; subtype?: string; [k: string]: unknown };
export type Block = { type: string; [k: string]: unknown };

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function contentBlocks(m: Msg): Block[] {
  return arr(obj(m.message)?.content).filter((b): b is Block => typeof obj(b)?.type === 'string');
}
