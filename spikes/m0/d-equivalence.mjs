import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const dir = resolve(process.argv[2]);
const ref = JSON.parse(readFileSync(resolve(dir, 'anchors.json'), 'utf8'));
const buf = readFileSync(resolve(dir, 'scene.glb'));
const gltf = await new Promise((ok, ko) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, ko));

const scene = gltf.scene;
const camera = gltf.cameras[0];
camera.aspect = ref.width / ref.height;
camera.updateProjectionMatrix();
const mixer = new THREE.AnimationMixer(scene);
for (const clip of gltf.animations) {
  // LoopRepeat (default) wraps t == duration back to t = 0, so the last frame would sample frame 0.
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
}

let worst = 0;
for (const [frame, row] of Object.entries(ref.frames)) {
  mixer.setTime(Number(frame) / 30);
  scene.updateMatrixWorld(true);
  for (const [name, [bx, by]] of Object.entries(row)) {
    const node = scene.getObjectByName(`anchor_${name}`);
    const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).project(camera);
    const tx = (p.x + 1) / 2 * ref.width;
    const ty = (1 - p.y) / 2 * ref.height;
    const d = Math.hypot(tx - bx, ty - by);
    worst = Math.max(worst, d);
    console.log(`frame ${frame} ${name}: blender(${bx.toFixed(1)}, ${by.toFixed(1)}) three(${tx.toFixed(1)}, ${ty.toFixed(1)}) Δ=${d.toFixed(2)}px`);
  }
}
console.log(`worst Δ = ${worst.toFixed(2)} px (threshold 8)`);
process.exit(worst <= 8 ? 0 : 1);
