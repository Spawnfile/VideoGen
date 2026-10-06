import { resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
const t = Date.now();
const out = await bundle({ entryPoint: resolve('src/index.ts') });
console.log('bundle ok', Date.now() - t, 'ms', out);
