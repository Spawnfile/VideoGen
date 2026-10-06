import { randomUUID } from 'node:crypto';
import { outputJsonSchema, validateArtifact, type ArtifactSchemaName, type RoleName } from '@videogen/shared';
import type { FakeScript } from '@videogen/claude';
import { RESUME_PROMPT, type SessionManager, type StartRequest } from '../agents/manager.ts';
import type { RunEnd } from '../agents/runner.ts';
import type { StepContext } from './types.ts';

export interface AgentRun { sessionId: string; end: RunEnd; limited: boolean; structured: unknown }

/** One pipeline session, start to end (a pipeline session closes its input after the first turn). */
export async function runAgentSession(manager: SessionManager, req: StartRequest & { id: string }, ctx: StepContext): Promise<AgentRun> {
  if (manager.isStopping()) throw new Error('worker stopping');
  let structured: unknown = null;
  let offAbort = () => {};
  let unsubscribe = () => {};
  const ended = new Promise<{ end: RunEnd; limited: boolean }>((resolve) => {
    const off = manager.subscribe({
      onTurnComplete: (id, r) => { if (id === req.id) structured = r.structured ?? null; },
      onProgress: (id, pct) => { if (id === req.id) ctx.progress(pct, 'agent'); },
      onStatus: (id, st) => {
        if (id !== req.id) return;
        if (st === 'waiting_limit') ctx.status('waiting_limit', 'kullanım limiti: sıfırlanınca kendiliğinden sürecek');
        else if (st === 'starting' || st === 'thinking' || st === 'tool') ctx.status('running', null);
      },
      onEnd: (id, end, info) => { if (id !== req.id) return; off(); offAbort(); resolve({ end, limited: info.limited }); },
    });
    unsubscribe = off;
  });
  const onAbort = () => { void manager.cancel(req.id); };
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  offAbort = () => ctx.signal.removeEventListener('abort', onAbort);
  try {
    await manager.start(req);
  } catch (e) {
    unsubscribe();
    offAbort();
    throw e;
  }
  ctx.session(req.id);
  if (ctx.signal.aborted) void manager.cancel(req.id);
  const { end, limited } = await ended;
  return { sessionId: req.id, end, limited, structured };
}

export const fixPrompt = (errors: string[]) =>
  ['Yapılandırılmış çıktın doğrulamadan geçmedi. Şu hataları düzelt ve tüm çıktıyı yeniden döndür:', ...errors.slice(0, 20).map((e) => `- ${e}`)].join('\n');

export interface StructuredRequest<T> {
  manager: SessionManager;
  ctx: StepContext;
  role: RoleName;
  prompt: string;
  schema: ArtifactSchemaName;
  /** Cross-artifact rules after the schema. */
  check?: (value: T) => string[];
  /** Fake driver only. */
  fakeScript?: (attempt: number) => FakeScript | undefined;
  maxFixes?: number;
}
export type StructuredResult<T> =
  | { ok: true; value: T; sessionIds: string[] }
  | { ok: false; cancelled: boolean; error: string; sessionIds: string[] };

/** Spec §14: schema errors → the same session fixes them (≤ 2); a crash → resume once; a rejected limit → resume when the gate opens. */
export async function runStructured<T>(r: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const outputFormat = { type: 'json_schema' as const, schema: outputJsonSchema(r.schema) };
  const ids: string[] = [];
  let prompt = r.prompt;
  type Resume = { claudeSessionId: string; parent: string };
  let resume: Resume | null = null;
  let fixes = 0;
  let limits = 0;
  let crashed = false;
  for (let attempt = 0; ; attempt++) {
    const id = randomUUID();
    ids.push(id);
    const run = await runAgentSession(r.manager, {
      id, kind: 'pipeline', role: r.role, prompt, runId: r.ctx.runId, stepId: r.ctx.stepId, outputFormat, autoResume: false,
      ...(resume ? { claudeSessionId: resume.claudeSessionId, resume: true, parentSessionId: resume.parent } : {}),
      fakeScript: r.fakeScript?.(attempt),
    }, r.ctx);
    if (run.end.status === 'cancelled' || r.ctx.signal.aborted) return { ok: false, cancelled: true, error: 'durduruldu', sessionIds: ids };
    const next: Resume = { claudeSessionId: resume?.claudeSessionId ?? id, parent: id };
    // The rejected turn never reached the model: resend the same instruction (a fix list stays a fix list).
    if (run.limited) {
      if (++limits > 5) return { ok: false, cancelled: false, error: 'kullanım limiti üst üste 5 kez reddetti', sessionIds: ids };
      resume = next;
      continue;
    }
    if (run.end.status === 'failed' && run.structured === null) {
      if (crashed) return { ok: false, cancelled: false, error: `agent hatası: ${run.end.error ?? 'bilinmiyor'}`, sessionIds: ids };
      crashed = true;
      resume = next;
      prompt = RESUME_PROMPT;
      continue;
    }
    const v = validateArtifact(r.schema, run.structured);
    const errors = run.structured === null ? ['yapılandırılmış çıktı yok'] : v.ok ? (r.check?.(v.value as T) ?? []) : v.errors;
    if (v.ok && !errors.length) return { ok: true, value: v.value as T, sessionIds: ids };
    if (fixes >= (r.maxFixes ?? 2)) return { ok: false, cancelled: false, error: `şema hatası: ${errors.slice(0, 5).join('; ')}`, sessionIds: ids };
    fixes++;
    resume = next;
    prompt = fixPrompt(errors);
  }
}
