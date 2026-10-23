import * as THREE from 'three';
import { OUTER_DISTRICT_STYLES } from './district-styles.js';
import { DISTRICT_LAYOUT } from './district-layout.js';

const FLOOR = .13;
const INK = '#23323d';
const METAL = '#698088';
const CREAM = '#b9c5be';

function seeded(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function serialBounds(box) {
  return {
    min: box.min.toArray(), max: box.max.toArray(),
    minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y,
    minZ: box.min.z, maxZ: box.max.z,
  };
}

function rectangleGap(a, b) {
  return Math.hypot(
    Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
    Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ),
  );
}

// These are static sidewalk objects: a cart here is scenery, never another traffic actor.
// Narrow outer-edge pockets preserve both the building envelope and the pedestrian lane.
export function makeDistrictAccents({ seed = 2049 } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictAccents';
  const rng = seeded(Number(seed) + 2817);
  const solid = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .34, roughness: .57 });
  const luminous = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(.5, .5, 1, 10);
  const sphereGeometry = new THREE.SphereGeometry(.5, 10, 6);
  const batches = {
    solidBox: { geometry: boxGeometry, material: solid, items: [] },
    lightBox: { geometry: boxGeometry, material: luminous, items: [] },
    solidCylinder: { geometry: cylinderGeometry, material: solid, items: [] },
    lightCylinder: { geometry: cylinderGeometry, material: luminous, items: [] },
    solidSphere: { geometry: sphereGeometry, material: solid, items: [] },
  };
  [boxGeometry, cylinderGeometry, sphereGeometry].forEach(geometry => geometry.computeBoundingBox());
  const features = [], totalBounds = new THREE.Box3();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const pieceBounds = new THREE.Box3();
  let current;

  function part(batch, color, x, y, z, width, height, depth, quaternion) {
    position.set(current.x + x * current.side, FLOOR + y, current.z + z);
    scale.set(width, height, depth);
    matrix.compose(position, quaternion || rotation.identity(), scale);
    const target = batches[batch];
    target.items.push({ matrix: matrix.clone(), color });
    pieceBounds.copy(target.geometry.boundingBox).applyMatrix4(matrix);
    current.bounds.union(pieceBounds);
  }
  const box = (color, x, y, z, w, h, d) => part('solidBox', color, x, y, z, w, h, d);
  const light = (color, x, y, z, w, h, d) => part('lightBox', color, x, y, z, w, h, d);
  const cylinder = (color, x, y, z, w, h, d = w) => part('solidCylinder', color, x, y, z, w, h, d);
  const orb = (color, x, y, z, w, h = w, d = w) => part('solidSphere', color, x, y, z, w, h, d);
  function rod(color, a, b, radius = .025) {
    direction.set((b[0] - a[0]) * current.side, b[1] - a[1], b[2] - a[2]);
    const length = direction.length();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.divideScalar(length));
    part('solidCylinder', color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2, radius * 2, length, radius * 2, quaternion);
  }
  function wheel(x, z, radius = .085) {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    part('solidCylinder', INK, x, radius, z, radius * 2, .055, radius * 2, quaternion);
  }
  function feet(width, depth, height, color = METAL) {
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2])
      box(color, x, height / 2, z, .055, height, .055);
  }
  function feature(style, type, side, zOffset, build) {
    current = { x: style.cx + side * 14.95, z: style.cz + zOffset, side, bounds: new THREE.Box3() };
    build(style);
    const bounds = serialBounds(current.bounds);
    const buildingGap = Math.min(...DISTRICT_LAYOUT.filter(record => record.sector === style.id).map(record =>
      rectangleGap(bounds, { minX: record.x - record.width / 2, maxX: record.x + record.width / 2,
        minZ: record.z - record.depth / 2, maxZ: record.z + record.depth / 2 })));
    features.push({ sector: style.id, type, bounds, buildingGap });
    totalBounds.union(current.bounds);
  }
  function bollard(style, z) {
    cylinder(INK, 0, .035, z, .24, .07);
    cylinder(METAL, 0, .28, z, .12, .50);
    part('lightCylinder', style.primary, 0, .50, z, .13, .07, .13);
    cylinder(INK, 0, .555, z, .15, .04);
  }
  function planter(style, z, flower = false) {
    cylinder(style.secondary, 0, .15, z, .50, .30);
    cylinder(INK, 0, .31, z, .45, .035);
    for (let n = 0; n < 5; n++) {
      const angle = n * Math.PI * 2 / 5, x = Math.cos(angle) * .14, dz = Math.sin(angle) * .14;
      orb(flower && n % 2 ? style.primary : '#4f867b', x, .41 + rng() * .09, z + dz, .23, .30, .23);
    }
  }
  // All information panels face inward, toward the sector street, on their broad X face.
  function panel(style, z, height = 1.24, width = .66) {
    box(INK, 0, .045, z, .52, .09, width + .10);
    box(METAL, .10, height * .46, z, .075, height * .90, .065);
    box(style.paint, 0, height * .72, z, .12, height * .54, width);
    light(style.primary, -.066, height * .92, z, .009, .045, width * .82);
    for (let n = 0; n < 3; n++)
      light(n === 0 ? style.secondary : CREAM, -.066, height * (.80 - n * .10), z - .05,
        .009, .018, width * (.64 - n * .11));
  }
  function bench(style, z, length = 1.24, upholstered = false) {
    for (const end of [-1, 1]) box(METAL, .04, .14, z + end * length * .36, .32, .28, .10);
    box(upholstered ? style.secondary : style.paint, 0, .32, z, .48, .11, length);
    box(upholstered ? style.primary : METAL, .23, .49, z, .055, .29, length);
    light(style.primary, -.235, .265, z, .015, .025, length * .85);
  }

  for (const style of OUTER_DISTRICT_STYLES) {
    const first = (type, build) => feature(style, type, -1, 12.5, build);
    const second = (type, build) => feature(style, type, 1, style.id === 'northeast' ? 12.5 : -12.5, build);
    switch (style.buildingStyle) {
      case 'harbour':
        first('parcel-cage-and-warehouse-bollards', s => {
          box(s.paint, 0, .075, 0, .78, .15, 1.10);
          for (const x of [-.37, .37]) for (const z of [-.52, .52]) rod(METAL, [x, .15, z], [x, 1.08, z]);
          for (const h of [.22, .63, 1.04]) {
            for (const x of [-.37, .37]) rod(METAL, [x, h, -.52], [x, h, .52], .017);
            for (const z of [-.52, .52]) rod(METAL, [-.37, h, z], [.37, h, z], .017);
          }
          for (const z of [-.26, 0, .26]) rod(METAL, [-.37, .22, z], [-.37, 1.04, z], .012);
          box(s.secondary, 0, .31, -.24, .55, .32, .39);
          box('#817a61', .04, .31, .22, .49, .32, .40);
          box('#a19076', 0, .58, -.20, .43, .22, .36);
          light(s.primary, -.386, .82, .10, .018, .15, .33);
          bollard(s, -1.04); bollard(s, 1.04);
        });
        second('harbour-cargo-trolley', s => {
          box(METAL, 0, .21, 0, .79, .08, 1.20);
          for (const x of [-.40, .40]) for (const z of [-.43, .43]) wheel(x, z);
          for (const x of [-.32, .32]) rod(s.secondary, [x, .24, .56], [x, .94, .56]);
          rod(s.secondary, [-.32, .94, .56], [.32, .94, .56]);
          for (const z of [-.30, .17]) {
            box(s.paint, 0, .42, z, .65, .34, .40);
            box(s.secondary, -.333, .42, z, .018, .27, .055);
          }
          box('#81949b', 0, .69, -.25, .52, .20, .36);
          light(s.primary, -.267, .70, -.25, .01, .07, .19);
          bollard(s, -1.09);
        });
        break;
      case 'business':
        first('glass-directory-sculpture', s => {
          panel(s, -.53, 1.46, .70);
          box(s.paint, .02, .60, .54, .22, 1.2, .28);
          box('#5a7b86', 0, .82, .53, .33, .65, .44);
          light(s.primary, -.17, .84, .52, .018, .55, .045);
          light(s.secondary, 0, 1.18, .53, .34, .025, .44);
          cylinder(METAL, 0, .035, .53, .56, .07);
        });
        second('luminous-business-bench', s => { bench(s, 0, 1.47); planter(s, -1.12); });
        break;
      case 'lounge':
        first('cloudline-concierge-portico', s => {
          panel(s, 0, 1.1, .65);
          for (const z of [-.52, .52]) box(s.secondary, .17, .73, z, .055, 1.46, .055);
          box(s.secondary, .17, 1.47, 0, .065, .08, 1.14);
          light(s.primary, .13, 1.42, 0, .025, .025, 1.01);
          planter(s, 1.06);
        });
        second('ice-and-gold-lounge-seat', s => { bench(s, -.26, 1.05, true); planter(s, .83); });
        break;
      case 'workshop':
        first('repair-workbench-and-cylinder', s => {
          feet(.59, .91, .57);
          box(METAL, 0, .59, 0, .81, .08, 1.11);
          box(s.paint, .33, .85, 0, .08, .48, 1.05);
          for (let n = 0; n < 5; n++) {
            box(s.secondary, .275, .86, -.36 + n * .18, .05, .13 + (n % 2) * .06, .038);
            cylinder(INK, -.10, .675, -.36 + n * .17, .065, .07);
          }
          box(s.primary, -.1, .70, .22, .33, .13, .22);
          cylinder(s.secondary, 0, .31, 1.02, .31, .62);
          cylinder(METAL, 0, .655, 1.02, .095, .07);
          rod(INK, [0, .66, 1.02], [.22, .77, 1.02], .016);
          light(s.primary, -.417, .56, 0, .013, .025, .75);
        });
        second('mobile-tool-cabinet', s => {
          for (const x of [-.34, .34]) for (const z of [-.32, .32]) wheel(x, z, .065);
          box(s.paint, 0, .41, 0, .65, .63, .81);
          box(METAL, 0, .76, 0, .77, .07, .91);
          for (const y of [.23, .41, .59]) {
            box(s.secondary, -.334, y, 0, .02, .14, .68);
            box(INK, -.35, y + .03, 0, .025, .024, .23);
          }
          box(s.primary, 0, .83, -.21, .33, .08, .22);
          for (const x of [-.31, .31]) rod(METAL, [x, .77, .46], [x, .99, .46]);
          rod(METAL, [-.31, .99, .46], [.31, .99, .46]);
          bollard(s, -1.0);
        });
        break;
      case 'theatre':
        first('theatre-poster-stands', s => {
          for (const z of [-.59, .59]) {
            panel(s, z, 1.30, .63);
            light(z < 0 ? s.primary : s.secondary, -.069, .86, z, .013, .24, .37);
            box(s.paint, -.08, .86, z, .02, .14, .13);
            light(s.secondary, -.096, .89, z, .007, .045, .08);
            for (const zz of [-.20, .20]) light(s.secondary, -.074, .61, z + zz, .016, .027, .025);
          }
        });
        second('miniature-ticket-kiosk', s => {
          box(s.paint, 0, .51, 0, .79, 1.02, .93);
          box(s.secondary, 0, 1.10, 0, .92, .16, 1.08);
          light(s.primary, -.47, 1.11, 0, .014, .072, .86);
          box(INK, -.403, .80, 0, .02, .36, .66);
          box(METAL, -.44, .60, 0, .13, .045, .80);
          light(s.secondary, -.417, .84, -.08, .008, .08, .36);
          box(CREAM, -.417, .72, .21, .018, .045, .12);
          for (const z of [-.35, .35]) light(s.primary, -.409, .30, z, .016, .37, .024);
        });
        break;
      case 'market':
        first('night-market-food-cart', s => {
          for (const x of [-.39, .39]) for (const z of [-.51, .51]) wheel(x, z, .085);
          box(s.paint, 0, .40, 0, .74, .46, 1.10);
          box(METAL, 0, .66, 0, .90, .08, 1.24);
          for (const x of [-.36, .36]) for (const z of [-.51, .51]) rod(s.secondary, [x, .68, z], [x, 1.34, z], .02);
          box(s.secondary, 0, 1.34, 0, .98, .09, 1.40);
          for (const z of [-.56, -.28, 0, .28, .56]) box(s.primary, 0, 1.395, z, .98, .022, .14);
          light(s.secondary, 0, 1.265, 0, .06, .025, 1.00);
          for (const z of [-.30, .17]) {
            cylinder('#b6aca0', 0, .76, z, .31, .12);
            cylinder(CREAM, 0, .83, z, .33, .025);
            orb(METAL, 0, .859, z, .07, .045, .07);
          }
          box(s.primary, -.377, .43, 0, .018, .15, .68);
        });
        second('steamer-table-and-stools', s => {
          feet(.61, .69, .55);
          box('#947358', 0, .57, 0, .84, .08, .92);
          for (const z of [-.20, .20]) for (const h of [.66, .75]) {
            cylinder(s.secondary, 0, h, z, .31, .085);
            cylinder('#dec08d', 0, h + .045, z, .33, .014);
          }
          for (const z of [-.93, .93]) {
            cylinder(s.primary, 0, .29, z, .33, .075);
            for (const x of [-.10, .10]) box(INK, x, .125, z, .05, .25, .08);
          }
        });
        break;
      case 'residential':
        first('commuter-route-board', s => {
          panel(s, 0, 1.45, .86);
          light(s.secondary, -.074, .98, 0, .014, .018, .57);
          for (let n = 0; n < 5; n++) light(s.primary, -.080, .98, -.27 + n * .135, .02, .06, .055);
          light(s.primary, -.08, 1.12, -.29, .016, .07, .07);
          bench(s, 1.22, .80);
        });
        second('neighbourhood-vending-machine', s => {
          box(s.paint, 0, .61, 0, .68, 1.22, .79);
          box(INK, -.35, .80, -.08, .025, .55, .48);
          for (const z of [-.25, -.09, .07]) for (const y of [.64, .83, 1.02])
            light((Math.round(y * 100) + Math.round(z * 100)) % 2 ? s.primary : s.secondary,
              -.367, y, z, .019, .10, .073);
          light(s.primary, -.354, 1.17, 0, .018, .042, .63);
          box(INK, -.358, .23, -.02, .025, .13, .45);
          light(s.secondary, -.368, .83, .285, .016, .09, .045);
          planter(s, 1.01);
        });
        break;
      case 'hotel':
        first('hotel-luggage-trolley', s => {
          box(METAL, 0, .17, 0, .79, .07, 1.00);
          for (const x of [-.40, .40]) for (const z of [-.35, .35]) wheel(x, z, .065);
          for (const x of [-.34, .34]) for (const z of [-.43, .43]) rod(s.secondary, [x, .20, z], [x, 1.14, z], .022);
          for (const z of [-.43, .43]) rod(s.secondary, [-.34, 1.14, z], [.34, 1.14, z], .026);
          for (const x of [-.34, .34]) rod(s.secondary, [x, 1.14, -.43], [x, 1.14, .43], .026);
          box(s.primary, -.12, .47, -.21, .32, .52, .35);
          box('#789e94', .13, .37, .20, .38, .32, .41);
          box(s.secondary, -.12, .73, -.21, .17, .035, .06);
          box(s.paint, .13, .56, .20, .27, .055, .32);
          planter(s, 1.06, true);
        });
        second('rose-mint-terrace-seat', s => { bench(s, -.20, 1.16, true); planter(s, .92, true); });
        break;
    }
  }

  let instanceCount = 0;
  for (const [name, batch] of Object.entries(batches)) {
    if (!batch.items.length) continue;
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.items.length);
    mesh.name = `DistrictAccents-${name}`;
    batch.items.forEach((item, index) => { mesh.setMatrixAt(index, item.matrix); mesh.setColorAt(index, new THREE.Color(item.color)); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh); instanceCount += batch.items.length;
  }
  group.userData = { seed, features, bounds: serialBounds(totalBounds),
    batchCount: group.children.length, instanceCount, featureCount: features.length };
  return group;
}
