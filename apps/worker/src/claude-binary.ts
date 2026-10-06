import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** The SDK-bundled native CLI (pinned with the SDK), never the user's auto-updating `claude`. */
export function findBundledClaude(): string {
  const require = createRequire(import.meta.url);
  const sdkDir = dirname(require.resolve('@anthropic-ai/claude-agent-sdk'));
  const pkgDir = join(sdkDir, '..', 'claude-agent-sdk-linux-x64');
  const bin = readdirSync(pkgDir, { recursive: true })
    .map((f) => join(pkgDir, String(f)))
    .find((f) => {
      const s = statSync(f);
      return s.isFile() && (s.mode & 0o111) !== 0 && !f.endsWith('.json') && !f.endsWith('.md');
    });
  if (!bin) throw new Error(`bundled claude binary not found under ${pkgDir}`);
  return bin;
}
