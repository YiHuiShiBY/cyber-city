import { makeBlenderAircraftGeometry } from './aircraft-blender-models.js';

// The offline Blender exports replace near-view geometry inside the existing
// three instanced material batches. Original route/low-detail models stay local.
export function makeSkyTrafficDetails() {
  return Object.fromEntries(['passenger','cargo','cruiser'].map(kind => [kind, makeBlenderAircraftGeometry(kind)]));
}
