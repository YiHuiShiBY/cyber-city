import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glyphAtlas, glyphStrip, foldUV, SHOP_WORDS } from './district-glyphs.js';

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
 * Luminous street furniture: glowing trees, lit kerb posts and light-box signs.
 *
 * All three sit outboard of the pedestrian band (6.37 at worst, walkers plus an
 * umbrella) and inboard of the building faces, and they only occupy the z gaps
 * between neighbouring footprints, which is the one stretch of avenue sidewalk
 * that is provably free of both. Alternate trees pulse on a slow cycle, driven by
 * one shared material whose colour is rewritten from absolute seconds.
 */
export function makeDistrictStreetGlow({ seed = 2049, buildings = [], sectors = [], reserved = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictStreetGlow';
  const rng = seeded(Number(seed) + 6151);
  // 2026-09-15 night: the light-box plates are lettered from the shared glyph atlas. The word for
  // each plate comes off its own stream, so the avenue loop's rng() draws -- which decide where the
  // trees, kerb posts and masts stand -- are bit-for-bit what they were before this change.
  const letterRng = seeded(Number(seed) + 2207);
  const atlas = glyphAtlas(), LAMP_UV = atlas.lamp;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const trunk = new THREE.CylinderGeometry(.5, .5, 1, 7);
  const crownBase = new THREE.IcosahedronGeometry(1, 1);
  const crownSmall = new THREE.IcosahedronGeometry(1, 0);
  const structures = [], glowParts = [], bulbParts = [];
  const trees = [], posts = [], signs = [], pylons = [], plates = [];
  const OFFSET = 6.75;
  // A pocket already holding a kiosk is left alone, so the two modules never share one.
  const taken = (x, z) => reserved.some(item => Math.abs(item.x - x) < 1.3 && Math.abs(item.z - z) < 2.2);
  function bake(list, geometry, x, y, z, sx, sy, sz, color, uv) {
    const part = geometry.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed();
    if (color) {
      const tint = new THREE.Color(color), count = part.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) { colors[v * 3] = tint.r; colors[v * 3 + 1] = tint.g; colors[v * 3 + 2] = tint.b; }
      part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    // The lit batch samples the shared glyph atlas now, so every geometry riding it needs a uv that
    // points at the right cell. A lamp takes the atlas' white apron cell, which leaves its vertex
    // tint exactly as it was. Only the light-box plates ask for a lettered cell, and those are built
    // by the callers rather than here.
    if (list === bulbParts) foldUV(part, uv || LAMP_UV);
    list.push(part);
  }
  for (const sector of sectors) {
    const list = buildings.filter(b => b.sector === sector.id);
    if (!list.length) continue;
    const rows = new Map();
    for (const building of list) {
      const side = Math.sign(building.x - sector.cx) || 1;
      if (!rows.has(side)) rows.set(side, []);
      rows.get(side).push(building);
    }
    for (const [side, row] of rows) {
      row.sort((a, b) => a.z - b.z);
      const x = sector.cx + side * OFFSET;
      for (let index = 0; index < row.length - 1; index++) {
        const a = row[index], b = row[index + 1];
        const gap = (b.z - b.depth / 2) - (a.z + a.depth / 2);
        const midZ = (a.z + a.depth / 2 + b.z - b.depth / 2) / 2;
        // Only the narrow pockets between neighbours: the wide ones are roadways.
        if (gap > 3.6) continue;
        if (taken(x, midZ)) continue;
        // A lit tree plus a pair of kerb posts in the same pocket.
        if (rng() > .25) {
          const height = 3.1 + rng() * 1.5, radius = .95 + rng() * .45;
          bake(structures, trunk, x, height * .42, midZ, .28, height * .84, .28);
          bake(glowParts, crownBase, x, height * .93, midZ, radius, radius * .82, radius);
          bake(glowParts, crownSmall, x - radius * .34, height * .70, midZ + radius * .22, radius * .58, radius * .5, radius * .58);
          bake(glowParts, crownSmall, x + radius * .30, height * .76, midZ - radius * .26, radius * .5, radius * .44, radius * .5);
          trees.push({ sector: sector.id, x, z: midZ, height });
        }
        // One lit kerb post per pocket, set outboard of the tree. A pair flanking
        // it in z cannot fit: the pocket is only as wide as the gap between two
        // footprints, so any z offset lands inside a mass.
        // Outboard means away from the avenue, which flips with the row side.
        const postX = x + side * .45;
        if (!taken(postX, midZ)) {
          bake(structures, unit, postX, .11, midZ, .22, .22, .22);
          bake(bulbParts, unit, postX, .30, midZ, .16, .18, .16, '#ffd9a0');
          bake(structures, unit, postX, .43, midZ, .13, .06, .13);
          posts.push({ sector: sector.id, x: postX, z: midZ });
        }
        // A light-box sign on a mast, angled up the avenue.
        if (rng() > .45) {
          const signZ = midZ + (rng() > .5 ? .6 : -.6), mast = 2.5 + rng() * 1.1;
          if (taken(x, signZ)) continue;
          bake(structures, unit, x, mast / 2, signZ, .13, mast, .13);
          bake(structures, unit, x, mast - .06, signZ, .30, .10, .30);
          const yaw = -side * Math.PI / 2;
          const plate = unit.clone().scale(.06, .78, 1.30);
          plate.rotateY(yaw);
          plate.translate(x - side * .18, mast * .74, signZ);
          const platePart = plate.toNonIndexed(), plateCount = platePart.getAttribute('position').count;
          const plateColors = new Float32Array(plateCount * 3).fill(.96);
          platePart.setAttribute('color', new THREE.BufferAttribute(plateColors, 3));
          // A .78-tall board takes one glyph cell per .78 of width, so the 1.30 face carries two
          // characters. Drawn from the lettering stream: the rng draws above and below stay put.
          const glyph = Math.floor(letterRng() * SHOP_WORDS.length);
          foldUV(platePart, glyphStrip(glyph, 1.30, .78));
          plates.push({ sector: sector.id, x: x - side * .18, z: signZ, board: 1.30, cell: .78, glyph, text: SHOP_WORDS[glyph], axis: 'x' });
          bulbParts.push(platePart);
          signs.push({ sector: sector.id, x: x - side * .18, z: signZ, height: mast * .74 });
        }
      }
    }
  }
  // 2026-09-15 evening: the loop above only ever walks the ±x rows, so the cross streets carried
  // no furniture of their own -- the street-level census found 0 trees and 0 posts on all four
  // cross corridors. Placement was measured before it was written (_phase2/_geo-canyon.cjs):
  //   cross-street canyon half-width 4.11-4.20 (the avenue is 6.22-6.38)
  //   the crab walkers hold a lateral band of 2.50-3.10 from the centreline, over 10836 samples
  //   so the free strips are the roadway side of that band, and 3.10..4.12 in front of the walls.
  // A crown is 1.9-2.8 across: put one at 3.90 and it reaches both into the walkers and through the
  // facade, so the trees stay on the avenues. A kerb post (.22) and a sign mast (.13) do fit, and
  // the plate hangs inboard at 3.45, above every walker.
  const CROSS_STREETS = [-48, -24, 0, 24, 48], CROSS_STRIP = 3.90, CROSS_PLATE = 3.45;
  // The frontage test is deliberately the same 6.2 one the cross-street shopfronts use, so the two
  // kits sit on one list rather than on two sets that almost agree.
  const frontages = [];
  for (const building of buildings) {
    const bounds = building.actualBounds;
    if (!bounds) continue;
    for (const face of [bounds.min[2], bounds.max[2]]) {
      const street = CROSS_STREETS.find(value => Math.abs(face - value) < 6.2);
      if (street === undefined) continue;
      const side = Math.sign(face - street) || 1;
      // The viaduct crosses the z = 24 corridor, so its band stays off limits, as for the pylons.
      if (side > 0 && Math.abs(street - 24) < 4) continue;
      frontages.push({ sector: building.sector, x: building.x, depth: building.depth, face, street, side });
    }
  }
  // Its own stream. The avenue loop above has to keep its rng sequence bit-identical: one extra
  // draw would move every tree, post and sign already on screen.
  const crossRng = seeded(Number(seed) + 6151 + 971);
  for (const frontage of frontages) {
    const z = frontage.street + frontage.side * CROSS_STRIP;
    const plateZ = frontage.street + frontage.side * CROSS_PLATE;
    for (const offset of [-1.9, 1.9]) {
      const x = frontage.x + offset;
      if (taken(x, z)) continue;
      bake(structures, unit, x, .11, z, .22, .22, .22);
      bake(bulbParts, unit, x, .30, z, .16, .18, .16, '#ffd9a0');
      bake(structures, unit, x, .43, z, .13, .06, .13);
      posts.push({ sector: frontage.sector, x, z, axis: 'z' });
    }
    // The light-box sign turned the quarter turn: the plate faces along x now, so it is read by
    // someone walking the cross street. It is the avenue plate's orientation minus the yaw. The
    // plate straddles its mast (mast at 3.90, plate 2.90..4.00 in z) and leans over the crab band,
    // so the mast is raised until the plate's bottom edge clears an umbrella at 1.39.
    if (crossRng() > .35) {
      const mast = 2.6 + crossRng() * 1.1, x = frontage.x + (crossRng() > .5 ? .9 : -.9);
      if (!taken(x, z)) {
        bake(structures, unit, x, mast / 2, z, .13, mast, .13);
        bake(structures, unit, x, mast - .06, z, .30, .10, .30);
        const plate = unit.clone().scale(.06, .78, 1.10).translate(x, mast * .78, plateZ);
        const platePart = plate.toNonIndexed(), plateCount = platePart.getAttribute('position').count;
        const plateColors = new Float32Array(plateCount * 3).fill(.96);
        platePart.setAttribute('color', new THREE.BufferAttribute(plateColors, 3));
        // The 1.10-wide face takes a single character at the same .78 cell, which is what a streetside
        // light box usually carries anyway.
        const glyph = Math.floor(letterRng() * SHOP_WORDS.length);
        foldUV(platePart, glyphStrip(glyph, 1.10, .78));
        plates.push({ sector: frontage.sector, x, z: plateZ, board: 1.10, cell: .78, glyph, text: SHOP_WORDS[glyph], axis: 'z' });
        bulbParts.push(platePart);
        signs.push({ sector: frontage.sector, x, z: plateZ, height: mast * .78, axis: 'z' });
      }
    }
  }
  // Night-market strings spanning the cross street itself. The two strings below hang 8.5 back
  // from the centreline, inside the block, so nothing crossed a street at eye level. These run
  // kerb to kerb -- across the canyon rather than along it -- one per cross-street frontage, at
  // the same 4.85 with the same .5 sag, which keeps 4.35 of headroom over a 7.8 m span.
  const crossStrings = [];
  for (const frontage of frontages) {
    const span = CROSS_STRIP * 2, height = 4.85, sag = .5, start = frontage.street - CROSS_STRIP;
    for (let step = 0; step < 8; step++) {
      const z0 = start + step * span / 8, z1 = start + (step + 1) * span / 8;
      const y0 = height - Math.sin(Math.PI * step / 8) * sag;
      const y1 = height - Math.sin(Math.PI * (step + 1) / 8) * sag;
      const wire = unit.clone().scale(.03, .03, span / 8);
      wire.translate(frontage.x, (y0 + y1) / 2, (z0 + z1) / 2);
      structures.push(wire.toNonIndexed());
    }
    for (let bulb = 0; bulb <= 8; bulb++) {
      const z = start + bulb * span / 8;
      const y = height - Math.sin(Math.PI * bulb / 8) * sag - .10;
      bake(bulbParts, unit, frontage.x, y, z, .09, .11, .09, '#ffd9a0');
    }
    crossStrings.push({ sector: frontage.sector, x: frontage.x, z: frontage.street, span, height, sag, strip: CROSS_STRIP });
  }
  // Festoon strings across each sector frontage: a sagging catenary with lit
  // bulbs, hung between the two facing rows at 4.6 — above every road actor.
  for (const sector of sectors) {
    const list = buildings.filter(b => b.sector === sector.id);
    if (!list.length) continue;
    const centre = list.reduce((sum, b) => sum + b.x, 0) / list.length;
    if (!list.some(b => Math.abs(b.x - centre) < centre)) continue;
    for (const frontZ of [sector.cz - 8.5, sector.cz + 8.5]) {
      const span = 12.4, sag = .5, height = 4.85;
      const left = centre - span / 2, right = centre + span / 2;
      for (let step = 0; step < 8; step++) {
        const x0 = left + step * span / 8, x1 = left + (step + 1) * span / 8;
        const y0 = height - Math.sin(Math.PI * step / 8) * sag;
        const y1 = height - Math.sin(Math.PI * (step + 1) / 8) * sag;
        const wire = unit.clone().scale(span / 8, .03, .03);
        wire.translate((x0 + x1) / 2, (y0 + y1) / 2, frontZ);
        structures.push(wire.toNonIndexed());
      }
      for (let bulb = 0; bulb <= 8; bulb++) {
        const x = left + bulb * span / 8;
        const y = height - Math.sin(Math.PI * bulb / 8) * sag - .10;
        bake(bulbParts, unit, x, y, frontZ, .09, .11, .09, '#ffd9a0');
      }
    }
  }
  // Intersection pylons: a lit column on each free corner of the main
  // avenue / cross-street crossings. Corners that would fall into the viaduct
  // band (z 26.2-29.3 around z=24) are skipped.
  for (const avenue of [-42, 0, 42]) for (const cross of [-75, -24, 24, 75]) {
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      const x = avenue + dx * 5.85, z = cross + dz * 3.2;
      if (Math.abs(z - 24) < 4 && dz > 0) continue;
      if (Math.abs(x) > 66 || Math.abs(z) > 80) continue;
      bake(structures, unit, x, .06, z, .30, .12, .30);
      bake(structures, unit, x, 1.62, z, .14, 3.0, .14);
      bake(bulbParts, unit, x, 3.18, z, .20, .24, .20, '#bfe9ff');
      pylons.push({ x, z });
    }
  }

  function finish(list, material, name) {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(list), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  finish(structures, new THREE.MeshStandardMaterial({ color: '#2f3d47', metalness: .45, roughness: .6 }), 'DistrictStreetGlow-Structures');
  // An emissive standard material keeps the foliage shaded instead of flat, while
  // still reading as a light source on the dark avenue.
  // Vertex colours let one batch carry the green foliage, warm bulbs and the
  // cool pylon lamps; the breathing pulse modulates emissive intensity only.
  const treesMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: .72, toneMapped: false });
  finish(glowParts, treesMaterial, 'DistrictStreetGlow-Foliage');
  // The bulb batch carries the lettering atlas now: every lamp samples its white apron, and the two
  // light-box families sample lettered cells. One material, so the batch is still one draw.
  finish(bulbParts, new THREE.MeshBasicMaterial({ color: '#ffffff', map: atlas.texture, toneMapped: false, vertexColors: true }), 'DistrictStreetGlow-Bulbs');
  const treeBase = new THREE.Color('#2b4f47');
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    // A slow breath on the greenery so the street reads as alive, not painted.
    const breathe = .95 + .22 * Math.sin(time * .55);
    treesMaterial.emissiveIntensity = breathe;
    treesMaterial.emissive.copy(treeBase).multiplyScalar(breathe);
  }
  update(0);
  group.userData = { seed, trees, posts, signs, pylons, plates, crossFrontages: frontages, crossStrings,
    treeCount: trees.length, postCount: posts.length, signCount: signs.length, pylonCount: pylons.length,
    plateCount: plates.length, plateAtlas: { columns: atlas.columns, rows: atlas.rows, cell: atlas.cell, glyphCells: atlas.words.length, lampCell: { column: 15, row: 3 } },
    crossPostCount: posts.filter(post => post.axis === 'z').length, crossSignCount: signs.filter(sign => sign.axis === 'z').length,
    crossStringCount: crossStrings.length, offset: OFFSET, crossStrip: CROSS_STRIP, treesMaterial, update };
  return group;
}
