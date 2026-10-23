import { addArchitectureDetails } from './architecture-details.js';
import * as THREE from 'three';
import { OUTER_DISTRICT_STYLES } from './district-styles.js';
import { DISTRICT_LAYOUT } from './district-layout.js';
import { applySurfaceDetail } from './surface-detail.js';
import { applyFacadeWallWash } from './facade-wall-wash.js';
import {
  WINDOW_BLINK_ATTRIBUTE, applyWindowBlink, blinkKindFor, blinkPhaseFor, makeWindowBlinkUniforms,
} from './district-window-blink.js';

function randomSequence(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// District facade grid (V-3). Every builder derives its fenestration from these two numbers
// instead of from its own width and height, which is what stops three adjacent lots of equal
// depth from showing three different window scales: the pane is the same size on every facade
// and only the count changes with the span.
// The values were picked by sweeping the pair and keeping the one that leaves the district's
// density alone -- 1.6 x .95 yields 7,420 panes for 649,344 triangles against the pre-change
// 6,417 / 649,750 (previews/grid-sweep.json). The horizon's coarser 3.2 x 2.6 yields 2,455 panes
// and turns every facade into a blank slab: previews/ab-batchA/after-v06-slab-edge.png.
const FLOOR_HEIGHT = 1.6, BAY_WIDTH = .95;
// The horizon masses are a distant, proportionally larger representation, so they keep their own
// coarser grid -- which is what they already had (`2.8 + rng() * .6` tall, `span / 2.6` across).
// One shared pair cannot serve both scales.
const HORIZON_FLOOR_HEIGHT = 3.2, HORIZON_BAY_WIDTH = 2.6;
export { FLOOR_HEIGHT, BAY_WIDTH, HORIZON_FLOOR_HEIGHT, HORIZON_BAY_WIDTH };

// All lettering shares one offline atlas and one ordinary, reflection-safe material.
// Sign atlas geometry. Published through group.userData.signAtlas so the QA suites can derive
// cell indices from the runtime instead of hardcoding the row count (that hardcoding is what
// silently broke _phase2/qa-nine-styles-geometry.cjs when the atlas grew).
const SIGN_ATLAS_COLUMNS = 8, SIGN_CELL_WIDTH = 256, SIGN_CELL_HEIGHT = 128;
const SIGN_ATLAS_ROWS = 24;                              // 2048 x 3072 -> 192 slots
// Subtitle rosters baked into the atlas. LIVE and HOTEL get several so that two boards on
// adjacent facades of the same tower never read as the same word twice (V-14 is exactly that
// visual collision, not a UV bug).
const SIGN_LIVE_SUBTITLES = ['TONIGHT / 23:48', 'DOORS / 22:30', 'ENCORE / 01:10', 'LAST SET / 02:40'];
const SIGN_HOTEL_SUBTITLES = ['MIDNIGHT / ROOMS', 'VACANCY / 24H', 'SUITES / 32F'];
const SIGN_NUMBERS = Array.from({ length: 24 }, (unused, i) => String(i + 1).padStart(2, '0'));
function makeSignAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_ATLAS_COLUMNS * SIGN_CELL_WIDTH;   // 2048
  canvas.height = SIGN_ATLAS_ROWS * SIGN_CELL_HEIGHT;    // 3072
  const context = canvas.getContext('2d');
  const cells = new Map();
  const cellKeys = [];                                   // kept live: cells are also added lazily
  const cellWidth = SIGN_CELL_WIDTH, cellHeight = SIGN_CELL_HEIGHT;
  const columns = SIGN_ATLAS_COLUMNS, rows = SIGN_ATLAS_ROWS;
  let overflow = 0;
  context.fillStyle = '#071018';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Cells outside the canvas used to be clipped silently, which is how a too-small atlas went
  // unnoticed. Count them instead so the QA can assert the atlas still has room.
  function cell(text, type = 'shop', subtitle = 'AFTER HOURS / 24H') {
    const key = `${type}:${text}:${subtitle}`;
    if (cells.has(key)) return cells.get(key);
    const index = cells.size, x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight;
    if (Math.floor(index / columns) >= rows) overflow++;
    context.save(); context.translate(x, y);
    context.fillStyle = '#08121a'; context.fillRect(0, 0, cellWidth, cellHeight);
    context.strokeStyle = '#d6e8ed'; context.lineWidth = type === 'poster' ? 5 : 2;
    context.strokeRect(7, 7, 242, 114);
    context.textAlign = 'center'; context.textBaseline = 'middle';
    if (type === 'poster') {
      context.fillStyle = '#8495a1';
      context.beginPath(); context.arc(128, 59, 43, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#27354d';
      context.beginPath(); context.arc(128, 59, 31, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fff'; context.font = '900 40px sans-serif'; context.fillText('LIVE', 128, 58);
      context.font = 'bold 20px "Microsoft YaHei", sans-serif'; context.fillText(text, 128, 104, 220);
      context.fillStyle = '#fff'; context.fillRect(16, 15, 35, 7); context.fillRect(205, 15, 35, 7);
    } else if (type === 'vertical') {
      context.fillStyle = '#fff';
      if (text === 'HOTEL') {
        // The quad turns through 90 degrees; counter-rotate each glyph so the
        // exterior hotel board reads as an upright H / O / T / E / L column.
        context.font = '900 76px sans-serif';
        [...text].forEach((character, index) => {
          context.save(); context.translate(218 - index * 45, 64); context.rotate(-Math.PI / 2);
          context.fillText(character, 0, 0); context.restore();
        });
      } else {
        context.font = '900 54px sans-serif'; context.fillText(text, 128, 58, 223);
        context.font = '15px monospace'; context.fillStyle = '#b6cbd4'; context.fillText(subtitle, 128, 101, 228);
      }
    } else {
      context.fillStyle = '#fff'; context.shadowColor = '#fff'; context.shadowBlur = 3;
      context.font = `${type === 'number' ? '900 76px' : 'bold 50px'} "Microsoft YaHei", sans-serif`;
      context.fillText(text, 128, 54, 228); context.shadowBlur = 0;
      context.font = '13px monospace'; context.fillStyle = '#b6cbd4'; context.fillText(subtitle, 128, 104, 226);
      context.fillStyle = '#71838e'; context.fillRect(24, 84, 208, 2);
    }
    context.restore();
    const result = { u0: (x + 1) / canvas.width, u1: (x + cellWidth - 1) / canvas.width, v0: 1 - (y + cellHeight - 1) / canvas.height, v1: 1 - (y + 1) / canvas.height };
    cells.set(key, result); cellKeys.push(key); return result;
  }
  // Every cell the builders can ask for is created here, with the exact subtitle the call site
  // passes: sign() forwards the sector's `english`, so pre-creating with the default subtitle
  // would leave a second, lazily created copy of the same word. That mismatch is why the cell
  // count grew the moment `subtitle` joined the dedup key.
  for (const style of OUTER_DISTRICT_STYLES) {
    cell(style.sign, 'shop', style.english);
    style.shops.forEach(text => cell(text, 'shop', style.english));
    style.signs.forEach(text => cell(text, 'shop', style.english));
  }
  const englishOf = id => OUTER_DISTRICT_STYLES.find(style => style.id === id).english;
  for (const number of SIGN_NUMBERS) cell(number, 'number', englishOf('northwest'));
  // theatre() paints its whole poster wall with b.word, so every east shop word needs a poster.
  OUTER_DISTRICT_STYLES.find(style => style.id === 'east').shops.forEach(text => cell(text, 'poster', englishOf('east')));
  SIGN_LIVE_SUBTITLES.forEach(subtitle => cell('LIVE', 'vertical', subtitle));
  SIGN_HOTEL_SUBTITLES.forEach(subtitle => cell('HOTEL', 'vertical', subtitle));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const layout = {
    columns, rows, cellWidth, cellHeight, width: canvas.width, height: canvas.height, cellKeys,
    // Live getters: cells are also created lazily, so a snapshot taken here would under-report.
    get used() { return cells.size; },
    get overflow() { return overflow; },
    get free() { return columns * rows - cells.size; },
  };
  return { texture, cell, cells, cellKeys, layout };
}

function sawtoothGeometry() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [
    -.5,-.5,-.5, .5,-.5,-.5, .5,.5,-.5,
    -.5,-.5,.5, .5,.5,.5, .5,-.5,.5,
    -.5,-.5,-.5, .5,.5,-.5, .5,.5,.5, -.5,-.5,-.5, .5,.5,.5, -.5,-.5,.5,
    .5,-.5,-.5, .5,-.5,.5, .5,.5,.5, .5,-.5,-.5, .5,.5,.5, .5,.5,-.5,
    -.5,-.5,-.5, -.5,-.5,.5, .5,-.5,.5, -.5,-.5,-.5, .5,-.5,.5, .5,-.5,-.5,
  ];
  for (let triangle = 0; triangle < vertices.length; triangle += 9) {
    for (let axis = 0; axis < 3; axis++) {
      const a = triangle + 3 + axis, b = triangle + 6 + axis;
      [vertices[a], vertices[b]] = [vertices[b], vertices[a]];
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals(); return geometry;
}

// ---------------------------------------------------------------------------
// Frozen layout table.
//
// Every builder shares ONE rng stream with the building height and facade paint
// (randomSequence(seed + 61721) is the only stream here), so changing any builder's draw
// count would silently re-roll the height and paint of every later building. These two tables
// pin that layout to the 2026-09-15 state of seed 2049 so the facade work in
// cyber-city/视觉改造计划-20260915.md is layout-neutral.
//
// Source of truth: cyber-city/previews/baseline-20260915.json
// (dump again with _phase2/_visual-baseline.cjs and compare using _phase2/_diff-baseline.cjs).
//
// build() still performs the same rng() draws (1 for the height value, 1 for the paint tint)
// so the rest of the stream stays in phase; only the published values come from here.
const FROZEN_HEIGHTS = [
  16.55, 14.05, 12.55, 19.05, 18.35, 21.1, 9.8, 15.05, 11.55, 13.55,
  11.75, 21.65, 27.65, 27.9, 32.15, 21.7, 23.65, 31.3, 24.25, 28.7,
  23.55, 23.65, 30.3, 33.7, 8.75, 11.7, 13.35, 9.2, 11.65, 13.8,
  12.35, 12.25, 15.3, 13.9, 12.8, 16.7, 12.1, 15.8, 13.7, 12.5,
  12.7, 17.55, 19.8, 15.6, 15.5, 19.45, 23.9, 25.75, 23.95, 21.2,
  21.95, 15.6, 21.4, 23.7, 9.4, 7.9, 9.15, 7.45, 11.15, 11.05,
  7.75, 8.55, 7.5, 9.6, 8.65, 11.2, 11.95, 15.05, 13.55, 11.55,
  16.45, 18.9, 16.7, 13.7, 16.95, 15.95, 12.5, 18.3, 15.55, 14.4,
  14.8, 12.7, 16.9, 17.1, 11.55, 15.95, 14.6, 16.3, 10.95, 17.55
];
// Working-space (linear) floats, not sRGB hex: Color.getHexString() would quantise to 8 bits.
const FROZEN_PAINTS = [
  [0.0393026, 0.0735527, 0.1052161], [0.0369852, 0.0692157, 0.0990121], [0.0377026, 0.0705585, 0.1009329],
  [0.0379496, 0.0710206, 0.101594], [0.0376604, 0.0704794, 0.1008197], [0.0382136, 0.0715147, 0.1023007],
  [0.0389809, 0.0729507, 0.1043549], [0.0371165, 0.0694616, 0.0993638], [0.0358931, 0.067172, 0.0960885],
  [0.037841, 0.0708173, 0.1013032], [0.0368955, 0.0690479, 0.098772], [0.0338982, 0.0634386, 0.090748],
  [0.0244665, 0.0619317, 0.0885139], [0.0226164, 0.0572486, 0.0818207], [0.0212706, 0.053842, 0.0769519],
  [0.0247565, 0.0626659, 0.0895632], [0.0204153, 0.0516769, 0.0738575], [0.0223008, 0.0564496, 0.0806788],
  [0.0240599, 0.0609025, 0.087043], [0.0233899, 0.0592065, 0.084619], [0.0202587, 0.0512807, 0.0732912],
  [0.0238764, 0.0604381, 0.0863792], [0.0229587, 0.0581152, 0.0830592], [0.0215684, 0.0545958, 0.0780292],
  [0.0502748, 0.0711645, 0.0918802], [0.0496406, 0.0702667, 0.0907212], [0.0551635, 0.0780844, 0.1008146],
  [0.0536265, 0.0759088, 0.0980056], [0.0462475, 0.0654638, 0.0845201], [0.0546648, 0.0773785, 0.0999032],
  [0.0323545, 0.0639434, 0.0556605], [0.0323155, 0.0638663, 0.0555934], [0.0384756, 0.0760406, 0.0661907],
  [0.0383934, 0.0758783, 0.0660494], [0.0360272, 0.0712018, 0.0619787], [0.0338104, 0.0668206, 0.058165],
  [0.0363097, 0.0717601, 0.0624647], [0.0326715, 0.0645699, 0.0562059], [0.0325454, 0.0643206, 0.0559889],
  [0.0344953, 0.0681742, 0.0593433], [0.0323754, 0.0639845, 0.0556963], [0.0358597, 0.0708708, 0.0616906],
  [0.0654244, 0.0334221, 0.0873296], [0.0585181, 0.029894, 0.078111], [0.0707607, 0.0361481, 0.0944525],
  [0.0722501, 0.036909, 0.0964406], [0.0610699, 0.0311976, 0.0815172], [0.063372, 0.0323736, 0.08459],
  [0.0593811, 0.0303349, 0.0792629], [0.0700242, 0.0357719, 0.0934694], [0.0633633, 0.0323691, 0.0845783],
  [0.0660936, 0.033764, 0.0882229], [0.0673269, 0.034394, 0.0898691], [0.0724448, 0.0370084, 0.0967005],
  [0.0977988, 0.055633, 0.0369691], [0.1019215, 0.0579782, 0.0385275], [0.1035342, 0.0588956, 0.0391371],
  [0.1033503, 0.058791, 0.0390676], [0.108002, 0.0614371, 0.040826], [0.1021309, 0.0580973, 0.0386067],
  [0.116653, 0.0663582, 0.0440962], [0.1117749, 0.0635833, 0.0422522], [0.1050752, 0.0597722, 0.0397196],
  [0.1104112, 0.0628076, 0.0417367], [0.1078444, 0.0613474, 0.0407664], [0.1087459, 0.0618603, 0.0411072],
  [0.0639338, 0.0639338, 0.0556522], [0.0781665, 0.0781665, 0.0680413], [0.0653327, 0.0653327, 0.0568699],
  [0.0779475, 0.0779475, 0.0678506], [0.0768153, 0.0768153, 0.0668651], [0.0733886, 0.0733886, 0.0638823],
  [0.0706896, 0.0706896, 0.0615328], [0.0641391, 0.0641391, 0.0558309], [0.0646855, 0.0646855, 0.0563065],
  [0.065694, 0.065694, 0.0571844], [0.0648354, 0.0648354, 0.056437], [0.064145, 0.064145, 0.055836],
  [0.0752987, 0.052899, 0.0772145], [0.0844989, 0.0593624, 0.0866488], [0.0875437, 0.0615014, 0.0897711],
  [0.0791592, 0.0556111, 0.0811732], [0.073316, 0.0515061, 0.0751813], [0.0878975, 0.0617499, 0.0901338],
  [0.0862015, 0.0605585, 0.0883947], [0.0809753, 0.056887, 0.0830356], [0.0796707, 0.0559704, 0.0816978],
  [0.0867603, 0.060951, 0.0889677], [0.0833321, 0.0585427, 0.0854523], [0.0854884, 0.0600575, 0.0876635]
];
// ---------------------------------------------------------------------------

export function makeStyledDistrictArchitecture({ seed = 2049 } = {}) {
  const rng = randomSequence(Number(seed) + 61721);
  // Roof equipment (V-6) draws from a second, independent stream. `rng` is shared with every
  // builder and with the layout's own jitter, so adding or removing a tank on that stream would
  // move every window pattern, and -- before the height/paint freeze -- every building height too.
  // This stream is per-instance, so two makeStyledDistrictArchitecture() calls stay identical.
  const roofRng = randomSequence(Number(seed) + 90210);
  const group = new THREE.Group(); group.name = 'SurroundingDistrictArchitecture';
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const unitCylinder = new THREE.CylinderGeometry(.5, .5, 1, 16);
  const openCylinder = new THREE.CylinderGeometry(.5, .5, 1, 20, 1, true);
  const unitSphere = new THREE.SphereGeometry(.5, 8, 6);
  const sawGeometry = sawtoothGeometry();
  const archGeometry = new THREE.RingGeometry(.36, .5, 16, 1, 0, Math.PI);
  archGeometry.translate(0, -.25, 0); archGeometry.scale(1, 2, 1);
  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .27, roughness: .68 }),
    detail: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .49, roughness: .47 }),
    glass: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .64, roughness: .24 }),
    light: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
  };
  // V-2: a painted wall and a glass band want different grain sizes, so the three surfaces get
  // their own pair of uniform values while still sharing one compiled program.
  applySurfaceDetail(materials.shell, { scale: .17, strength: 1 });
  applySurfaceDetail(materials.detail, { scale: .30, strength: .9 });
  applySurfaceDetail(materials.glass, { scale: .46, strength: .5 });
  applyFacadeWallWash(materials.shell, { intensity: 32, source: 'district-main' });
  const atlas = makeSignAtlas();
  const signMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const buckets = new Map(), transform = new THREE.Object3D(), tint = new THREE.Color();
  const textVertices = [], textUVs = [], textColors = [];
  const buildings = [], lightSites = [];
  // Window rhythm bookkeeping. `windowBlink` collects one record per lit pane, keyed by the
  // bucket it landed in; the batch loop turns those into the instanced attribute. `pendingBlink`
  // is the hand-off from pane() to add(), which is the only place that knows the instance index.
  const windowBlink = new Map();
  const blinkUniforms = makeWindowBlinkUniforms();
  let pendingBlink = null;
  const point = new THREE.Vector3(), shapeBounds = new THREE.Box3();
  let activeBuilding = null, windowCount = 0, facadeSignCount = 0;
  const boost = (color, amount = 1) => new THREE.Color(color).multiplyScalar(amount);

  function track(geometry, matrix) {
    if (!activeBuilding) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    shapeBounds.copy(geometry.boundingBox).applyMatrix4(matrix);
    activeBuilding.actualBounds.union(shapeBounds);
  }
  function add(geometry, material, x, y, z, w, h, d, color = '#ffffff', ry = 0, rx = 0, rz = 0) {
    const key = `${geometry.id}:${material.id}`;
    if (!buckets.has(key)) buckets.set(key, { geometry, material, matrices: [], colors: [] });
    const bucket = buckets.get(key);
    transform.position.set(x, y, z); transform.rotation.set(rx, ry, rz); transform.scale.set(w, h, d); transform.updateMatrix();
    bucket.matrices.push(...transform.matrix.elements); tint.set(color); bucket.colors.push(tint.r, tint.g, tint.b);
    if (pendingBlink) {
      if (!windowBlink.has(key)) windowBlink.set(key, []);
      windowBlink.get(key).push({ index: bucket.matrices.length / 16 - 1, level: pendingBlink });
      pendingBlink = null;
    }
    track(geometry, transform.matrix);
  }
  const box = (material, x, y, z, w, h, d, color, ry = 0) => add(unitBox, material, x, y, z, w, h, d, color, ry);
  const shell = (b, x, base, z, w, h, d, paint = b.paint) => box(materials.shell, x, base + h / 2, z, w, h, d, paint);
  const solid = (b, x, y, z, w, h, d, color = '#536476') => box(materials.detail, x, y, z, w, h, d, color);
  const line = (b, x, y, z, w, h, d, color = b.style.primary, strength = 1.05) => box(materials.light, x, y, z, w, h, d, boost(color, strength));
  const cylinder = (b, x, y, z, w, h, d, color, light = false) => add(unitCylinder, light ? materials.light : materials.detail, x, y, z, w, h, d, color);

  function facePosition(b, face, along, y, w = b.sw, d = b.sd, offset = .018, cx = b.x, cz = b.z) {
    if (face === 0) return [cx + along, y, cz + d / 2 + offset, 0];
    if (face === 1) return [cx - along, y, cz - d / 2 - offset, Math.PI];
    if (face === 2) return [cx + w / 2 + offset, y, cz - along, Math.PI / 2];
    return [cx - w / 2 - offset, y, cz + along, -Math.PI / 2];
  }
  const detailPanes = [];
  function pane(b, face, along, y, w, h, color, options = {}) {
    const p = facePosition(b, face, along, y, options.sw ?? b.sw, options.sd ?? b.sd, options.offset ?? .019, options.cx ?? b.x, options.cz ?? b.z);
    add(unitPlane, options.dark ? materials.glass : materials.light, ...p.slice(0, 3), w, h, 1, color, p[3]);
    if (options.window !== false) { windowCount++; detailPanes.push({ index: b.ordinal, position: p, width: w, height: h }); }
    else if (b.style.buildingStyle === 'business' && w > .25 && h > 3) detailPanes.push({ index: b.ordinal, position: p, width: w, height: h });
  }
  function sign(b, face, along, y, w, h, text, color = b.style.primary, type = 'shop', options = {}) {
    const p = facePosition(b, face, along, y, options.sw ?? b.sw, options.sd ?? b.sd, options.offset ?? .055, options.cx ?? b.x, options.cz ?? b.z);
    // `subtitle` defaults to the sector's English name, which is also how the atlas pre-creates
    // its cells; LIVE/HOTEL pass one of the baked variant strings instead.
    const uv = atlas.cell(text, type, options.subtitle ?? b.style.english);
    transform.position.set(...p.slice(0, 3)); transform.rotation.set(0, p[3], options.vertical ? Math.PI / 2 : 0); transform.scale.set(options.vertical ? h : w, options.vertical ? w : h, 1); transform.updateMatrix();
    const corners = [[-.5,-.5,uv.u0,uv.v0],[.5,-.5,uv.u1,uv.v0],[.5,.5,uv.u1,uv.v1],[-.5,.5,uv.u0,uv.v1]];
    tint.set(color).multiplyScalar(options.strength ?? 1.45);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = corners[i]; point.set(c[0], c[1], 0).applyMatrix4(transform.matrix);
      textVertices.push(point.x, point.y, point.z); textUVs.push(c[2], c[3]); textColors.push(tint.r, tint.g, tint.b);
    }
    track(unitPlane, transform.matrix); facadeSignCount++;
  }
  function windows(b, base, top, { pitch = FLOOR_HEIGHT, height = .6, spacing = BAY_WIDTH, chance = .55, widthRatio = .62, color = b.style.primary, sw = b.sw, sd = b.sd, cx = b.x, cz = b.z, faces = [0, 1, 2, 3] } = {}) {
    // Rhythm inputs, computed once per call. `litSpan` normalises the facade so the sweep
    // crosses a two-floor warehouse and a thirty-floor tower at the same rate.
    const litSpan = Math.max(pitch, top - base);
    for (const face of faces) {
      // Columns come from the span alone -- never from the caller's taste -- so a bay is BAY_WIDTH
      // wide on every building and step * widthRatio is the same pane on all of them.
      const span = face < 2 ? sw : sd, columns = Math.max(2, Math.round(span / spacing));
      const step = (span - .30) / columns;
      const kind = blinkKindFor(b.ordinal, face), phase = blinkPhaseFor(b.ordinal, face);
      for (let y = base + pitch * .5; y + height * .5 < top; y += pitch) {
        // V-2: one dark reveal board per face per floor, set .011 *behind* the .019 the panes sit
        // at. The gap is what makes each window read as cut into a glazing band instead of pasted
        // on the wall, and it costs one plane -- two triangles -- per row. The board has to be the
        // one that steps back: put it in front (the obvious reading of "recess") and it covers the
        // panes it is meant to frame. Building every pane its own four-sided frame instead would
        // be 48 triangles per window, about 308,000 across the district, and would break the
        // 800,000-triangle ceiling on its own.
        pane(b, face, 0, y, span - .30, height * 1.6, '#101c26', { sw, sd, cx, cz, dark: true, window: false, offset: .008 });
        const litFloor = rng() < chance;
        const floorNorm = Math.min(1, Math.max(0, (y - base) / litSpan));
        for (let col = 0; col < columns; col++) {
          const lit = litFloor ? rng() > .14 : rng() > .86;
          // Only the panes that are lit take part in the rhythm: the dark ones are on the glass
          // material, and brightening a lit pane is a colour scale while lighting an unlit one
          // would mean driving a lit material past its own shading -- a different, riskier change.
          if (lit) pendingBlink = [kind, phase, floorNorm, columns > 1 ? col / (columns - 1) : 0];
          pane(b, face, (col - (columns - 1) / 2) * step, y, step * widthRatio, height, lit ? boost(rng() > .22 ? color : b.style.secondary, .55 + rng() * .46) : '#0d2331', { sw, sd, cx, cz, dark: !lit });
          pendingBlink = null;
        }
      }
    }
  }
  function cornice(b, y, w = b.sw, d = b.sd, color = b.style.secondary, strength = .8, cx = b.x, cz = b.z) {
    line(b, cx, y, cz + d / 2 + .022, w, .095, .048, color, strength);
    line(b, cx, y, cz - d / 2 - .022, w, .095, .048, color, strength);
    line(b, cx + w / 2 + .022, y, cz, .048, .095, d, color, strength);
    line(b, cx - w / 2 - .022, y, cz, .048, .095, d, color, strength);
  }
  function storefront(b, { y = 2.05, height = .68, color = b.style.primary, text = b.word } = {}) {
    const face = b.inward, span = b.sd;
    pane(b, face, 0, 1.05, span * .78, 1.25, boost(b.style.secondary, .78));
    for (const t of [-1, 0, 1]) pane(b, face, t * span * .31, 1.07, .055, 1.40, '#16232c', { window: false, offset: .04, dark: true });
    sign(b, face, 0, y, span * .92, height, text, color, 'shop', { offset: .09 });
    lightSites.push({ x: b.x - b.side * (b.width / 2 - .05), y: .20, z: b.z, color, width: 2.8, height: Math.min(3.6, b.depth), sector: b.sector });
  }
  function anchorSign(b, y, { h = 1.45, color = b.style.primary } = {}) {
    if (!b.anchor) return;
    // Lettering clears the pipes and balcony rails while retaining a .02-unit
    // inset from the original footprint, including the shallow cross-street lots.
    const frontOffset = (b.depth - b.sd) / 2 - .02;
    const sideOffset = (b.width - b.sw) / 2 - .02;
    // `signText` is resolved once in the build loop and published in userData, so the geometry QA
    // can identify these quads from the atlas cell instead of hardcoding the canonical name.
    const text = b.signText ?? b.style.sign;
    for (const face of [0, 1]) sign(b, face, 0, y, b.sw * .90, h, text, color, 'shop', { offset: frontOffset, strength: 1.62 });
    sign(b, b.outward, 0, y, b.sd * .93, Math.min(h, 1.35), text, color, 'shop', { offset: sideOffset, strength: 1.62 });
  }

  function harbour(b) {
    const roof = b.height - 1.32, bodyW = b.sw - .38, bodyX = b.x - b.side * .15;
    shell(b, bodyX, .15, b.z, bodyW, roof - .15, b.sd);
    for (let ridge = 0; ridge < 3; ridge++) {
      const rw = bodyW / 3;
      add(sawGeometry, materials.detail, bodyX - bodyW / 2 + (ridge + .5) * rw, roof + .52, b.z, rw - .05, 1.04, b.sd, '#69747f');
      pane(b, 0, -bodyW / 2 + (ridge + 1) * rw - .18, roof + .32, .18, .42, boost(b.style.primary, 1.45), { sw: bodyW, cx: bodyX });
    }
    windows(b, 3.1, roof - .8, { height: .43, chance: .32, widthRatio: .8, sw: bodyW, cx: bodyX });
    for (const face of [0, 1]) {
      pane(b, face, 0, 1.60, bodyW * .64, 2.52, boost(b.style.secondary, .68), { sw: bodyW, cx: bodyX });
      for (let slat = 0; slat < 7; slat++) pane(b, face, 0, .58 + slat * .32, bodyW * .64, .045, '#39434a', { sw: bodyW, cx: bodyX, window: false, dark: true, offset: .025 });
      sign(b, face, bodyW * .21, roof * .73, bodyW * .42, Math.min(2.6, roof * .24), String(b.ordinal % SIGN_NUMBERS.length + 1).padStart(2, '0'), b.style.primary, 'number', { sw: bodyW, cx: bodyX });
      line(b, bodyX, 3.0, b.z + (face === 0 ? 1 : -1) * (b.sd / 2 + .025), bodyW * .92, .16, .055, b.style.secondary, .9);
    }
    // The cargo lift occupies the reserved outer edge, leaving the inner lane intact.
    const liftX = b.x + b.side * (b.width / 2 - .24), liftD = Math.min(1.5, b.sd * .58);
    for (const end of [-1, 1]) solid(b, liftX, roof * .43, b.z + end * liftD / 2, .105, roof * .81, .10, '#bc8d55');
    for (const level of [2.1, roof * .50, roof * .82]) {
      solid(b, liftX - b.side * .09, level, b.z, .48, .14, liftD + .12, '#8f9aa0');
      line(b, liftX + b.side * .07, level + .10, b.z, .10, .07, liftD, b.style.secondary, .9);
    }
    sign(b, b.inward, 0, Math.min(5.5, roof * .42), b.sd * .91, 1.03, b.word, b.style.primary, 'shop', { sw: bodyW, cx: bodyX });
    anchorSign(b, roof - 1.12, { h: 1.4 });
    storefront(b, { text: b.word, color: b.style.secondary });
    b.features = ['sawtooth-roof', 'cargo-lift', 'warehouse-number', 'lit-loading-door', 'strip-windows'];
  }

  function business(b) {
    const base = 2.50, levels = [base, b.height * .57, b.height * .83, b.height - .42];
    shell(b, b.x, .15, b.z, b.sw, base - .15, b.sd);
    for (let tier = 0; tier < 3; tier++) {
      const w = b.sw * [1, .78, .55][tier], d = b.sd * [1, .81, .63][tier];
      const lo = levels[tier], hi = levels[tier + 1];
      shell(b, b.x, lo, b.z, w, hi - lo, d);
      for (const face of [0, 1, 2, 3]) {
        // F4: the three tiers cut their own columns rather than going through windows(), so they
        // have to be brought onto BAY_WIDTH explicitly or the glass bands stay 3x finer grained
        // than every neighbouring facade.
        const span = face < 2 ? w : d, columns = Math.max(2, Math.round(span / BAY_WIDTH)), step = (span - .30) / columns;
        for (let col = 0; col < columns; col++) {
          const along = (col - (columns - 1) / 2) * step;
          pane(b, face, along, (lo + hi) / 2, step * .72, hi - lo - .12, '#16394d', { sw: w, sd: d, dark: true, window: false });
          if (col % 3 === (b.ordinal + tier) % 3) pane(b, face, along, (lo + hi) / 2, .075, hi - lo - .22, boost(b.style.primary, .86), { sw: w, sd: d, offset: .028, window: false });
        }
        for (let y = lo + .66; y + .25 < hi; y += 1.06) {
          if (rng() > .48) continue;
          const length = span * (.34 + rng() * .31), along = (rng() - .5) * (span - length) * .6;
          pane(b, face, along, y, length, .29, boost(rng() > .25 ? b.style.primary : b.style.secondary, .72 + rng() * .3), { sw: w, sd: d, offset: .030 });
        }
      }
      cornice(b, hi - .08, w, d, b.style.primary, tier === 2 ? 1.3 : .74);
    }
    for (const face of [0, 1]) pane(b, face, 0, 1.16, b.sw * .91, 1.8, boost(b.style.secondary, .82));
    solid(b, b.x, b.height - .19, b.z, b.sw * .45, .34, b.sd * .49, '#526d7b');
    line(b, b.x, b.height - .015, b.z, b.sw * .43, .025, b.sd * .46, b.style.secondary, 1.15);
    storefront(b, { height: .80 });
    anchorSign(b, levels[1] - 1.12, { color: b.style.secondary });
    b.features = ['slim-three-tier-tower', 'vertical-glass-bands', 'grouped-lit-floors', 'bright-lobby', 'cyan-crown'];
  }

  function lounge(b) {
    const heights = [b.height * .49, b.height * .27, b.height * .16], widths = [1, .75, .46], depths = [1, .74, .50];
    let base = .15;
    for (let step = 0; step < 3; step++) {
      const w = b.sw * widths[step], d = b.sd * depths[step], h = heights[step];
      shell(b, b.x, base, b.z, w, h, d);
      for (const face of [0, 1, 2, 3]) {
        const span = face < 2 ? w : d;
        pane(b, face, 0, base + h * .57, span * .83, h * .50, boost(b.style.secondary, .72), { sw: w, sd: d });
        // F4: each tier is one panorama, so its divisions follow the same bay width as the window
        // grids. A ten-unit face lands on three mullions almost exactly where the old hardcoded
        // [-.27, 0, .27] sat; wider tiers simply get more of them.
        const bays = Math.max(2, Math.round(span / BAY_WIDTH));
        for (let bay = 1; bay < bays; bay++) pane(b, face, span * (bay / bays - .5), base + h * .57, .07, h * .55, '#354855', { sw: w, sd: d, offset: .027, dark: true, window: false });
      }
      cornice(b, base + h, w, d, b.style.primary, 1.08);
      if (step < 2) for (const side of [-1, 1]) {
        solid(b, b.x + side * w * .42, base + h + .22, b.z, .12, .40, d * .78, '#889ca2');
        line(b, b.x + side * w * .42, base + h + .42, b.z, .09, .04, d * .78, b.style.primary, .83);
      }
      base += h;
    }
    for (const face of [0, 1]) {
      const z = b.z + (face === 0 ? 1 : -1) * (b.sd / 2 + .04);
      solid(b, b.x, 2.7, z, b.sw * .91, .30, .10, '#b0a084');
      line(b, b.x, 2.52, z, b.sw * .88, .055, .08, b.style.secondary, 1.05);
      for (const col of [-1, 0, 1]) solid(b, b.x + col * b.sw * .32, 1.34, z, .16, 2.58, .10, '#788d98');
    }
    storefront(b, { y: 2.10, color: b.style.secondary });
    anchorSign(b, heights[0] - .70, { h: 1.04 });
    b.features = ['three-stepped-lounge', 'terrace-rails', 'panoramic-glass', 'lit-portico'];
  }

  function workshop(b) {
    const roof = b.height - 1.10, bodyW = b.sw - .35;
    shell(b, b.x - b.side * .15, .15, b.z, bodyW, roof - .15, b.sd);
    windows(b, 2.7, roof - .4, { height: .90, chance: .45, widthRatio: .74, sw: bodyW, cx: b.x - b.side * .15 });
    for (const face of [0, 1]) {
      pane(b, face, 0, 1.35, bodyW * .65, 1.94, boost(b.style.secondary, .64), { sw: bodyW, cx: b.x - b.side * .15 });
      line(b, b.x, 2.42, b.z + (face === 0 ? 1 : -1) * (b.sd / 2 + .03), bodyW * .9, .13, .08, b.style.primary, .92);
    }
    const pipeX = b.x + b.side * (b.width / 2 - .23), pipeZ = b.z - b.sd * .23;
    cylinder(b, pipeX, roof * .50, pipeZ, .29, roof * .96, .29, '#b5844b');
    cylinder(b, pipeX, roof * .50, b.z + b.sd * .24, .22, roof * .96, .22, '#559b80');
    for (let y = 1.2; y < roof; y += 2.1) {
      cylinder(b, pipeX, y, pipeZ, .37, .10, .37, '#b9c1ad');
      line(b, pipeX, y + .10, pipeZ, .13, .08, .20, b.style.secondary, .86);
    }
    for (const y of [roof * .36, roof * .67]) {
      solid(b, pipeX - b.side * .1, y, b.z, .47, .14, b.sd * .74, '#536866');
      line(b, pipeX + b.side * .03, y + .47, b.z, .09, .07, b.sd * .72, b.style.primary, 1.06);
      for (const sz of [-1, 1]) solid(b, pipeX, y + .26, b.z + sz * b.sd * .34, .07, .48, .07, '#90b2a0');
    }
    // V-6: this used to be an identical pair of drums standing flat on the roof. Each one now
    // stands on a visible plinth, and the drum pays for that plinth out of its own height -- its
    // top edge stays at roof + .92 and the lid stays at roof + .95, so nothing is lifted above the
    // old roofline (R3) and only the silhouette below it changes.
    const tankCount = 2 + (roofRng() > .55 ? 1 : 0);
    for (let tank = 0; tank < tankCount; tank++) {
      const s = .90 + roofRng() * .20, plinth = .18 + roofRng() * .08, drum = .88 - plinth;
      const x = b.x + (tank - (tankCount - 1) / 2) * bodyW * .30;
      box(materials.detail, x, roof + .05 + plinth / 2, b.z, .86 * s, plinth, Math.min(.86 * s, b.sd * .48));
      cylinder(b, x, roof + .92 - drum / 2, b.z, .74 * s, drum, Math.min(.74 * s, b.sd * .4), '#8f8170');
      cylinder(b, x, roof + .95, b.z, .78 * s, .08, Math.min(.78 * s, b.sd * .44), boost(b.style.secondary, .73), true);
    }
    storefront(b, { color: b.style.secondary });
    anchorSign(b, roof - 1.12, { h: 1.30 });
    b.features = ['copper-pipes', 'cylindrical-roof-tanks', 'repair-platforms', 'large-workshop-windows', 'lit-roller-door'];
  }

  function theatre(b) {
    const baseTop = b.height * .60, crown = b.height - 1.60;
    shell(b, b.x, .15, b.z, b.sw, baseTop - .15, b.sd);
    shell(b, b.x, baseTop, b.z, b.sw * .77, crown - baseTop, b.sd * .79);
    solid(b, b.x, crown + .13, b.z, b.sw * .80, .26, b.sd * .82, '#794873');
    for (const face of [0, 1]) {
      const z = b.z + (face === 0 ? 1 : -1) * (b.sd / 2 + .04);
      line(b, b.x, 2.45, z, b.sw * .96, .65, .15, b.style.primary, .93);
      for (const strip of [-1, 1]) line(b, b.x + strip * b.sw * .42, baseTop * .60, z, .18, baseTop * .57, .065, b.style.secondary, 1.10);
      sign(b, face, 0, baseTop * .59, b.sw * .70, baseTop * .52, b.word, b.style.primary, 'poster', { offset: .077, strength: 1.55 });
      sign(b, face, 0, baseTop - .85, b.sw * .92, 1.18, b.style.sign, b.style.primary, 'shop', { offset: .080 });
    }
    for (const face of [b.inward, b.outward]) {
      sign(b, face, 0, baseTop * .57, b.sd * .81, baseTop * .48, b.word, b.style.secondary, 'poster', { offset: .074, strength: 1.45 });
      sign(b, face, 0, crown + .93, b.sd * .73, 1.02, 'LIVE', b.style.primary, 'vertical', { sw: b.sw * .77, sd: b.sd * .79, subtitle: SIGN_LIVE_SUBTITLES[b.ordinal % SIGN_LIVE_SUBTITLES.length] });
    }
    windows(b, baseTop + .55, crown - .35, { height: .24, widthRatio: .86, chance: .36, sw: b.sw * .77, sd: b.sd * .79, color: b.style.secondary });
    cornice(b, baseTop, b.sw, b.sd, b.style.primary, 1.08);
    cornice(b, crown + .29, b.sw * .79, b.sd * .81, b.style.secondary, 1.16);
    // Indexed +2 so this front board never carries the same subtitle as the two side boards that
    // meet it at the corner -- that collision is what made v06 read as "LIVE twice in one board".
    sign(b, 0, 0, crown + .91, b.sw * .73, 1.16, 'LIVE', b.style.primary, 'vertical', { sw: b.sw * .77, sd: b.sd * .79, strength: 1.6, subtitle: SIGN_LIVE_SUBTITLES[(b.ordinal + 2) % SIGN_LIVE_SUBTITLES.length] });
    storefront(b, { y: 1.80, color: b.style.secondary, height: .65 });
    b.features = ['stepped-theatre', 'giant-lit-posters', 'wide-neon-box-canopy', 'rooftop-LIVE', 'ribbon-windows'];
  }

  function market(b) {
    const roof = b.height - .82, arcade = 2.45;
    shell(b, b.x, arcade, b.z, b.sw, roof - arcade, b.sd);
    shell(b, b.x, .15, b.z, b.sw * .78, arcade - .15, b.sd * .71, '#3c2d26');
    windows(b, arcade + .55, roof - .3, { height: .65, chance: .58, widthRatio: .58, color: b.style.secondary });
    for (const face of [0, 1]) {
      const z = b.z + (face === 0 ? 1 : -1) * (b.sd / 2 + .034), bays = 3, pitch = b.sw / bays;
      for (let bay = 0; bay < bays; bay++) {
        const x = b.x + (bay - 1) * pitch;
        pane(b, face, x - b.x, 1.12, pitch * .74, 1.53, boost(b.style.secondary, .62), { offset: -.20 });
        add(archGeometry, materials.detail, x, 1.98, z, pitch * .86, .75, 1, '#c58a56', face === 0 ? 0 : Math.PI);
        solid(b, x - pitch * .43, .83, z, .13, 1.66, .10, '#9e7652');
        solid(b, x + pitch * .43, .83, z, .13, 1.66, .10, '#9e7652');
        line(b, x, 2.40, z, pitch * .93, .28, .15, bay % 2 ? b.style.secondary : b.style.primary, .85);
        add(unitSphere, materials.light, x, 1.87, z + (face === 0 ? 1 : -1) * .04, .25, .34, .16, boost(b.style.primary, 1.32));
      }
      sign(b, face, 0, roof - .76, b.sw * .91, 1.14, b.anchor ? (b.signText ?? b.style.sign) : b.word, b.style.secondary, 'shop', { offset: .076 });
      for (let i = 0; i < 5; i++) {
        const x = b.x + (i - 2) * b.sw * .19;
        line(b, x, roof + .17, z, .10, .03, .06, b.style.secondary, .8);
        add(unitSphere, materials.light, x, roof + .04, z, .22, .26, .15, boost(b.style.primary, 1.4));
      }
    }
    solid(b, b.x, roof + .21, b.z, b.sw * .53, .42, b.sd * .56, '#6e5542');
    // V-6: two identical flues became two or three, on a plinth, staggered between the back and
    // front of the roof. The cap stays at roof + .79 (top edge roof + .81, the old maximum) and the
    // flue shortens by exactly the plinth height, so the roofline is untouched (R3).
    const chimneyCount = 2 + (roofRng() > .6 ? 1 : 0);
    for (let chimney = 0; chimney < chimneyCount; chimney++) {
      const s = .90 + roofRng() * .20, plinth = .10 + roofRng() * .06, flue = .42 - plinth;
      const x = b.x + (chimney - (chimneyCount - 1) / 2) * b.sw * .19;
      const z = b.z + (chimney % 2 ? b.sd * .33 : -b.sd * .11);
      box(materials.detail, x, roof + .35 + plinth / 2, z, .34 * s, plinth, .34 * s);
      cylinder(b, x, roof + .77 - flue / 2, z, .25 * s, flue, .25 * s, '#929487');
      solid(b, x, roof + .79, z, .35 * s, .04, .35 * s, '#bfa576');
    }
    storefront(b, { color: b.style.primary });
    b.features = ['low-arcade', 'arched-shop-bays', 'striped-awnings', 'red-lanterns', 'rooftop-kitchen'];
  }

  function residential(b) {
    const roof = b.height - .65, bodyW = b.sw - .25, bodyD = b.sd - .24;
    shell(b, b.x, .15, b.z, bodyW, roof - .15, bodyD, b.paint);
    // F4: this chain is the source of both the window rows and the balcony rails below, so it is
    // derived from FLOOR_HEIGHT instead of the old hardcoded 1.42 -- that keeps the two in step
    // while making the south sector sit on the same floor grid as everyone else.
    const floors = Math.max(4, Math.round((roof - 2.1) / FLOOR_HEIGHT)), pitch = (roof - 2.1) / floors;
    windows(b, 2.15, roof - .15, { pitch, height: pitch * .48, chance: .60, widthRatio: .65, color: b.style.primary, sw: bodyW, sd: bodyD });
    for (let floor = 0; floor < floors; floor++) {
      const y = 2.20 + floor * pitch;
      for (const face of [0, 1]) {
        const z = b.z + (face === 0 ? 1 : -1) * (bodyD / 2 + .09);
        solid(b, b.x, y, z, b.sw * .95, .12, .27, '#8a8f85');
        solid(b, b.x, y + .37, z + (face === 0 ? .09 : -.09), b.sw * .95, .08, .055, '#b2ac89');
        // F7/V-15: line()'s eighth argument is a colour, so `line(..., .95 : .42)` fed .95 into
        // `new THREE.Color(.95)` (a near-white grey) and left strength at its 1.05 default -- and
        // because it only fired on one floor in three, the ribbon read as a dashed line. Every
        // floor is drawn now and only the brightness varies.
        const ribbonStrength = (floor % 3 === b.ordinal % 3) ? .95 : .42;
        line(b, b.x, y + .07, z, b.sw * .91, .045, .28, b.style.secondary, ribbonStrength);
        for (const end of [-.38, -.13, .13, .38]) solid(b, b.x + end * b.sw, y + .20, z, .045, .40, .035, '#939c8d');
      }
      const bx = b.x - b.side * (bodyW / 2 + .10);
      solid(b, bx, y, b.z, .31, .11, b.sd * .85, '#90958d');
      line(b, bx - b.side * .08, y + .37, b.z, .04, .05, b.sd * .86, b.style.primary, .60);
      if (floor % 2 === 0) solid(b, bx, y + .31, b.z + b.sd * .24, .22, .43, .35, '#a4a599');
    }
    solid(b, b.x, roof + .20, b.z, bodyW * .61, .40, bodyD * .48, '#818575');
    line(b, b.x, roof + .41, b.z + bodyD * .25, bodyW * .65, .05, .04, b.style.secondary, .82);
    // Was a hardcoded two-word pair, which left the whole south `shops` roster unreferenced (the
    // atlas even had an orphan cell for it). Reading b.word makes the sector roster real.
    storefront(b, { text: b.word, color: b.style.secondary, height: .78 });
    for (const face of [0, 1]) sign(b, face, 0, 1.95, bodyW * .85, .70, b.word, b.style.secondary, 'shop', { sw: bodyW, sd: bodyD, offset: .10 });
    anchorSign(b, roof - 1.02, { h: 1.15 });
    b.features = ['external-corridors', 'balcony-rails', 'grouped-warm-windows', 'convenience-store', 'night-canteen'];
  }

  function hotel(b) {
    const roof = b.height - 1.16, bodyW = b.sw * .75, bodyD = b.sd * .73;
    shell(b, b.x, .15, b.z, bodyW, roof - .15, bodyD, b.paint);
    windows(b, 2.1, roof - .25, { height: .75, chance: .57, widthRatio: .63, sw: bodyW, sd: bodyD, color: b.style.secondary });
    // These balcony rings step in the same rhythm as the windows above, otherwise the ledges cut
    // across the panes at a third of a floor and the facade reads as two unrelated grids.
    for (let y = 2.05; y < roof; y += FLOOR_HEIGHT) {
      cylinder(b, b.x, y, b.z, b.width - .18, .15, b.depth - .16, '#b194aa');
      add(openCylinder, materials.detail, b.x, y + .26, b.z, b.width - .23, .37, b.depth - .20, '#846882');
      add(openCylinder, materials.light, b.x, y + .46, b.z, b.width - .24, .038, b.depth - .21, boost(y % 3 > 1.5 ? b.style.primary : b.style.secondary, 1.18));
    }
    cylinder(b, b.x, roof + .04, b.z, b.sw * .97, .15, b.sd * .98, '#899e94');
    // V-6: the "floating ball" was a sphere balanced straight on the parapet box, seen at v06 as
    // three green orbs with no support. It now sits in a short cylindrical tree pit with a lit rim,
    // and the sphere gives up exactly the height the pit takes so its top edge stays at roof + 1.02,
    // the old maximum (R3). openCylinder is used for the rim because line() is a flat box, which
    // would read as a lid rather than a collar.
    for (const garden of [-1, 1]) {
      const x = b.x + garden * bodyW * .31, s = .90 + roofRng() * .20, pit = .16 + roofRng() * .08;
      const potTop = roof + .42 + pit, crown = roof + 1.02, shrub = crown - potTop - .03;
      solid(b, x, roof + .25, b.z, .57 * s, .34, Math.min(.82, bodyD * .66) * s, '#49655b');
      cylinder(b, x, roof + .42 + pit / 2, b.z, .62 * s, pit, Math.min(.66, bodyD * .5) * s, '#3f5a51');
      add(openCylinder, materials.light, x, potTop + .02, b.z, .66 * s, .05, Math.min(.70, bodyD * .53) * s, boost(b.style.secondary, 1.10));
      add(unitSphere, materials.detail, x, crown - shrub / 2, b.z, .79 * s, shrub, Math.min(.81, bodyD * .70) * s, '#4d926f');
    }
    for (const face of [0, 1]) {
      sign(b, face, 0, 1.85, bodyW * .91, .80, b.word, b.style.primary, 'shop', { sw: bodyW, sd: bodyD });
      sign(b, face, -bodyW * .39, Math.min(roof - 1.55, 5.5), .62, 3.6, 'HOTEL', b.style.primary, 'vertical', { sw: bodyW, sd: b.depth - .045, offset: 0, vertical: true, strength: 1.30, subtitle: SIGN_HOTEL_SUBTITLES[b.ordinal % SIGN_HOTEL_SUBTITLES.length] });
    }
    line(b, b.x, roof + .17, b.z, bodyW * .78, .04, .045, b.style.secondary, .9);
    storefront(b, { color: b.style.secondary });
    anchorSign(b, roof - .96, { h: 1.11 });
    b.features = ['rounded-balconies', 'rose-mint-terrace-lights', 'rooftop-garden', 'vertical-HOTEL', 'warm-hotel-lobby'];
  }

  const builders = { harbour, business, lounge, workshop, theatre, market, residential, hotel };
  // Per-sector running index. A global `index % shops.length` would misalign because the sectors
  // do not all hold the same number of lots (northeast has six where the others have twelve).
  const sectorCounters = new Map();
  for (const [index, footprint] of DISTRICT_LAYOUT.entries()) {
    const style = OUTER_DISTRICT_STYLES.find(s => s.id === footprint.sector);
    const side = Math.sign(footprint.x - style.cx), anchor = footprint.z - style.cz === 16;
    const sectorOrdinal = sectorCounters.get(footprint.sector) ?? 0;
    sectorCounters.set(footprint.sector, sectorOrdinal + 1);
    // These two draws are kept even though their results are overwritten below. The stream is
    // shared with every builder, so removing them would shift every window pattern in the
    // district; consuming and discarding keeps this file's output identical to the pre-freeze
    // baseline while making the layout immune to later builder changes.
    const value = anchor ? .80 + rng() * .18 : .10 + rng() * .77;
    const paintTint = .89 + rng() * .23;
    const height = FROZEN_HEIGHTS[index]
      ?? Math.round((style.minHeight + value * (style.maxHeight - style.minHeight)) * 20) / 20;
    const b = {
      ...footprint, height, side, anchor, style, ordinal: index, sectorOrdinal,
      sw: footprint.width - .72, sd: footprint.depth - .32,
      inward: side > 0 ? 3 : 2, outward: side > 0 ? 2 : 3,
      paint: FROZEN_PAINTS[index] ? new THREE.Color().setRGB(...FROZEN_PAINTS[index]) : boost(style.paint, paintTint),
      word: style.shops[sectorOrdinal % style.shops.length],
      // The two anchors sit at cz +/- 16, so slotting by side of centre gives each its own
      // variant and keeps the assignment stable against layout reordering.
      signText: anchor ? style.signs[footprint.z > style.cz ? 0 : 1] : null,
      actualBounds: new THREE.Box3(),
    };
    activeBuilding = b;
    // This plinth is smaller than the original conservative footprint in both axes.
    solid(b, b.x, .065, b.z, b.width - .06, .13, b.depth - .06, '#33424c');
    builders[style.buildingStyle](b);
    const actualBounds = { min: b.actualBounds.min.toArray(), max: b.actualBounds.max.toArray() };
    // `paint` / `paintRGB` / `ordinal` are published so the visual baseline can be dumped and later
    // frozen into FROZEN_HEIGHTS / FROZEN_PAINTS without re-deriving them from the shared stream.
    // `paintRGB` carries the working-space floats, which is what FROZEN_PAINTS needs to round-trip
    // exactly (`getHexString()` would quantise to 8 bits).
    buildings.push({ x: footprint.x, z: footprint.z, width: footprint.width, depth: footprint.depth, height, sector: footprint.sector, styleId: style.buildingStyle, anchor, features: b.features, actualBounds, ordinal: index, sectorOrdinal, word: b.word, signText: b.signText, paint: b.paint.getHexString(), paintRGB: b.paint.toArray().map(v => +v.toFixed(7)) });
  }
  activeBuilding = null;
  // The rhythm rides on the shared `light` material, which is what the lit panes are batched
  // under. Injecting it once here rather than per batch means the district pays one extra
  // shader program and nothing else.
  applyWindowBlink(materials.light, blinkUniforms, 'district-lit-window-blink');
  let instanceCount = 0, windowBlinkCount = 0;
  for (const [index, [key, bucket]] of [...buckets.entries()].entries()) {
    const count = bucket.matrices.length / 16;
    // Only the bucket that actually holds lit panes gets the attribute. Every other batch keeps
    // the shared unit geometry untouched, so batch order, instance counts, bounding volumes and
    // the geometry count are all exactly what they were before this feature.
    const rhythm = windowBlink.get(key);
    let geometry = bucket.geometry;
    if (rhythm) {
      geometry = new THREE.InstancedBufferGeometry();
      geometry.index = bucket.geometry.index;
      for (const name of ['position', 'normal', 'uv']) geometry.setAttribute(name, bucket.geometry.getAttribute(name));
      const data = new Float32Array(count * 4);
      for (const record of rhythm) data.set(record.level, record.index * 4);
      geometry.setAttribute(WINDOW_BLINK_ATTRIBUTE, new THREE.InstancedBufferAttribute(data, 4));
      geometry.instanceCount = count;
      windowBlinkCount += rhythm.length;
    }
    const batch = new THREE.InstancedMesh(geometry, bucket.material, count);
    batch.name = `DistrictStyleBatch-${index + 1}`;
    batch.instanceMatrix.array.set(bucket.matrices); batch.instanceMatrix.needsUpdate = true;
    batch.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bucket.colors), 3);
    batch.computeBoundingBox(); batch.computeBoundingSphere(); group.add(batch); instanceCount += count;
  }
  const signGeometry = new THREE.BufferGeometry();
  signGeometry.setAttribute('position', new THREE.Float32BufferAttribute(textVertices, 3));
  signGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(textUVs, 2));
  signGeometry.setAttribute('color', new THREE.Float32BufferAttribute(textColors, 3));
  signGeometry.computeVertexNormals(); signGeometry.computeBoundingBox(); signGeometry.computeBoundingSphere();
  const signMesh = new THREE.Mesh(signGeometry, signMaterial); signMesh.name = 'DistrictSharedSignAtlas'; group.add(signMesh);
  const bounds = new THREE.Box3(); for (const b of buildings) bounds.union(new THREE.Box3(new THREE.Vector3(...b.actualBounds.min), new THREE.Vector3(...b.actualBounds.max)));
  group.userData = {
    seed, buildings, sectorCount: 8, buildingCount: buildings.length,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    batchCount: group.children.length, instanceCount, windowCount, facadeSignCount, signAtlasCount: 1,
    windowBlinkCount, windowBlinkUniforms: blinkUniforms,
    update(seconds) { blinkUniforms.uBlinkTime.value = Number.isFinite(seconds) ? seconds : 0; },
    signAtlas: atlas.layout,
    lightSites,
    sectors: OUTER_DISTRICT_STYLES.map(({ id, name, cx, cz, primary, secondary, buildingStyle }) => ({ id, name, cx, cz, primary, secondary, styleId: buildingStyle })),
  };
  addArchitectureDetails(group, buildings, detailPanes);
  return group;
}
