import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const dir = process.argv[2];
const anchors = JSON.parse(readFileSync(dir + '/anchors.json', 'utf8'));
const track = JSON.parse(readFileSync(dir + '/camera_track.json', 'utf8'));
const buf = readFileSync(dir + '/scene.glb');
const g = await new Promise((ok, ko) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, ko));
const cam = g.cameras[0]; const mixer = new THREE.AnimationMixer(g.scene);
const actions = g.animations.map((c) => { const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); return a; });
const seek = (t) => { for (const a of actions) { a.enabled = true; a.paused = false; a.time = Math.min(t, a.getClip().duration); } mixer.update(0); };
const frames = [0, 337, 675, 1012, 1350]; let worst = 0;
for (const f of frames) {
  seek(f / 30); g.scene.updateMatrixWorld(true);
  cam.fov = THREE.MathUtils.radToDeg(track.yfov[f]); cam.aspect = 1080 / 1920; cam.updateProjectionMatrix();
  for (const [pid, [bx, by]] of Object.entries(anchors.frames[String(f)])) {
    const node = g.scene.getObjectByName(`anchor_${pid}`);
    const p = node.getWorldPosition(new THREE.Vector3()).project(cam);
    const d = Math.hypot((p.x + 1) / 2 * 1080 - bx, (1 - p.y) / 2 * 1920 - by); worst = Math.max(worst, d);
  }
}
console.log('clips', g.animations.length, 'worst', worst.toFixed(3));
