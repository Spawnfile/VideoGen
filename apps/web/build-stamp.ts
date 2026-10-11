import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const MARKER = "const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';";

/** Writes the build id into the worker's own bytes: the browser only installs a new worker when its script changes. */
export function stampServiceWorker(src: string, buildId: string): string {
  if (!src.includes(MARKER)) throw new Error('sw.js: build marker not found');
  return src.replace(MARKER, `const BUILD = '${buildId}';`);
}

/** After the build: stamp dist/sw.js and write dist/version.json, which open pages poll to offer the new version. */
export function buildStamp(buildId: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'videogen-build-stamp',
    apply: 'build',
    configResolved(c) { outDir = join(c.root, c.build.outDir); },
    writeBundle() {
      const sw = join(outDir, 'sw.js');
      writeFileSync(sw, stampServiceWorker(readFileSync(sw, 'utf8'), buildId));
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ build: buildId }));
    },
  };
}
