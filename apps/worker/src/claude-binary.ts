import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const sdkDir = () => dirname(require.resolve('@anthropic-ai/claude-agent-sdk'));

/** The SDK-bundled native CLI (pinned with the SDK, K20), never the user's auto-updating `claude`. Pinned to the file name. */
export function findBundledClaude(pkgDir = join(sdkDir(), '..', 'claude-agent-sdk-linux-x64')): string {
  const bin = join(pkgDir, 'claude');
  const s = statSync(bin, { throwIfNoEntry: false });
  if (!s?.isFile() || (s.mode & 0o111) === 0) throw new Error(`bundled claude binary not found under ${pkgDir}`);
  return bin;
}

export function sdkVersion(): string {
  return (JSON.parse(readFileSync(join(sdkDir(), 'package.json'), 'utf8')) as { version: string }).version;
}
