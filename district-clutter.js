import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

/**
 * Back-of-house clutter for the pockets between neighbouring buildings.
 *
 * Every row of buildings leaves z gaps of 1.3-4.2 units between neighbours. Those gaps
 * are slots running away from the avenue for the full depth of the row, and nothing in
 * the district uses them beyond a floor strip and a pole lamp at the mouth
 * (`DistrictAlleys`, offset 6.42 from the avenue centreline). Everything here sits at
 * least 1.15 units inside the slot, so the pedestrian band at 5.4, the trees at 6.75 and
 * the kiosks at 7.15 are all untouched.
 *
 * Six kit types (crates, bin, bicycle, vending machine, barrels, cable spool, tea stall)
 * plus a hanging lantern, all merged into two draws: vertex-coloured structures and
 * vertex-coloured luminous parts.
 */
export function makeDistrictClutter({ seed = 2049, buildings = [], sectors = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictClutter';
  const rng = seeded(Number(seed) + 13571);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const barrel = new THREE.CylinderGeometry(1, 1, 1, 12);
  const disc = new THREE.CylinderGeometry(1, 1, 1, 12);
  disc.rotateX(Math.PI / 2);
  const structures = [], litParts = [];
  const items = [], lanterns = [];
  const palette = ['#ffd9a0', '#aef0ff', '#ffaede', '#c5ffce'];

  const tint = new THREE.Color();
  function bake(list, geometry, x, y, z, sx, sy, sz, color, yaw = 0) {
    let part = geometry.clone().scale(sx, sy, sz);
    if (yaw) part.rotateY(yaw);
    part.translate(x, y, z);
    part = part.toNonIndexed();
    tint.set(color);
    const count = part.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) { colors[v * 3] = tint.r; colors[v * 3 + 1] = tint.g; colors[v * 3 + 2] = tint.b; }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    list.push(part);
  }
  const box = (x, y, z, sx, sy, sz, color, yaw) => bake(structures, unit, x, y, z, sx, sy, sz, color, yaw);
  const lit = (x, y, z, sx, sy, sz, color) => bake(litParts, unit, x, y, z, sx, sy, sz, color);

  const kits = [
    function crates(x, z, roll) {
      const yaw = (roll - .5) * .5;
      box(x, .22, z, .62, .44, .60, '#8a6f4e', yaw);
      box(x + .06, .66, z - .04, .50, .34, .48, '#7b6248', yaw + .34);
      if (roll > .55) box(x - .05, .90, z + .05, .40, .26, .38, '#93795a', yaw - .28);
    },
    function bin(x, z) {
      bake(structures, barrel, x, .38, z, .30, .76, .30, '#2f4a44');
      bake(structures, barrel, x, .79, z, .33, .07, .33, '#3d5f57');
      bake(structures, barrel, x, .67, z, .315, .05, .315, '#8fa8a0');
      box(x, .02, z, .70, .04, .70, '#26373a');
    },
    function bicycle(x, z, roll) {
      const zf = z + (roll - .5) * .18;
      bake(structures, disc, x - .44, .33, zf, .33, .33, .05, '#1b2730');
      bake(structures, disc, x + .44, .33, zf, .33, .33, .05, '#1b2730');
      box(x, .62, zf, .88, .06, .06, '#4a5a63');
      box(x - .30, .56, zf, .06, .40, .06, '#4a5a63');
      box(x + .30, .78, zf, .06, .06, .46, '#54646d');
      box(x - .06, .84, zf, .22, .05, .10, '#3f4d55');
    },
    function vending(x, z, roll, side, index) {
      const out = -side * .38;
      box(x, .04, z, .78, .08, .62, '#22323c');
      box(x, .75, z, .72, 1.42, .58, '#2c3f4a');
      box(x + out * .55, 1.50, z, .66, .05, .54, '#26363f');
      lit(x + out, .80, z, .04, 1.02, .46, palette[index % palette.length]);
      lit(x + out, 1.36, z, .04, .08, .40, palette[(index + 2) % palette.length]);
    },
    function barrels(x, z, roll) {
      bake(structures, barrel, x - .28, .43, z, .32, .86, .32, '#5c6b52');
      bake(structures, barrel, x + .30, .43, z + .12, .30, .82, .30, '#6d5a3f');
      if (roll > .6) bake(structures, barrel, x + .02, 1.00, z - .10, .26, .34, .26, '#4f5c47');
    },
    function spool(x, z) {
      bake(structures, disc, x, .40, z, .40, .40, .26, '#3a4a3f');
      bake(structures, disc, x, .40, z, .17, .17, .32, '#57604f');
    },
    function teaStall(x, z) {
      box(x, .74, z, .86, .05, .62, '#6b563c');
      for (const dx of [-.36, .36]) for (const dz of [-.24, .24]) box(x + dx, .37, z + dz, .05, .74, .05, '#553f2e');
      bake(structures, barrel, x - .30, .22, z + .34, .16, .44, .16, '#4a3f33');
      bake(structures, barrel, x + .30, .22, z + .30, .16, .44, .16, '#4a3f33');
      bake(structures, barrel, x, .86, z - .06, .13, .20, .13, '#c8b795');
    },
  ];

  function lantern(x, z, index) {
    box(x, 3.06, z, .02, .62, .02, '#2a3339');
    bake(structures, barrel, x, 2.80, z, .17, .05, .17, '#3b4750');
    bake(structures, barrel, x, 2.51, z, .17, .05, .17, '#3b4750');
    bake(litParts, barrel, x, 2.66, z, .15, .24, .15, palette[index % palette.length]);
    lanterns.push({ x: +x.toFixed(2), z: +z.toFixed(2), color: palette[index % palette.length] });
  }

  const bySector = new Map();
  for (const building of buildings) {
    if (!bySector.has(building.sector)) bySector.set(building.sector, []);
    bySector.get(building.sector).push(building);
  }
  let index = 0;
  for (const sector of sectors) {
    const list = bySector.get(sector.id) || [];
    if (!list.length) continue;
    const rows = new Map();
    for (const building of list) {
      const side = Math.sign(building.x - sector.cx) || 1;
      if (!rows.has(side)) rows.set(side, []);
      rows.get(side).push(building);
    }
    for (const [side, row] of rows) {
      row.sort((a, b) => a.z - b.z);
      for (let step = 0; step < row.length - 1; step++) {
        const a = row[step], b = row[step + 1];
        const gap = b.actualBounds.min[2] - a.actualBounds.max[2];
        if (gap < 1.15 || gap > 4.6) continue;
        // Slot mouth and far end, measured along x away from the avenue.
        const near = side > 0 ? Math.min(a.actualBounds.min[0], b.actualBounds.min[0]) : Math.max(a.actualBounds.max[0], b.actualBounds.max[0]);
        const far = side > 0 ? Math.max(a.actualBounds.max[0], b.actualBounds.max[0]) : Math.min(a.actualBounds.min[0], b.actualBounds.min[0]);
        if (Math.abs(far - near) < 2.0) continue;
        const x = near + side * 1.15;
        const z0 = (a.actualBounds.max[2] + b.actualBounds.min[2]) / 2;
        if (rng() > .85) continue;
        const slots = gap > 2.8 ? [-gap * .23, gap * .23] : [0];
        for (const dz of slots) {
          if (dz !== 0 && rng() > .4) continue;
          const z = z0 + dz;
          kits[Math.floor(rng() * kits.length)](x, z, rng(), side, index);
          items.push({ sector: sector.id, side, x: +x.toFixed(2), z: +z.toFixed(2), gap: +gap.toFixed(2) });
          index++;
        }
        if (rng() < .55) {
          lantern(x + (rng() - .5) * .5, z0, index);
          index++;
        }
      }
    }
  }

  function finish(list, material, name) {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(list), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  finish(structures, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .34, roughness: .68 }), 'DistrictClutter-Structures');
  finish(litParts, new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false }), 'DistrictClutter-LitParts');
  group.userData = { seed, items, lanterns, itemCount: items.length, lanternCount: lanterns.length, update() {} };
  return group;
}
