import { z } from 'zod';

/** Video library L8: one episode made outside the pipeline; its files live in <dataDir>/episodes/<slug>/ (final.mp4, caption.txt). */
export const EpisodeEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  product: z.string().min(2).max(80),
  title: z.string().min(2).max(160),
  language: z.enum(['en', 'tr']),
  audioMode: z.enum(['silent', 'vo']),
  approach: z.enum(['yaklasim']).nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  recordedAt: z.iso.datetime(),
});
export const EpisodeManifestSchema = z.object({ episodes: z.array(EpisodeEntrySchema).min(1) });
export type EpisodeEntry = z.infer<typeof EpisodeEntrySchema>;
