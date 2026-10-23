import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applySurfaceDetail } from './surface-detail.js';
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

// Sign lettering for the ground-floor units, on screen as of 2026-09-15 evening. The atlas itself
// moved to district-glyphs.js on 2026-09-15 night, when the street-glow light boxes started
// lettering their plates from the same canvas: one warm ground, one ink, one texture for both.

/**
 * Ground-floor shopfronts bolted onto the outer masses.
 *
 * Each unit is clamped to the real ground floor: a glazed front, a striped awning,
 * a lit shop sign and a step. The glazing sits inside the host face and only the
 * awning overhangs, at 3.1 up, so nothing enters the avenue corridor at walking
 * height. Structures (including the awnings) and the lit shopfronts are two draws.
 */
export function makeDistrictShops({ seed = 2049, buildings = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictShops';
  const rng = seeded(Number(seed) + 4477);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const structures = [], fronts = [];
  const shops = [];
  // Sign lettering for the ground-floor units. Every glyph is drawn into the shared atlas and the
  // lit sign board is lettered with it, so the roster is what the street reads now. Twenty-four
  // glyphs instead of eight, and no run of units along one face repeats a word. Reading the word
  // still consumes exactly one rng() at exactly the point it always did, so none of the existing
  // frontage geometry moves. The atlas itself is shared with the street-glow light boxes; the
  // roster and the cell layout are unchanged, so every board still maps its uv bit for bit.
  const words = SHOP_WORDS;
  const atlas = glyphAtlas();
  function bake(list, geometry, x, y, z, sx, sy, sz, uv) {
    const part = geometry.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed();
    // All six faces of a box carry the same 0..1 uv rect, so folding one cell into that rect shows
    // the cell on the outward face too -- which is the only face ever seen. foldUV is shared with
    // the street-glow plates, which letter the same canvas.
    if (uv) foldUV(part, uv);
    list.push(part);
  }
  // The board is .56 tall, so a run of square glyphs wants one cell per .56 of width. Derived from
  // the board width that is already known -- this must not draw from rng. glyphStrip lives in
  // district-glyphs.js now, because the light boxes letter a taller (.78) board from the same
  // atlas and pass their own cell size; the default keeps this module's boards bit-for-bit.
  for (const host of buildings) {
    const bounds = host.actualBounds;
    const minX = bounds.min[0], maxX = bounds.max[0], minZ = bounds.min[2], maxZ = bounds.max[2];
    const sectorSign = Math.sign(host.x) || 1;
    for (const face of [-1, 1]) {
      if (rng() > .68) continue;
      const faceX = face > 0 ? maxX : minX;
      const outward = face > 0 ? 1 : -1;
      const depth = host.depth * (.62 + rng() * .26), width = Math.min(4.6, host.width * .82);
      const z = host.z + (rng() - .5) * Math.max(.2, (maxZ - minZ) - depth);
      const glazing = width * .78;
      // Glazing is recessed into the face, so it never overhangs the pavement.
      const glassX = faceX + outward * .06;
      // A plinth sticks out of the face; the glazing sits flush in it. Both lit pieces -- the
      // glazing and the sign board -- are baked at the end of the unit, once the word has been
      // drawn: the board is lettered with it and the glazing shows the interior for that trade
      // (2026-09-15 night: a lookup on the word, so the interior still costs no rng draw).
      // Baking them here instead would force the draw earlier and move every shopfront on screen.
      bake(structures, unit, faceX + outward * .10, .30, z, .22, .60, depth);
      for (const edge of [-1, 1]) {
        bake(structures, unit, glassX, 1.24, z + edge * (glazing / 2 + .07), .09, 1.88, .14);
      }
      bake(structures, unit, glassX, .34, z, .10, .16, glazing + .3);
      // V-5: the glazed front was a single unbroken slab. Three mullions cut it into four equal
      // bays, a transom crosses them near the head, and the end bay becomes a recessed door with
      // its own threshold. Every piece reuses the same `unit` box into the existing Structures
      // batch, so this costs no draw call -- only triangles (8 boxes x 12 = 96 per shopfront).
      for (let bay = 1; bay <= 3; bay++) {
        bake(structures, unit, glassX, 1.24, z + glazing * (bay / 4 - .5), .07, 1.88, .12);
      }
      bake(structures, unit, glassX, 1.96, z, .08, .09, glazing);
      const doorZ = z + glazing * .375;
      bake(structures, unit, glassX - outward * .04, 1.14, doorZ, .05, 1.52, glazing * .25 - .12);
      bake(structures, unit, faceX + outward * .22, .13, doorZ, .34, .26, glazing * .25 + .04);
      // The lit sign board: lettered from the atlas now, so the two raised divider bars that used
      // to stand in for lettering are gone.
      const board = Math.min(3.2, glazing * .9);
      // The awning is the only overhang and it starts above head height.
      const awningDepth = .78;
      const awningX = faceX + outward * (awningDepth / 2 - .08);
      const plate = unit.clone().scale(awningDepth, .09, depth + .12);
      plate.rotateZ(outward > 0 ? -.14 : .14);
      plate.translate(awningX, 3.12, z);
      structures.push(plate.toNonIndexed());
      for (let stripe = 0; stripe < 5; stripe++) {
        const offset = -depth / 2 + .3 + stripe * (depth - .6) / 4;
        const slat = unit.clone().scale(awningDepth, .05, .16);
        slat.rotateZ(outward > 0 ? -.14 : .14);
        slat.translate(awningX, 3.19, z + offset);
        structures.push(slat.toNonIndexed());
      }
      bake(structures, unit, awningX, 2.86, z, .06, .5, .06);
      bake(structures, unit, faceX + outward * .10, 2.78, z, .18, .12, Math.min(3.4, glazing));
      // A doorstep: short enough to stay clear of the avenue corridor.
      bake(structures, unit, faceX + outward * .34, .07, z, .60, .14, depth * .42);
      // The interior is a lookup on the word, not a fresh draw: the loop's rng stream places every
      // unit, so one extra rng() here would re-roll all 172 frontages on screen.
      const glyphIndex = Math.floor(rng() * words.length), glazingIndex = atlas.glazingFor[glyphIndex];
      bake(fronts, unit, glassX, 1.24, z, .06, 1.72, glazing, atlas.glazing[glazingIndex]);
      bake(fronts, unit, faceX + outward * .14, 2.42, z, .05, .56, board, glyphStrip(glyphIndex, board));
      shops.push({
        sector: host.sector, face, x: faceX, z, width: depth, height: 3.3,
        signText: words[glyphIndex], glazing: glazingIndex, hostSign: sectorSign,
        host: { x: host.x, z: host.z, width: host.width, depth: host.depth, height: host.height, sector: host.sector },
        hostBounds: bounds,
      });
    }
  }
  // 2026-09-15 evening: the ±z faces used to be dead walls -- every shop sat on an
  // avenue-facing ±x face, which is exactly why the car-free cross streets read as empty
  // canyons from the street-level cameras. The same kit, rotated a quarter turn, now also
  // fronts the cross streets. Only faces within 6.2 units of a cross-street centreline qualify:
  // measured facades sit 4.11-4.20 out and pocket faces between rows 8.2+, so the test is
  // unambiguous. This loop runs after the avenue loop, so the shared rng stream leaves every
  // existing shopfront bit-identical. The doorstep is shallower (.26 vs .34) because the crab
  // walkers hold a lateral band of 2.50-3.10 from the centreline.
  for (const host of buildings) {
    const bounds = host.actualBounds;
    for (const face of [-1, 1]) {
      if (rng() > .8) continue;
      const faceZ = face > 0 ? bounds.max[2] : bounds.min[2];
      // 6.2 separates the two cases cleanly: real street facades sit 3.3-5.9 from a
      // cross-street centreline, pocket faces between rows 6.8+.
      if (![-48, -24, 0, 24, 48].some(street => Math.abs(faceZ - street) < 6.2)) continue;
      const outward = face;
      const depth = host.width * (.62 + rng() * .26), width = Math.min(4.6, host.depth * .82);
      const x = host.x + (rng() - .5) * Math.max(.2, (bounds.max[0] - bounds.min[0]) - depth);
      const glazing = width * .78;
      const glassZ = faceZ + outward * .06;
      bake(structures, unit, x, .30, faceZ + outward * .10, depth, .60, .22);
      for (const edge of [-1, 1]) {
        bake(structures, unit, x + edge * (glazing / 2 + .07), 1.24, glassZ, .14, 1.88, .09);
      }
      bake(structures, unit, x, .34, glassZ, glazing + .3, .16, .10);
      for (let bay = 1; bay <= 3; bay++) {
        bake(structures, unit, x + glazing * (bay / 4 - .5), 1.24, glassZ, .12, 1.88, .07);
      }
      bake(structures, unit, x, 1.96, glassZ, glazing, .09, .08);
      const doorX = x + glazing * .375;
      bake(structures, unit, doorX, 1.14, glassZ - outward * .04, glazing * .25 - .12, 1.52, .05);
      bake(structures, unit, doorX, .13, faceZ + outward * .22, glazing * .25 + .04, .26, .34);
      const board = Math.min(3.2, glazing * .9);
      const awningDepth = .78;
      const awningZ = faceZ + outward * (awningDepth / 2 - .08);
      const plate = unit.clone().scale(depth + .12, .09, awningDepth);
      plate.rotateX(outward > 0 ? .14 : -.14);
      plate.translate(x, 3.12, awningZ);
      structures.push(plate.toNonIndexed());
      for (let stripe = 0; stripe < 5; stripe++) {
        const offset = -depth / 2 + .3 + stripe * (depth - .6) / 4;
        const slat = unit.clone().scale(.16, .05, awningDepth);
        slat.rotateX(outward > 0 ? .14 : -.14);
        slat.translate(x + offset, 3.19, awningZ);
        structures.push(slat.toNonIndexed());
      }
      bake(structures, unit, x, 2.86, awningZ, .06, .5, .06);
      bake(structures, unit, x, 2.78, faceZ + outward * .10, Math.min(3.4, glazing), .12, .18);
      bake(structures, unit, x, .07, faceZ + outward * .26, depth * .42, .14, .52);
      // The interior is a lookup on the word, not a fresh draw: the loop's rng stream places every
      // unit, so one extra rng() here would re-roll all 172 frontages on screen.
      const glyphIndex = Math.floor(rng() * words.length), glazingIndex = atlas.glazingFor[glyphIndex];
      bake(fronts, unit, x, 1.24, glassZ, glazing, 1.72, .06, atlas.glazing[glazingIndex]);
      bake(fronts, unit, x, 2.42, faceZ + outward * .14, Math.min(3.2, glazing * .9), .56, .05, glyphStrip(glyphIndex, board));
      shops.push({
        sector: host.sector, face, axis: 'z', x, z: faceZ, width: depth, height: 3.3,
        signText: words[glyphIndex], glazing: glazingIndex, hostSign: Math.sign(host.x) || 1,
        host: { x: host.x, z: host.z, width: host.width, depth: host.depth, height: host.height, sector: host.sector },
        hostBounds: bounds,
      });
    }
  }
  function finish(list, material, name) {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(list), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  finish(structures, applySurfaceDetail(new THREE.MeshStandardMaterial({ color: '#2c3841', metalness: .5, roughness: .55 }), { scale: .55, strength: .8 }), 'DistrictShops-Structures');
  // White base colour: the colour lives in the atlas now, and its plain ground cell is the exact
  // #ffdca6 the flat material used to be, so any unlettered area comes out unchanged.
  finish(fronts, new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false }), 'DistrictShops-LitFronts');
  group.userData = { seed, shops, shopCount: shops.length,
    frontAtlas: { columns: atlas.columns, rows: atlas.rows, cell: atlas.cell, glyphCells: words.length, glazingCells: atlas.glazing.length, ground: atlas.ground },
    update() {} };
  return group;
}
