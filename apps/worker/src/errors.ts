/** Fixed-text rejection used for timeouts; its message is safe to log verbatim. */
export class TimeoutError extends Error {
  constructor(message: string) { super(message); this.name = 'TimeoutError'; }
}

/** Error class (+ code) only — never the message, which may embed CLI/SDK output with identifying text. */
export function errorTag(e: unknown): string {
  if (!(e instanceof Error)) return 'UnknownError';
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? `${e.name}:${code}` : e.name;
}
