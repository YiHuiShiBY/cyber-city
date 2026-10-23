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
 * Skybridges between the outer buildings, at deliberately uneven heights.
 *
 * Three families, all axis-aligned so every deck is one box:
 *  - short links inside a row, spanning the 1-1.5 unit gap between neighbours;
 *  - cross-avenue spans between the two rows of a sector, clearing the roadway;
 *  - cross-street spans over the secondary street that splits each row.
 * Each deck ends inside both host footprints and stays at least 1.4 below the
 * shorter roof, so a bridge always reads as connecting two real buildings.
 *
 * Decks, rails and glowing soffits merge into three meshes for the whole district.
 */
export function makeDistrictLinks({ seed = 2049, buildings = [], sectors = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictLinks';
  const rng = seeded(Number(seed) + 7717);
  const decks = [], rails = [], lights = [];
  const bridges = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  function bake(list, x, y, z, sx, sy, sz) {
    list.push(unit.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed());
  }
  // A deck with two rails, a soffit light and (for long spans) a truss above it.
  function bridge(hosts, axis, height, truss) {
    const [a, b] = hosts;
    const low = Math.min(a.height, b.height);
    const span = axis === 'z'
      ? Math.abs(b.z - a.z) - (a.depth + b.depth) / 2 + 1.2
      : Math.abs(b.x - a.x) - (a.width + b.width) / 2 + 1.2;
    if (span <= .3) return null;
    // A trussed span also has to keep its top chord under the shorter roof.
    const y = Math.min(height, .15 + low - (truss ? 2.1 : 1.4));
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const length = span;
    if (axis === 'z') {
      bake(decks, mid.x, y, mid.z, 1.0, .22, length);
      bake(lights, mid.x, y - .16, mid.z, .74, .05, length * .94);
      for (const side of [-1, 1]) {
        bake(rails, mid.x + side * .5, y + .42, mid.z, .07, .62, length);
        bake(lights, mid.x + side * .51, y + .74, mid.z, .05, .05, length * .96);
      }
      if (truss) {
        bake(rails, mid.x, y + 1.42, mid.z, .30, .16, length);
        for (let offset = -length / 2 + .8; offset < length / 2; offset += 1.75) {
          for (const side of [-1, 1]) bake(rails, mid.x + side * .28, y + .8, mid.z + offset, .06, 1.1, .06);
        }
      }
    } else {
      bake(decks, mid.x, y, mid.z, length, .22, 1.0);
      bake(lights, mid.x, y - .16, mid.z, length * .94, .05, .74);
      for (const side of [-1, 1]) {
        bake(rails, mid.x, y + .42, mid.z + side * .5, length, .62, .07);
        bake(lights, mid.x, y + .74, mid.z + side * .51, length * .96, .05, .05);
      }
      if (truss) {
        bake(rails, mid.x, y + 1.42, mid.z, length, .16, .30);
        for (let offset = -length / 2 + .8; offset < length / 2; offset += 1.75) {
          for (const side of [-1, 1]) bake(rails, mid.x + offset, y + .8, mid.z + side * .28, .06, 1.1, .06);
        }
      }
    }
    const footprint = b => ({ x: b.x, z: b.z, width: b.width, depth: b.depth, height: b.height });
    const record = { axis, x: mid.x, y, z: mid.z, length, hosts: [footprint(a), footprint(b)] };
    bridges.push(record);
    return record;
  }

  const bySector = new Map();
  for (const building of buildings) {
    if (!bySector.has(building.sector)) bySector.set(building.sector, []);
    bySector.get(building.sector).push(building);
  }
  const HEIGHTS = [.30, .42, .52, .64, .74, .84];
  // A trussed span needs 2.1 of headroom under its host roofs, and a span over a
  // road needs its underside above 5.8, so short hosts are skipped entirely.
  const MIN_ROAD_HOST = 8.4;
  for (const list of bySector.values()) {
    const centre = list.reduce((sum, b) => sum + b.x, 0) / list.length;
    const rows = new Map();
    for (const building of list) {
      const side = Math.sign(building.x - centre) || 1;
      if (!rows.has(side)) rows.set(side, []);
      rows.get(side).push(building);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.z - b.z);
      for (let index = 0; index < row.length - 1; index++) {
        const a = row[index], b = row[index + 1];
        const gap = (b.z - b.depth / 2) - (a.z + a.depth / 2);
        if (gap < .6 || gap > 3.4 || rng() > .62) continue;
        bridge([a, b], 'z', .15 + Math.min(a.height, b.height) * HEIGHTS[Math.floor(rng() * HEIGHTS.length)], false);
      }
      // The row is split by the secondary street; one deck may cross it.
      for (let index = 0; index < row.length - 1; index++) {
        const a = row[index], b = row[index + 1];
        const gap = (b.z - b.depth / 2) - (a.z + a.depth / 2);
        if (gap < 6 || gap > 10 || rng() > .5) continue;
        if (Math.min(a.height, b.height) < MIN_ROAD_HOST) continue;
        bridge([a, b], 'z', Math.max(6.4, .15 + Math.min(a.height, b.height) * [.40, .56, .70][Math.floor(rng() * 3)]), true);
      }
    }
    // One cross-avenue deck per sector, tying the two rows together.
    const sides = [...rows.keys()];
    if (sides.length === 2) {
      const tall = sides.map(side => [...rows.get(side)].sort((a, b) => b.height - a.height));
      let pair = [tall[0][0], tall[1].reduce((best, item) => Math.abs(item.z - tall[0][0].z) < Math.abs(best.z - tall[0][0].z) ? item : best, tall[1][0])];
      // Prefer a pair whose roofs can carry a truss over the roadway.
      if (Math.min(pair[0].height, pair[1].height) < MIN_ROAD_HOST) {
        for (const candidate of tall[0]) {
          const partner = tall[1].reduce((best, item) => Math.abs(item.z - candidate.z) < Math.abs(best.z - candidate.z) ? item : best, tall[1][0]);
          if (Math.min(candidate.height, partner.height) >= MIN_ROAD_HOST) { pair = [candidate, partner]; break; }
        }
      }
      if (Math.min(pair[0].height, pair[1].height) >= MIN_ROAD_HOST) {
        bridge(pair, 'x', Math.max(6.5, .15 + Math.min(pair[0].height, pair[1].height) * [.34, .46, .58][Math.floor(rng() * 3)]), true);
      }
    }
  }

  // Cross-district links: neighbouring sectors are joined over the secondary roads
  // by the pair of masses that sits closest to their shared boundary.
  const byId = new Map(sectors.map(sector => [sector.id, buildings.filter(b => b.sector === sector.id)]));
  const STEP = 42;
  for (const sector of sectors) {
    for (const other of sectors) {
      if (other.id === sector.id) continue;
      const dx = other.cx - sector.cx, dz = other.cz - sector.cz;
      if (Math.abs(dx) > STEP + 1 || Math.abs(dz) > STEP + 1) continue;
      if (sector.cx > other.cx || (sector.cx === other.cx && sector.cz >= other.cz)) continue;
      const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
      const from = byId.get(sector.id) || [], to = byId.get(other.id) || [];
      let best = null;
      for (const a of from) for (const b of to) {
        if (Math.min(a.height, b.height) < MIN_ROAD_HOST) continue;
        if (Math.abs(a.height - b.height) > 7) continue;
        const lateral = axis === 'x' ? Math.abs(a.z - b.z) : Math.abs(a.x - b.x);
        const span = axis === 'x' ? Math.abs(a.x - b.x) : Math.abs(a.z - b.z);
        if (span < 12 || span > 34) continue;
        const score = lateral * 2 + Math.abs(a.height - b.height);
        if (!best || score < best.score) best = { a, b, score, lateral };
      }
      if (best && best.lateral < 3.4 && rng() > .35) {
        bridge([best.a, best.b], axis, Math.max(6.6, .15 + Math.min(best.a.height, best.b.height) * [.36, .48, .60, .72][Math.floor(rng() * 4)]), true);
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
  const deckMesh = finish(decks, new THREE.MeshStandardMaterial({ color: '#283945', metalness: .54, roughness: .48 }), 'DistrictLinks-Decks');
  finish(rails, new THREE.MeshStandardMaterial({ color: '#5d7481', metalness: .74, roughness: .34 }), 'DistrictLinks-Rails');
  finish(lights, new THREE.MeshBasicMaterial({ color: '#9fe6ff', toneMapped: false }), 'DistrictLinks-SoffitLights');

  group.userData = { seed, bridges, bridgeCount: bridges.length, deckMesh, update() {} };
  return group;
}
