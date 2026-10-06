import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import type pg from 'pg';
import { putBlob } from '../media.ts';

async function gzipTo(src: string, dest: string): Promise<void> {
  await mkdir(join(dest, '..'), { recursive: true });
  await pipeline(createReadStream(src), createGzip(), createWriteStream(dest));
}

/** Spec §6.5: ~/.claude/projects is cleaned after 30 days, so each finished session's transcript is copied (gzipped). */
export async function archiveTranscript(o: { pool: pg.Pool; dataDir: string; sessionId: string; claudeSessionId: string; configDir?: string }): Promise<string | null> {
  const projects = join(o.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  for (const slug of await readdir(projects).catch(() => [] as string[])) {
    const main = join(projects, slug, `${o.claudeSessionId}.jsonl`);
    if (!existsSync(main)) continue;
    const dest = join(o.dataDir, 'archive', 'transcripts', o.sessionId);
    const mainGz = join(dest, `${o.claudeSessionId}.jsonl.gz`);
    await gzipTo(main, mainGz);
    const sub = join(projects, slug, o.claudeSessionId, 'subagents');
    for (const f of await readdir(sub).catch(() => [] as string[])) await gzipTo(join(sub, f), join(dest, 'subagents', `${f}.gz`));
    return (await putBlob(o.pool, o.dataDir, mainGz)).sha256;
  }
  return null;
}
