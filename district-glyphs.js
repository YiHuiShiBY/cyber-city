// Shared lettering atlas for every lit panel in the district.
//
// Two modules letter a lit surface now: the ground-floor shopfront boards (district-shops.js) and
// the light-box signs hanging off the street masts (district-streetglow.js). Both want the same
// warm ground and the same dark ink, and one 2048 x 512 canvas serves both, so the atlas lives
// here rather than being built twice.
//
// This module is deliberately inert: it reads no rng, touches no scene graph and exports no
// mutable state beyond one lazily built canvas. Importing it therefore cannot shift anybody's
// random stream, which is what lets district-shops.js keep its byte-for-byte frontage geometry.
import * as THREE from 'three';

export const GLYPH_COLUMNS = 16, GLYPH_ROWS = 4, GLYPH_CELL = 128;   // 2048 x 512
export const GLYPH_GROUND = '#ffdca6';
const GLYPH_INK = '#241a15';
// Four warm grounds cycled over the roster, so a run of units along one face never letters the same
// colour twice in a row.
const GLYPH_GROUNDS = ['#ffdca6', '#ffc078', '#f7a8c4', '#a9e6f2'];
// Row 3 is left unlettered on purpose. Cell (3, 15) is overpainted flat white and every lamp in the
// street-glow batch points its uv there: a lamp's colour is its own vertex tint, so it must be
// multiplied by white or the map would shade the lamp as well as the signs.
const LAMP_ROW = 3, LAMP_COLUMN = 15;
// The board is .56 tall, so a run of square glyphs wants one cell per .56 of width. Boards that
// are taller than that (the light boxes are .78) pass their own cell size.
const GLYPH_BOARD = .56;
export const SHOP_WORDS = ['茶', '麵', '電', '藥', '酒', '書', '鐵', '湯', '粥', '飯', '魚', '肉', '菜', '糕', '餅', '餃', '油', '米', '鹽', '醬', '醋', '糖', '煙', '布'];

// ---------------------------------------------------------------------------
// Shop interiors (2026-09-15 night).
//
// The glazed front built by district-shops.js is 1.72 units tall and up to 3.6 wide, at eye level,
// and it is unlit-bright (`MeshBasicMaterial`, toneMapped off): the largest and brightest surface a
// street-level camera sees. Until now it was a warm sheet with three faint stripes -- the last
// place in the district where the brightest thing on screen carried no information. Each trade now
// gets its own interior: dry-goods shelves, a noodle counter under hanging menus, a goods cabinet,
// a bottle wall, market crates, a pastry case.
//
// The variant a shop shows is a lookup on its own word (GLAZING_BY_WORD), never a fresh rng draw:
// the shopfront loop's rng stream decides where every unit stands, so one extra draw there would
// re-roll all 172 frontages. The grounds are a separate list from GLYPH_GROUNDS, so this pass
// cannot recolour a single lettered board.
//
// Scale: one cell is 128 px mapped onto ~1.72 tall, so 1 px is 1.3 cm vertically and ~2.3 cm
// across -- details are drawn for that, and vertical features read about twice as wide as tall.
const GLAZING_VARIANTS = 6, GLAZING_ROW = 2, GLAZING_COLUMN = 0;
// Variant 2's ground was deepened from #cfe3ee in the same night's contrast pass: its cabinet is
// drawn in whites, and white on that pale blue left the cell reading as a blank plate.
const GLAZING_GROUNDS = ['#ffdca6', '#ffc078', '#a8c3d4', '#f7a8c4', '#dce8c2', '#f2d3a4'];
// One variant per trade. Every word in SHOP_WORDS appears here; an unmapped word falls back to the
// shelves, which is the plainest of the six.
const GLAZING_BY_WORD = {
  '茶': 1, '麵': 1, '湯': 1, '粥': 1, '飯': 1,
  '魚': 4, '肉': 4, '菜': 4,
  '糕': 5, '餅': 5, '餃': 5,
  '電': 2, '藥': 2, '煙': 2, '布': 2,
  '酒': 3,
  '書': 0, '鐵': 0, '油': 0, '米': 0, '鹽': 0, '醬': 0, '醋': 0, '糖': 0,
};

function paintGlazing(context) {
  const ink = alpha => `rgba(92,58,30,${alpha})`;
  const cell = GLYPH_CELL;
  const fill = (x, y, w, h, style) => {
    context.fillStyle = style;
    context.fillRect(x * cell, y * cell, Math.max(1, w * cell), Math.max(1, h * cell));
  };
  // "Which jar is taller" detail, derived from the shelf and column indices rather than from rng:
  // the sheet has to come out identical on every load, and this module must stay inert.
  const wobble = (a, b) => ((a * 37 + b * 17) % 5) / 5;
  return variant => {
    fill(0, 0, 1, 1, GLAZING_GROUNDS[variant]);
    // Ceiling tube, back wall, floor. These three bands are what make the panel read as a room seen
    // through glass; without them any motif looks painted onto a plate.
    fill(0, .02, 1, .045, 'rgba(255,255,255,.55)');
    // The falloff under the tube is what reads as a lit room rather than a bright plate.
    fill(0, .066, 1, .055, 'rgba(255,255,255,.20)');
    fill(0, .072, 1, .012, ink(.20));
    fill(.04, .10, .92, .58, ink(.085));
    fill(0, .90, 1, .10, ink(.28));
    if (variant === 0) {
      // Dry goods and hardware: four shelf rows over a counter. The jars sit against a darker back
      // band -- on the cream ground alone a brown-on-cream jar reads as a smudge rather than a row.
      fill(.06, .15, .88, .62, ink(.10));
      for (let row = 0; row < 4; row++) {
        const base = .235 + row * .155;
        fill(.06, base, .88, .030, ink(.54));
        for (let col = 0; col < 9; col++) {
          fill(.08 + col * .093, base - .078, .05 + wobble(row, col) * .045, .075,
            ink(.36 + wobble(col, row) * .18));
        }
      }
      fill(.06, .78, .88, .11, ink(.48));
      fill(.06, .755, .88, .026, ink(.56));
    } else if (variant === 1) {
      // Cooked food: menus hanging over a lit counter, stools in front of it.
      for (const x of [.15, .41, .67]) {
        fill(x, .11, .085, .30, 'rgba(255,255,255,.62)');
        for (let line = 0; line < 5; line++) fill(x + .013, .135 + line * .052, .059, .015, ink(.46));
      }
      fill(.06, .56, .88, .07, 'rgba(255,248,230,.72)');
      fill(.06, .63, .88, .14, ink(.42));
      fill(.06, .605, .88, .026, ink(.52));
      for (const x of [.22, .48, .74]) fill(x, .79, .11, .075, ink(.44));
    } else if (variant === 2) {
      // Goods shop: a bright cabinet of stacked boxes, sold over a counter. Each row gets its own
      // rail and the three tones are spread wider: white on the pale ground alone measured as no
      // contrast at all (luma ratio 0.9941 -- the weakest of the six before this pass).
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const tone = (row * 5 + col) % 3;
          fill(.09 + col * .17, .17 + row * .18, .12, .105,
            tone === 0 ? 'rgba(255,255,255,.86)' : tone === 1 ? 'rgba(255,255,255,.46)' : ink(.52));
        }
        fill(.065, .155 + row * .18, .87, .022, ink(.46));
      }
      fill(.05, .72, .90, .028, 'rgba(255,255,255,.58)');
      fill(.05, .748, .90, .115, ink(.54));
    } else if (variant === 3) {
      // Bar: a two-tier wall of bottles under a pendant lamp.
      fill(.36, .095, .28, .016, ink(.44));
      fill(.44, .10, .12, .12, 'rgba(255,255,255,.28)');
      fill(.465, .112, .07, .09, 'rgba(255,255,255,.72)');
      for (let row = 0; row < 2; row++) {
        const base = .50 + row * .21;
        fill(.05, base, .90, .026, ink(.42));
        for (let col = 0; col < 13; col++) {
          const h = .055 + wobble(col, row + 3) * .06;
          fill(.07 + col * .068, base - h, .034, h, ink(.34 + wobble(row, col) * .18));
        }
      }
      fill(.05, .80, .90, .09, ink(.36));
    } else if (variant === 4) {
      // Fresh market: crates stacked on the left, a wet counter on the right.
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++)
        fill(.06 + col * .23, .46 + row * .17, .21, .15, ink(.28 + ((col + row) % 2) * .14));
      for (const x of [.58, .72, .86]) fill(x, .30, .09, .26, ink(.26));
      fill(.52, .58, .43, .05, 'rgba(255,250,232,.70)');
      fill(.52, .635, .43, .17, ink(.42));
    } else {
      // Pastry: a lit three-tier display case.
      for (let shelf = 0; shelf < 3; shelf++) {
        const base = .34 + shelf * .18;
        fill(.08, base, .84, .028, 'rgba(255,255,255,.52)');
        for (let col = 0; col < 7; col++) fill(.10 + col * .12, base - .075, .085, .07, ink(.30 + wobble(shelf, col) * .14));
      }
      fill(.08, .86, .84, .08, ink(.36));
    }
    // One pane of glass over the whole room: a highlight down the left jamb, a shade down the right.
    fill(.005, .02, .035, .86, 'rgba(255,255,255,.18)');
    fill(.962, .02, .033, .86, ink(.10));
  };
}

let cached = null;

/** The one atlas. Built on first use, shared by every caller afterwards. */
export function glyphAtlas() {
  if (!cached) cached = build(SHOP_WORDS);
  return cached;
}

function build(words) {
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_COLUMNS * GLYPH_CELL;
  canvas.height = GLYPH_ROWS * GLYPH_CELL;
  const context = canvas.getContext('2d');
  const rect = (column, row) => ({
    u0: column / GLYPH_COLUMNS, u1: (column + 1) / GLYPH_COLUMNS,
    v0: 1 - (row + 1) / GLYPH_ROWS, v1: 1 - row / GLYPH_ROWS,
  });
  // Unused cells stay ground-coloured, so an accidental sample is still a lit panel rather than a
  // black hole in the middle of a shopfront.
  context.fillStyle = GLYPH_GROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const slots = words.map((word, index) => {
    const column = index % GLYPH_COLUMNS, row = Math.floor(index / GLYPH_COLUMNS);
    context.save(); context.translate(column * GLYPH_CELL, row * GLYPH_CELL);
    context.fillStyle = GLYPH_GROUNDS[index % GLYPH_GROUNDS.length];
    context.fillRect(0, 0, GLYPH_CELL, GLYPH_CELL);
    context.fillStyle = GLYPH_INK; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = 'bold 84px "Microsoft YaHei", sans-serif';
    context.fillText(word, GLYPH_CELL / 2, GLYPH_CELL / 2 + 2, GLYPH_CELL - 34);
    // A rule under the glyph, so a multi-cell run reads as lettering rather than as blocks.
    context.fillRect(GLYPH_CELL * .16, GLYPH_CELL * .84, GLYPH_CELL * .68, 3);
    context.restore();
    return rect(column, row);
  });
  // The glazed fronts: one cell per trade, columns 0..5 of row 2.
  const paint = paintGlazing(context);
  const glazing = Array.from({ length: GLAZING_VARIANTS }, (unused, variant) => {
    const column = GLAZING_COLUMN + variant;
    context.save(); context.translate(column * GLYPH_CELL, GLAZING_ROW * GLYPH_CELL);
    paint(variant);
    context.restore();
    return rect(column, GLAZING_ROW);
  });
  // The lamp cell, and the white apron around it. A lamp's colour is its own vertex tint, so it has
  // to be multiplied by pure white or the map would shade the lamp as well as the signs -- and the
  // apron exists because a lamp is only a few pixels on screen, so the sampler reaches into the
  // neighbouring cells at that mip level. Everything touching cell (3, 15) is white, so what bleeds
  // in is white. Rows 2-3 from the first glazing-free column right are otherwise unused: the 24
  // glyphs fill rows 0-1 and the interiors take (2, 0)..(2, 5).
  context.fillStyle = '#ffffff';
  context.fillRect((GLAZING_COLUMN + GLAZING_VARIANTS) * GLYPH_CELL, GLAZING_ROW * GLYPH_CELL,
    (GLYPH_COLUMNS - GLAZING_COLUMN - GLAZING_VARIANTS) * GLYPH_CELL, (GLYPH_ROWS - GLAZING_ROW) * GLYPH_CELL);
  const lamp = rect(LAMP_COLUMN, LAMP_ROW);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return {
    texture, slots, glazing, lamp,
    // Which interior each word shows. Pure lookup, so a caller that must not move an rng stream can
    // index it with a word index it has already drawn.
    glazingFor: words.map(word => GLAZING_BY_WORD[word] ?? 0),
    columns: GLYPH_COLUMNS, rows: GLYPH_ROWS, cell: GLYPH_CELL,
    words, ground: GLYPH_GROUND,
  };
}

/**
 * The uv rect of one glyph cell. Pure: draws nothing, consumes nothing.
 * A caller that must not move an rng stream can derive its index however it likes and pass it in.
 */
export function glyphCell(index) {
  const list = glyphAtlas().slots;
  return list[((index % list.length) + list.length) % list.length];
}

/**
 * A run of consecutive glyph cells on one row, so a multi-character board reads as lettering.
 *
 * Only the cells the roster actually letters exist: 24 glyphs fill row 0 outright and row 1 only as
 * far as column 8. The run is clamped inside its own row and then slid back inside the filled span,
 * otherwise a board lettered near the end of row 1 shows one glyph and paints blank ground across
 * the rest of its width. Derived from the board size the caller already knows -- never from rng.
 */
export function glyphStrip(index, board, cell = GLYPH_BOARD) {
  const atlas = glyphAtlas();
  const row = Math.floor(index / GLYPH_COLUMNS);
  const filled = Math.min(GLYPH_COLUMNS, atlas.words.length - row * GLYPH_COLUMNS);
  const run = Math.max(1, Math.min(filled, 6, Math.round(board / cell)));
  const column = Math.min(index % GLYPH_COLUMNS, filled - run);
  return {
    u0: column / GLYPH_COLUMNS, u1: (column + run) / GLYPH_COLUMNS,
    v0: 1 - (row + 1) / GLYPH_ROWS, v1: 1 - row / GLYPH_ROWS,
  };
}

/**
 * Fold a uv rect into a geometry's existing 0..1 uv. All six faces of a box carry the same rect, so
 * one fold shows the cell on the outward face too -- the only face ever seen.
 */
export function foldUV(part, uv) {
  const source = part.getAttribute('uv');
  if (!source) return part;
  const mapped = new Float32Array(source.count * 2);
  for (let vertex = 0; vertex < source.count; vertex++) {
    mapped[vertex * 2] = uv.u0 + source.getX(vertex) * (uv.u1 - uv.u0);
    mapped[vertex * 2 + 1] = uv.v0 + source.getY(vertex) * (uv.v1 - uv.v0);
  }
  part.setAttribute('uv', new THREE.BufferAttribute(mapped, 2));
  return part;
}
