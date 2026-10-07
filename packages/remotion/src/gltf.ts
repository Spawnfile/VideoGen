import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseGlb } from '@videogen/scene3d';

/** The GLB once per URL; Remotion waits for it (delayRender) and fails the render loudly if it cannot load. */
export function useGltf(url: string): GLTF | null {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [handle] = useState(() => delayRender('GLB yükleniyor'));
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`GLB ${r.status}`); return r.arrayBuffer(); })
      .then(parseGlb)
      .then((g) => { if (live) setGltf(g); continueRender(handle); }, (e: unknown) => cancelRender(e));
    return () => { live = false; };
  }, [url, handle]);
  return gltf;
}
