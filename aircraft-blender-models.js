import * as THREE from 'three';
import flyer from './assets/blender-aircraft/legacy-flyer.js';
import airship from './assets/blender-aircraft/airship.js';
import passenger from './assets/blender-aircraft/passenger.js';
import cargo from './assets/blender-aircraft/cargo.js';
import cruiser from './assets/blender-aircraft/cruiser.js';
import { enhanceAircraftGeometry } from './aircraft-lighting.js';

const sources = { 'legacy-flyer': flyer, airship, passenger, cargo, cruiser };
const cache = new Map();
function decode(attribute) {
  const binary = atob(attribute.data), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return attribute.type === 'uint32' ? new Uint32Array(bytes.buffer) : new Float32Array(bytes.buffer);
}

// Factory callers own clones. A disposed catalogue never invalidates the
// immutable Blender export used by the live city or a subsequently opened card.
export function makeBlenderAircraftGeometry(id) {
  if (!cache.has(id)) {
    const source = sources[id];
    if (!source) throw new Error(`Unknown Blender aircraft: ${id}`);
    const layers = {};
    for (const [name, data] of Object.entries(source.layers)) {
      const geometry = new THREE.BufferGeometry();
      for (const attribute of ['position', 'normal', 'color']) geometry.setAttribute(attribute, new THREE.BufferAttribute(decode(data[attribute]), 3));
      geometry.setIndex(new THREE.BufferAttribute(decode(data.index), 1));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      geometry.userData = { asset: id, authoring: source.generator, source: `assets/blender-aircraft/${id}.blend` };
      layers[name] = geometry;
    }
    const refined = enhanceAircraftGeometry(id, layers);
    for (const geometry of Object.values(refined)) geometry.userData.source = `assets/blender-aircraft/${id}.blend`;
    cache.set(id, refined);
  }
  return Object.fromEntries(Object.entries(cache.get(id)).map(([name, geometry]) => [name, geometry.clone()]));
}
