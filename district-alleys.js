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
 * Back-lane lighting: the cross streets and the slots between buildings used to
 * be the darkest part of the district, which is what made it feel hollow once
 * the eye left the main avenues.
 *
 * Two kinds of attachments, both derived from the real building masses:
 *  - gable kit: a vertical neon panel plus two wall lamps on the street-facing
 *    end wall (the gable) of each row's outermost buildings;
 *  - alley kit: a floor light strip plus a slim pole lamp in the pocket between
 *    neighbouring buildings, at the slot mouth just outboard of the walker band.
 * Pockets already holding a kiosk, tree or sign are skipped.
 *
 * Structures and luminous parts merge into two draws.
 */
export function makeDistrictAlleys({ seed = 2049, buildings = [], sectors = [], reserved = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictAlleys';
  const rng = seeded(Number(seed) + 9911);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const structures = [], litParts = [];
  const gables = [], alleyLamps = [];
  const palette = ['#ffd9a0', '#aef0ff', '#ffaede', '#c5ffce'];
  // A colour attribute per part lets one vertex-coloured batch carry warm lamps
  // and per-sector coloured sign panels together.
  function bake(list, geometry, x, y, z, sx, sy, sz, color) {
    const part = geometry.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed();
    if (color) {
      const tint = new THREE.Color(color), count = part.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) { colors[v * 3] = tint.r; colors[v * 3 + 1] = tint.g; colors[v * 3 + 2] = tint.b; }
      part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    list.push(part);
  }
  // Only items sharing the lamp's lateral band (trees at 6.75) really conflict;
  // kiosks (7.15) and sign masts clear a 6.42 lamp by over .7.
  const taken = (x, z) => reserved.some(item => Math.abs(item.x - x) < .55 && Math.abs(item.z - z) < 1.6);

  const bySector = new Map();
  for (const building of buildings) {
    if (!bySector.has(building.sector)) bySector.set(building.sector, []);
    bySector.get(building.sector).push(building);
  }
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
      // --- Gable kits on the two street-facing end walls of the row.
      for (const host of [row[0], row[row.length - 1]]) {
        if (rng() > .78) continue;
        const b = host.actualBounds;
        const faceZ = host === row[0] ? b.min[2] : b.max[2];
        const outward = host === row[0] ? -1 : 1;
        const panelX = b.min[0] + (b.max[0] - b.min[0]) * (.42 + rng() * .16);
        const panelH = 2.6 + rng() * 1.1;
        const baseY = 3.1 + rng() * 1.2;
        // Sign panel and its mounting rail sit proud of the gable wall.
        bake(structures, unit, panelX, baseY + panelH / 2, faceZ + outward * .07, .68, panelH + .14, .05);
        bake(litParts, unit, panelX, baseY + panelH / 2, faceZ + outward * .105, .58, panelH, .03, palette[gables.length % palette.length]);
        for (const lampX of [b.min[0] + .5, b.max[0] - .5]) {
          if (Math.abs(lampX - panelX) < .75) continue;
          bake(structures, unit, lampX, 3.55, faceZ + outward * .10, .12, .09, .22);
          bake(litParts, unit, lampX, 3.48, faceZ + outward * .13, .09, .06, .16, '#ffd9a0');
        }
        gables.push({ sector: sector.id, x: +panelX.toFixed(2), z: +faceZ.toFixed(2), outward });
      }
      // --- Alley kits in the pockets between neighbours.
      for (let index = 0; index < row.length - 1; index++) {
        const a = row[index], b = row[index + 1];
        const gap = (b.actualBounds.min[2]) - (a.actualBounds.max[2]);
        if (gap < 1.2 || gap > 3.6) continue;
        const z = (a.actualBounds.max[2] + b.actualBounds.min[2]) / 2;
        const x = sector.cx + side * 6.42;
        if (taken(x, z)) continue;
        // Floor strip fills the slot; the pole lamp stands at the slot mouth.
        bake(litParts, unit, x, .035, z, .34, .05, Math.min(gap * .72, 2.1), '#aef0ff');
        bake(structures, unit, x, 1.32, z + gap * .22, .07, 2.64, .07);
        bake(structures, unit, x, 2.68, z + gap * .22, .20, .10, .20);
        bake(litParts, unit, x, 2.60, z + gap * .22, .15, .07, .15, '#ffd9a0');
        alleyLamps.push({ sector: sector.id, x, z, gap: +gap.toFixed(2) });
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
  finish(structures, new THREE.MeshStandardMaterial({ color: '#2e3d47', metalness: .5, roughness: .55 }), 'DistrictAlleys-Structures');
  const lit = finish(litParts, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, vertexColors: true }), 'DistrictAlleys-LitParts');
  // Per-packet colour: warm by default, one cool accent panel per sector via
  // instance-colour-free approach — keep the merged batch single-tone and let
  // the sign colours come from the sector palette on the emissive strips only.
  group.userData = {
    seed, gables, alleyLamps,
    gableCount: gables.length, alleyCount: alleyLamps.length,
    litMesh: lit,
    update() {},
  };
  return group;
}
