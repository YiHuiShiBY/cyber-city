import * as THREE from 'three';
import { detailBuilder } from './city-detail-geometry.js';

const LOCATION = [-24, 0, -143];
const CYAN = '#77dedd';
const STEEL = '#526a76';
const DARK = '#182b38';

// Each ring is [elevation, centre x, centre z, width, depth]. The two bent
// shafts approach one another only at the crown, leaving an actual open atrium.
const WEST_ARM = [
  [4, -14.5, -.8, 13.8, 17.4],
  [32, -15.1, -.8, 13, 17.4],
  [61, -14.7, -1, 12.4, 16.4],
  [88, -13, -1.5, 12.2, 15.4],
  [113, -10.9, -1.8, 12.8, 14.2],
  [128, -10.9, -1.8, 11.6, 13.4],
];
const EAST_ARM = [
  [4, 15.1, 1, 12.4, 16],
  [34, 15, 1, 12.4, 16],
  [68, 13.6, .7, 11.6, 15.2],
  [95, 11.1, .2, 12.4, 14.2],
  [117, 10.1, -.2, 11.6, 13.6],
];

function ringCorners([y, x, z, width, depth]) {
  const w = width / 2, d = depth / 2, cut = Math.min(width, depth) * .13;
  return [
    [x - w + cut, y, z - d], [x + w - cut, y, z - d],
    [x + w, y, z - d + cut], [x + w, y, z + d - cut],
    [x + w - cut, y, z + d], [x - w + cut, y, z + d],
    [x - w, y, z + d - cut], [x - w, y, z - d + cut],
  ];
}

function armGeometry(rings) {
  const vertices = rings.flatMap(ring => ringCorners(ring).flat()), indices = [];
  for (let level = 0; level < rings.length - 1; level++) {
    for (let side = 0; side < 8; side++) {
      const a = level * 8 + side, b = level * 8 + (side + 1) % 8;
      indices.push(a, a + 8, b, b, a + 8, b + 8);
    }
  }
  const top = (rings.length - 1) * 8;
  for (let side = 1; side < 7; side++) {
    indices.push(0, side, side + 1, top, top + side + 1, top + side);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function sampleArm(rings, y) {
  for (let index = 1; index < rings.length; index++) {
    if (y > rings[index][0]) continue;
    const a = rings[index - 1], b = rings[index];
    const amount = THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    return a.map((value, component) => THREE.MathUtils.lerp(value, b[component], amount));
  }
  return rings[rings.length - 1].slice();
}

function profileGeometry(points, depth, z = 0) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false })
    .translate(0, 0, z - depth / 2);
}

function installFacadeGrid(material, uniforms) {
  material.name = 'HeadquartersProceduralCurtainWall';
  material.onBeforeCompile = shader => {
    shader.uniforms.uHeadquartersTime = uniforms.uHeadquartersTime;
    shader.vertexShader = 'varying vec3 vHeadquartersPosition;\nvarying vec3 vHeadquartersNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vHeadquartersPosition = transformed;
      vHeadquartersNormal = objectNormal;
    `);
    shader.fragmentShader = `
      uniform float uHeadquartersTime;
      varying vec3 vHeadquartersPosition;
      varying vec3 vHeadquartersNormal;
      float headquartersHash(vec2 cell) {
        return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 hqNormal = abs(normalize(vHeadquartersNormal));
      vec2 hqSurface = hqNormal.x > hqNormal.z ? vHeadquartersPosition.zy : vHeadquartersPosition.xy;
      vec2 hqGrid = hqSurface / vec2(1.18, 2.28);
      vec2 hqCell = floor(hqGrid);
      vec2 hqFraction = fract(hqGrid);
      vec2 hqAA = min(fwidth(hqGrid), vec2(.22));
      vec2 hqPaneEdges = smoothstep(vec2(.17, .20) - hqAA, vec2(.17, .20) + hqAA, hqFraction)
        * (1. - smoothstep(vec2(.78, .67) - hqAA, vec2(.78, .67) + hqAA, hqFraction));
      float hqPane = hqPaneEdges.x * hqPaneEdges.y
        * (1. - smoothstep(.15, .3, hqNormal.y)) * step(10.8, vHeadquartersPosition.y);
      float hqOccupancy = headquartersHash(hqCell + floor(hqNormal.xz * 8.));
      float hqLit = step(.64, hqOccupancy);
      float hqWarm = step(.925, hqOccupancy);
      float hqMullion = 1. - smoothstep(.015, .045, min(hqFraction.y, 1. - hqFraction.y));
      diffuseColor.rgb *= 1. - hqMullion * .2;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.018, .040, .053), hqPane * .68);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 hqWindowColor = mix(vec3(.028, .145, .195), vec3(.53, .30, .12), hqWarm);
      float hqPulse = .96 + .04 * sin(uHeadquartersTime * .05235987756 + hqCell.y * .37);
      totalEmissiveRadiance += hqWindowColor * hqPane * hqLit * hqPulse;
    `);
  };
  material.customProgramCacheKey = () => 'megacity-headquarters-facade-v1';
}

/** A single corporate landmark, in district world coordinates. No scene settings are changed. */
export function makeMegacityHeadquarters() {
  const group = new THREE.Group();
  group.name = 'MegacityHeadquarters';
  group.position.fromArray(LOCATION);

  const facade = detailBuilder(), structure = detailBuilder(), concrete = detailBuilder();
  const glazing = detailBuilder(), cyan = detailBuilder(), warm = detailBuilder();
  const animationUniforms = { uHeadquartersTime: { value: 0 } };

  facade.add(armGeometry(WEST_ARM), '#294653');
  facade.add(armGeometry(EAST_ARM), '#233b4b');

  // A low civic plinth grounds the megastructure. Front steps stay inside the
  // 44 x 34 envelope and the two tall wings never become a filled centre slab.
  concrete.box(0, .3, 0, 44, .6, 32, '#2b414c');
  concrete.box(0, 1.15, -.5, 42.4, 1.1, 29, '#334c56');
  concrete.box(0, 2.35, -1, 40.6, 1.3, 26.6, '#273c47');
  for (let step = 0; step < 5; step++) {
    concrete.box(0, .55 + step * .23, 15.7 - step * .74, 20.5, .34, .94, '#526571');
  }
  for (const side of [-1, 1]) {
    cyan.box(side * 20.85, 1.73, -.5, .11, .065, 27.8, '#3c9caa');
    concrete.box(side * 12.5, 5.7, 8, 2.7, 5.4, 5.9, '#3f5761');
    structure.box(side * 12.5, 8.6, 10.5, 3.4, .55, 11.4, STEEL);
    for (let column = 0; column < 4; column++) {
      const x = side * (4.1 + column * 2.05);
      structure.box(x, 5.4, 10.95, .25, 4.8, .36, STEEL);
    }
  }
  facade.box(0, 5.35, 3.9, 23.5, 5.4, 12.4, '#233a48');
  glazing.box(0, 5.32, 10.18, 22.8, 4.9, .075, '#1b626e');
  structure.box(0, 8.4, 10.7, 28.5, .68, 9.1, DARK);
  cyan.box(0, 8.09, 15.3, 25.8, .105, .09, CYAN);
  warm.box(0, 3.3, 10.26, 20.5, .12, .07, '#c9a575');
  for (const x of [-8, -4, 0, 4, 8]) structure.box(x, 5.3, 10.27, .09, 4.6, .09, '#59717b');

  function collar(rings, y) {
    const [, x, z, width, depth] = sampleArm(rings, y);
    for (const side of [-1, 1]) {
      structure.box(x, y, z + side * depth / 2, width + .45, .86, .66, DARK);
      structure.box(x + side * width / 2, y, z, .66, .86, depth + .45, DARK);
      structure.box(x, y + .49, z + side * depth / 2, width + .55, .11, .73, STEEL);
    }
  }

  // Chamfered structural spines follow the changing sections instead of a
  // rectangular outline. Occasional diagonal outriggers carry the upper tiers.
  function armFrame(rings, isWest) {
    for (let level = 1; level < rings.length; level++) {
      const lower = ringCorners(rings[level - 1]), upper = ringCorners(rings[level]);
      for (const corner of [1, 3, 5, 7]) {
        structure.beam(lower[corner], upper[corner], .32, '#718b96');
      }
    }
    const bands = isWest ? [32, 61, 88, 113, 127.7] : [34, 68, 95, 116.7];
    bands.forEach(y => collar(rings, y));
    for (let level = 1; level < rings.length - 1; level++) {
      const a = rings[level - 1], b = rings[level];
      const inner = isWest ? 1 : -1;
      // These broad piers sit at the rear, leaving the southeast atrium view open.
      const from = [a[1] + inner * a[3] * .34, a[0] + 2.2, a[2] - a[4] / 2 - .11];
      const to = [b[1] - inner * b[3] * .32, b[0] - 1.2, b[2] - b[4] / 2 - .11];
      structure.beam(from, to, .30, '#3b5562');
    }
    const innerEdge = isWest ? 3 : 5;
    for (let level = 1; level < rings.length; level++) {
      const start = ringCorners(rings[level - 1])[innerEdge];
      const end = ringCorners(rings[level])[innerEdge];
      start[2] += .18; end[2] += .18;
      cyan.beam(start, end, .18, '#9ceddf');
    }
  }
  armFrame(WEST_ARM, true);
  armFrame(EAST_ARM, false);

  // Each observation terrace has its own deck, soffit, glazing, railing and
  // knee brackets. Terraces add a human scale without individual box windows.
  function terrace(rings, elevation, width) {
    const [, x, z, , depth] = sampleArm(rings, elevation);
    const back = z + depth / 2 - 1.1, front = Math.min(16.25, back + 6.1);
    const centreZ = (front + back) / 2, deckDepth = front - back;
    structure.box(x, elevation, centreZ, width, .55, deckDepth, STEEL);
    structure.box(x, elevation - .42, centreZ - .4, width - .5, .3, deckDepth - .8, DARK);
    glazing.box(x, elevation + .91, front - .09, width - .22, 1.15, .075, '#1b5663');
    structure.box(x, elevation + 1.53, front, width, .085, .10, '#7b8c92');
    cyan.box(x, elevation + .32, front + .035, width - .3, .075, .055, '#5ebbbb');
    for (const side of [-1, 1]) {
      structure.box(x + side * width / 2, elevation + 1.53, centreZ, .085, .085, deckDepth, '#7b8c92');
      glazing.box(x + side * (width / 2 - .075), elevation + .91, centreZ, .075, 1.15, deckDepth, '#1b5663');
      structure.beam([x + side * width * .34, elevation - 2.1, back + .1],
        [x + side * width * .34, elevation - .23, front - .3], .16, STEEL);
    }
    for (let post = 0; post <= 6; post++) {
      structure.box(x - width / 2 + post * width / 6, elevation + .92, front, .07, 1.2, .11, STEEL);
    }
    for (const side of [-1, 1]) {
      concrete.box(x + side * width * .29, elevation + .55, back + .9, 2, .65, .9, '#293c46');
      // Compact roof planting reads as a dark texture, not a new animated actor.
      concrete.box(x + side * width * .29, elevation + .95, back + .9, 1.8, .28, .7, '#3c645b');
    }
  }
  terrace(WEST_ARM, 32.7, 12.1);
  terrace(WEST_ARM, 61.7, 11.4);
  terrace(WEST_ARM, 88.7, 11.2);
  terrace(EAST_ARM, 34.7, 11.4);
  terrace(EAST_ARM, 68.7, 10.8);
  terrace(EAST_ARM, 95.7, 11.1);

  // The sloping bridge crown visibly spans the two arms and cantilevers to the
  // east. Its dark soffit and fine illuminated lip keep the open centre legible.
  const crownProfile = [[-20, 119], [-20, 123], [-14, 127], [21.65, 124], [21.65, 120], [16, 117.8]];
  facade.add(profileGeometry(crownProfile, 19, -.5), '#294550');
  structure.box(0, 117.3, -.5, 33.8, .7, 17.2, DARK);
  structure.box(1.5, 116.5, 11.4, 31.4, .66, 8.6, STEEL);
  glazing.box(1.5, 117.38, 15.63, 31.1, 1.12, .09, '#245e67');
  cyan.box(1.5, 116.91, 15.72, 30.8, .10, .08, CYAN);
  structure.box(1.5, 118.0, 15.72, 31.4, .10, .10, '#728c96');
  for (let x = -13.8; x < 17; x += 2.6) {
    structure.box(x, 117.42, 15.7, .095, 1.2, .11, STEEL);
  }
  for (const z of [-7.4, 7.1]) {
    structure.beam([-5.9, 104, z], [1.1, 117.1, z], .4, STEEL);
    structure.beam([5.3, 108, z], [-.2, 117.1, z], .33, '#49606d');
    structure.beam([12.1, 103, z], [20.7, 120, z], .34, '#49606d');
  }
  for (const z of [-10.08, 9.08]) {
    for (const [a, b] of [[[-20, 123], [-14, 127]], [[-14, 127], [21.65, 124]], [[21.65, 120], [16, 117.8]]]) {
      cyan.beam([a[0], a[1], z], [b[0], b[1], z], .13, CYAN);
    }
    warm.beam([-18.8, 119.0, z], [15.5, 118.0, z], .045, '#c9a373');
  }
  // Thin roof blades and visible service enclosures break the large crown's
  // otherwise smooth roof plane without competing with its single strong line.
  for (let fin = 0; fin < 10; fin++) {
    const x = -11.5 + fin * 2.2, y = 126.95 - (x + 14) * (3 / 35.65);
    structure.box(x, y + .33, -.6, .13, .44, 16.8, '#455f6c');
  }
  structure.box(-10.1, 128.7, -2.1, 8.3, 1.15, 12.7, '#2e4653');
  structure.box(-12.1, 130, -4.6, 3.7, 1.45, 5.8, '#405966');
  for (let vent = 0; vent < 6; vent++) {
    structure.box(-12.1, 130.78, -6.9 + vent * .85, 3.25, .14, .20, STEEL);
  }
  structure.box(-7.1, 130.7, -.5, .34, 4.3, 1.6, '#5f7480');
  cyan.box(-7.1, 132.8, .33, .15, .18, .09, CYAN);
  structure.beam([-12.1, 130.7, -4.6], [-12.1, 137.73, -4.6], .105, '#748a94');
  structure.beam([-12.1, 135.2, -4.6], [-10.6, 135.2, -4.6], .045, '#748a94');
  warm.box(-12.1, 137.85, -4.6, .26, .30, .26, '#e5a16c');

  // A built geometric monogram (two interrupted chevrons) needs no font or
  // image download. It occupies the crown fascia rather than filling the void.
  structure.box(1.0, 122.35, 9.12, 8.5, 4.4, .26, '#142c37');
  const logoZ = 9.32;
  for (const offset of [-1.6, 1.5]) {
    cyan.beam([offset - 1.15, 121.3, logoZ], [offset, 123.55, logoZ], .16, '#a0efdf');
    cyan.beam([offset, 123.55, logoZ], [offset + .73, 122.13, logoZ], .16, '#a0efdf');
    cyan.beam([offset + .87, 121.87, logoZ], [offset + 1.15, 121.3, logoZ], .16, '#a0efdf');
  }
  warm.box(1, 120.64, logoZ, 4.7, .065, .065, '#d1ab77');

  // All permanent details are baked into six material batches. The curtain
  // wall contributes no window geometry and every animation is one scalar.
  const facadeMesh = facade.mesh('HeadquartersFacade', { metalness: .57, roughness: .36 });
  installFacadeGrid(facadeMesh.material, animationUniforms);
  const structureMesh = structure.mesh('HeadquartersStructure', { metalness: .63, roughness: .39 });
  structureMesh.material.emissive.set('#407b89');
  structureMesh.material.emissiveIntensity = .22;
  const concreteMesh = concrete.mesh('HeadquartersPlinth', { metalness: .24, roughness: .72 });
  const glassMesh = glazing.mesh('HeadquartersTerraceGlass', { metalness: .68, roughness: .19 });
  glassMesh.material.emissive.set('#1a5660');
  glassMesh.material.emissiveIntensity = .19;
  const cyanMesh = cyan.mesh('HeadquartersCyanLighting', { glow: true });
  const warmMesh = warm.mesh('HeadquartersWarmLighting', { glow: true });
  group.add(facadeMesh, structureMesh, concreteMesh, glassMesh, cyanMesh, warmMesh);

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const framingPoints = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    framingPoints.push(new THREE.Vector3(x, y, z));
  }
  group.userData = {
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
    framingPoints,
    height: 138,
    label: '天穹总部',
    brand: 'SKYVAULT',
    view: { camera: [99, 87, 50], target: [-24, 68, -143] },
    animationUniforms,
    update(seconds) {
      // A full 120-second period is continuous at its wrap and stable after a
      // backwards seek; no accumulated delta, randomness or frame allocation.
      const time = Number.isFinite(seconds) ? ((seconds % 120) + 120) % 120 : 0;
      animationUniforms.uHeadquartersTime.value = time;
    },
  };
  return group;
}
