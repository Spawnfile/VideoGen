import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { FramesToolResult, QcToolResult } from '@videogen/claude';
import { QC_CHECKS, type QcCheckResult, type QcReport } from '@videogen/shared';
import type { ToolHost } from '../agents/manager.ts';
import { extractFrame } from '../render/ffmpeg.ts';

/** Inherited frame budget: a 12-frame contact sheet (prepared by the step) + at most 12 single frames per review round. */
export const FRAME_BUDGET = 12;

/** The three final reviewers and the draft reviewer (the draft only uses reviewer_visual). */
export const REVIEW_ROLES = ['reviewer_visual', 'reviewer_facts', 'reviewer_retention'] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

/**
 * The video a review step is looking at: the MP4, its frame count (ffprobe) and where single frames go.
 * `role`/`seq` tell reviewers apart (final: three roles, a second visual pass is seq 2); `round` is the draft round for the draft review and the
 * fix round for the final (the step's own `ctx.round` stays the draft round through all final rounds); `qc` is the stored report run_qc returns.
 */
export interface ReviewTarget { round: number; video: string; frames: number; fps: number; durationS: number; outDir: string; used: number; role: ReviewRole; seq: number; qc: QcReport | null }

/**
 * In-process registry stepId → video under review per reviewer role (single worker, spec §14). The step sets it before the reviewer session and
 * removes it afterwards; the budget counter lives here, so schema-fix and crash-resume sessions of the same round share it (grilling C22).
 */
export class ReviewTargets {
  private m = new Map<string, ReviewTarget>();
  /** Deliberately kept across delete() (a worker-side retry keeps its count); bounded by the steps one worker process runs. */
  /** Frames used per step, role, round and pass: a worker-side retry of the same pass registers again and keeps its count (final review M3). */
  private spent = new Map<string, { used: number }>();
  set(stepId: string, t: Omit<ReviewTarget, 'used' | 'role' | 'seq' | 'qc'> & { role?: ReviewRole; seq?: number; qc?: QcReport | null }): void {
    const role = t.role ?? 'reviewer_visual';
    const seq = t.seq ?? 1;
    const key = `${stepId}:${role}:${t.round}:${seq}`;
    const c = this.spent.get(key) ?? { used: 0 };
    this.spent.set(key, c);
    const target = { ...t, role, seq, qc: t.qc ?? null } as ReviewTarget;
    Object.defineProperty(target, 'used', { get: () => c.used, set: (v: number) => { c.used = v; }, enumerable: true });
    this.m.set(`${stepId}:${role}`, target);
  }
  get(stepId: string, role: ReviewRole = 'reviewer_visual'): ReviewTarget | undefined { return this.m.get(`${stepId}:${role}`); }
  /** Without a role: every target of the step. */
  delete(stepId: string, role?: ReviewRole): void {
    for (const r of role ? [role] : REVIEW_ROLES) this.m.delete(`${stepId}:${r}`);
  }
}

/** run_qc for the agent: the stored report, the failed checks and the unscored D2/D3/D8 measurements (the reviewers' inputs). */
export function qcToolResult(r: QcReport): QcToolResult {
  const check = (c: QcCheckResult, variant: 'music' | 'tiktok' = 'music') => ({
    id: c.id, variant,
    label: `${QC_CHECKS[c.id].label_tr}${variant === 'tiktok' ? ' (müziksiz)' : ''}`, value: c.value, limit: c.limit, ...(c.at !== undefined ? { at: c.at } : {}),
  });
  const measure = (c: QcCheckResult) => QC_CHECKS[c.id].points === 0 && !QC_CHECKS[c.id].gate;
  return {
    pass: r.pass, gates: r.gates, scores: r.scores,
    failed: [...r.music.filter((c) => !c.pass && !measure(c)).map((c) => check(c)), ...r.tiktok.filter((c) => !c.pass && !measure(c)).map((c) => check(c, 'tiktok'))],
    measures: r.music.filter(measure).map((c) => ({ ...check(c), pass: c.pass })),
  };
}

/**
 * MCP ports for review sessions (spec §6.3 extract_frames, run_qc, K27). reviewer_visual gets extract_frames inside any review step (the draft
 * review registers a target); the other roles only when the step registered a target for them. run_qc only with a target that carries a report.
 */
export function reviewToolHost(d: { ffmpeg: string; targets: ReviewTargets }): ToolHost {
  return {
    ports(s) {
      if (!(REVIEW_ROLES as readonly string[]).includes(s.role) || !s.stepId) return {};
      const stepId = s.stepId;
      const role = s.role as ReviewRole;
      if (role !== 'reviewer_visual' && !d.targets.get(stepId, role)) return {};
      return {
        extractFrames: async ({ times, crop }): Promise<FramesToolResult> => {
          const t = d.targets.get(stepId, role);
          if (!t) throw new Error('İncelenecek video yok.');
          const left = FRAME_BUDGET - t.used;
          if (times.length > left) throw new Error(`Kare bütçesi: bu incelemede en çok ${FRAME_BUDGET} tek kare; kalan ${left}.`);
          t.used += times.length;
          await mkdir(t.outDir, { recursive: true });
          const frames: FramesToolResult['frames'] = [];
          const last = (t.frames - 1) / t.fps;
          for (const time of times) {
            const at = Math.min(time, last);
            const file = join(t.outDir, `t${String(Math.round(at * 1000)).padStart(6, '0')}${crop ? '-crop' : ''}.png`);
            await extractFrame(d.ffmpeg, t.video, file, { t: at, crop, signal: s.signal });
            frames.push({ time: Math.round(at * 1000) / 1000, frame: Math.round(at * t.fps), path: relative(s.runDir, file) });
          }
          return { frames, remaining: FRAME_BUDGET - t.used };
        },
        // Presence is decided when the ports are built (session start): the step registers the target before it opens the session.
        ...(d.targets.get(stepId, role)?.qc ? {
          runQc: async (): Promise<QcToolResult> => {
            const qc = d.targets.get(stepId, role)?.qc;
            if (!qc) throw new Error('İncelenecek video yok.');
            return qcToolResult(qc);
          },
        } : {}),
      };
    },
  };
}

/** Several hosts for one manager: each contributes the ports it owns for a session. */
export const toolHosts = (...hosts: ToolHost[]): ToolHost => ({ ports: (s) => Object.assign({}, ...hosts.map((h) => h.ports(s))) });
