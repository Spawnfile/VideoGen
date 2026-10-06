import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { FramesToolResult } from '@videogen/claude';
import type { ToolHost } from '../agents/manager.ts';
import { extractFrame } from '../render/ffmpeg.ts';

/** Inherited frame budget: a 12-frame contact sheet (prepared by the step) + at most 12 single frames per review round. */
export const FRAME_BUDGET = 12;

/** The draft a draft_review step is looking at: the MP4, its frame count (ffprobe) and where single frames go. */
export interface ReviewTarget { video: string; frames: number; fps: number; durationS: number; outDir: string; used: number }

/**
 * In-process registry stepId → draft under review (single worker, spec §14). The step sets it before the reviewer session and
 * removes it afterwards; the budget counter lives here, so schema-fix and crash-resume sessions of the same round share it (grilling C22).
 */
export class ReviewTargets {
  private m = new Map<string, ReviewTarget>();
  set(stepId: string, t: Omit<ReviewTarget, 'used'>): void { this.m.set(stepId, { ...t, used: 0 }); }
  get(stepId: string): ReviewTarget | undefined { return this.m.get(stepId); }
  delete(stepId: string): void { this.m.delete(stepId); }
}

/** MCP ports for draft review sessions (spec §6.3 extract_frames, K27). Only reviewer_visual inside a step that registered a target. */
export function reviewToolHost(d: { ffmpeg: string; targets: ReviewTargets }): ToolHost {
  return {
    ports(s) {
      if (s.role !== 'reviewer_visual' || !s.stepId) return {};
      const stepId = s.stepId;
      return {
        extractFrames: async ({ times, crop }): Promise<FramesToolResult> => {
          const t = d.targets.get(stepId);
          if (!t) throw new Error('İncelenecek taslak yok.');
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
      };
    },
  };
}

/** Several hosts for one manager: each contributes the ports it owns for a session. */
export const toolHosts = (...hosts: ToolHost[]): ToolHost => ({ ports: (s) => Object.assign({}, ...hosts.map((h) => h.ports(s))) });
