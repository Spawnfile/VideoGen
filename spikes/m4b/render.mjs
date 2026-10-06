import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, ensureBrowser } from '@remotion/renderer';

const glb = readFileSync(resolve('../m0/work/glb/scene.glb'));
const srv = createServer((req, res) => { res.writeHead(200, { 'content-type': 'model/gltf-binary', 'access-control-allow-origin': '*' }); res.end(glb); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const glbUrl = `http://127.0.0.1:${srv.address().port}/scene.glb`;
const mode = process.argv[2] ?? 'headless-shell';
const gl = process.argv[3] ?? 'angle';
const scale = Number(process.argv[4] ?? 0.5);
let t = Date.now();
const serveUrl = await bundle({ entryPoint: resolve('src/index.ts') });
console.log('bundle ms', Date.now() - t);
t = Date.now();
await ensureBrowser({ chromeMode: mode });
console.log('ensureBrowser ms', Date.now() - t);
const inputProps = { glbUrl, scale };
const composition = await selectComposition({ serveUrl, id: 'Draft', inputProps, chromeMode: mode, chromiumOptions: { gl } });
t = Date.now();
let last = -1;
await renderMedia({ composition, serveUrl, codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', crf: 18, x264Preset: 'veryfast', outputLocation: `out-${mode}-${gl}-${scale}.mp4`, inputProps, concurrency: 2, chromeMode: mode,
  chromiumOptions: { gl }, onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`${p * 10}% `); } } });
console.log('\nrender ms', Date.now() - t, composition.width, composition.height, composition.durationInFrames);
srv.close();
