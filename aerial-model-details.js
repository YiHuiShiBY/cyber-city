import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All detail is baked into the existing instanced parts. A neutral material lets
// the surface colours carry the metal, rubber, clothing and faceplate finishes.
export function tintGeometry(geometry, color = '#ffffff') {
  const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  part.deleteAttribute('uv');
  const tint = new THREE.Color(color), colors = new Float32Array(part.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return part;
}

function finish(parts) {
  const result = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

function bevelBox(width, height, depth, bevel = .16) {
  const corners = [[-1, -1 + bevel], [-1 + bevel, -1], [1 - bevel, -1], [1, -1 + bevel], [1, 1 - bevel], [1 - bevel, 1], [-1 + bevel, 1], [-1, 1 - bevel]];
  const rings = [[-.5, .80], [-.5 + bevel * .5, 1], [.5 - bevel * .5, 1], [.5, .80]], vertices = [], indices = [];
  for (const [y, scale] of rings) for (const [x, z] of corners) vertices.push(x * width * .5 * scale, y * height, z * depth * .5 * scale);
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8; i++) {
    const a = ring * 8 + i, b = ring * 8 + (i + 1) % 8, c = a + 8, d = b + 8;
    indices.push(a, c, b, b, c, d);
  }
  for (let i = 1; i < 7; i++) { indices.push(0, i, i + 1); indices.push(24, 24 + i + 1, 24 + i); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function builder() {
  const parts = [];
  function add(geometry, color, x = 0, y = 0, z = 0, rotation = 0) {
    if (rotation) geometry.rotateX(rotation);
    geometry.translate(x, y, z);
    parts.push(tintGeometry(geometry, color)); geometry.dispose();
  }
  return {
    box(w, h, d, x, y, z, color, rotation = 0) { add(bevelBox(w, h, d), color, x, y, z, rotation); },
    hull(w, h, d, x, y, z, color) {
      const geometry = bevelBox(w, h, d), positions = geometry.attributes.position;
      // Slightly pinch the bow and stern while retaining the broad lower belly.
      for (let i = 0; i < positions.count; i++) {
        const along = positions.getZ(i) / d;
        positions.setX(i, positions.getX(i) * (1 - Math.max(0, along) * .55 - Math.max(0, -along - .2) * .3));
      }
      geometry.computeVertexNormals(); add(geometry, color, x, y, z);
    },
    strip(w, h, d, x, y, z, color = '#ffffff') { add(new THREE.BoxGeometry(w, h, d), color, x, y, z); },
    sphere(rx, ry, rz, x, y, z, color) { add(new THREE.SphereGeometry(1, 10, 7).scale(rx, ry, rz), color, x, y, z); },
    link(from, to, radius, color, radiusEnd = radius) {
      const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), delta = end.clone().sub(start);
      const geometry = new THREE.CylinderGeometry(radiusEnd, radius, delta.length(), 8);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
      const mid = start.add(end).multiplyScalar(.5); add(geometry, color, mid.x, mid.y, mid.z);
    },
    nozzle(x, y, z, radius, length, color) { add(new THREE.CylinderGeometry(radius * .92, radius, length, 12, 1, true), color, x, y, z, Math.PI / 2); },
    disc(x, y, z, radius, color) { add(new THREE.CircleGeometry(radius, 12), color, x, y, z, Math.PI); },
    finish() { return finish(parts); },
  };
}

export function makeFlyingBikeDetail() {
  const shell = builder(), neon = builder();
  const dark = '#202c39', metal = '#617e8c', fairing = '#426072', rubber = '#151e27', coat = '#70868c';
  // Slim, chamfered nose and a separate saddle make the rider's seating legible.
  shell.hull(.25, .18, .84, 0, -.015, .055, fairing);
  shell.box(.22, .15, .29, 0, .035, .50, metal, -.10);
  shell.box(.17, .065, .27, 0, .135, -.13, rubber);
  shell.box(.20, .13, .27, 0, .055, -.43, dark);
  shell.box(.15, .16, .17, 0, .165, .275, fairing, -.25);
  shell.box(.145, .08, .018, 0, .245, .325, '#193c4b', -.30);
  shell.link([-.19, .23, .31], [.19, .23, .31], .014, metal);
  for (const side of [-1, 1]) {
    // Twin side pods have front intakes and rear exhaust wells, not wheel shapes.
    shell.hull(.115, .18, .54, side * .145, -.115, -.28, dark);
    shell.box(.12, .07, .32, side * .145, -.012, -.31, metal);
    shell.nozzle(side * .145, -.12, -.51, .054, .12, metal);
    shell.disc(side * .145, -.12, -.575, .049, rubber);
    neon.disc(side * .145, -.12, -.582, .031, '#ffffff');
    shell.box(.082, .10, .02, side * .145, -.115, .001, rubber);
    for (const y of [-.143, -.113, -.083]) shell.strip(.072, .008, .012, side * .145, y, .016, '#7295a1');
    shell.link([side * .075, .04, -.02], [side * .192, -.035, .11], .015, metal);
    shell.box(.05, .035, .105, side * .182, -.024, .11, rubber);
    neon.strip(.014, .019, .38, side * .127, .038, .16);
    neon.strip(.06, .04, .014, side * .066, .08, .637);
    neon.strip(.035, .025, .014, side * .065, .07, -.57, '#ff7979');
  }
  // Hip, forward-leaning jacket, neck and helmet form one continuous pose.
  shell.box(.19, .105, .18, 0, .208, -.135, '#354957');
  shell.box(.222, .242, .164, 0, .366, -.045, coat, .24);
  shell.box(.145, .177, .02, 0, .368, -.137, '#3c535f', .24);
  shell.box(.014, .177, .009, 0, .365, .041, '#b5c4c5', .24);
  for (const side of [-1, 1]) shell.box(.062, .022, .01, side * .058, .405, .053, '#435963', .24);
  shell.link([0, .46, .015], [0, .513, .038], .034, '#202c38');
  shell.sphere(.084, .092, .084, 0, .59, .062, '#839ca4');
  shell.box(.148, .058, .027, 0, .6, .135, '#163e50', -.08);
  shell.box(.105, .032, .049, 0, .537, .119, '#293f4c');
  neon.strip(.11, .01, .012, 0, .616, .152, '#86c6d7');
  for (const side of [-1, 1]) {
    const shoulder = [side * .107, .45, -.023], elbow = [side * .15, .324, .13], hand = [side * .177, .242, .307];
    shell.sphere(.043, .044, .043, ...shoulder, coat);
    shell.link(shoulder, elbow, .039, coat, .032);
    shell.sphere(.033, .032, .033, ...elbow, dark);
    shell.link(elbow, hand, .030, coat, .025);
    shell.box(.05, .04, .053, ...hand, rubber, -.3);
    const hip = [side * .066, .202, -.1], knee = [side * .138, .121, .152], ankle = [side * .158, .017, .051];
    shell.link(hip, knee, .052, '#334957', .043);
    shell.sphere(.046, .041, .044, ...knee, '#57727d');
    shell.link(knee, ankle, .034, '#293c49', .027);
    shell.box(.064, .059, .128, side * .164, .006, .096, rubber, -.12);
    shell.strip(.063, .013, .106, side * .164, -.018, .098, '#607b86');
  }
  return { shell: shell.finish(), neon: neon.finish() };
}

export function makeCourierDetail() {
  const body = builder(), neon = builder(), legs = builder();
  const armor = '#668397', pale = '#a0bac3', frame = '#273c4d', joint = '#162734';
  body.box(.252, .165, .22, 0, .43, -.004, frame);
  body.box(.20, .07, .19, 0, .51, -.009, joint);
  body.box(.32, .226, .238, 0, .63, -.01, armor);
  body.box(.21, .147, .027, 0, .638, .118, pale);
  body.box(.064, .069, .027, 0, .652, .14, joint);
  body.link([0, .729, -.014], [0, .784, -.007], .048, joint);
  body.box(.222, .158, .193, 0, .848, -.006, pale);
  body.box(.184, .060, .019, 0, .856, .093, '#172e40');
  body.box(.108, .042, .023, 0, .794, .086, frame);
  // Compact delivery case, rear clasp and two shoulder straps remain inside the
  // previous backmost plane, leaving the authored rooftop clearance unchanged.
  body.box(.216, .223, .055, 0, .628, -.14, frame);
  body.box(.176, .15, .013, 0, .622, -.169, armor);
  body.box(.051, .061, .009, 0, .633, -.174, pale);
  body.link([.072, .707, -.105], [.072, .576, .115], .012, frame);
  body.link([-.072, .707, -.105], [-.072, .576, .115], .012, frame);
  body.link([.073, .93, -.045], [.083, 1.0, -.05], .009, frame);
  body.sphere(.018, .018, .018, .083, 1.014, -.05, pale);
  for (const side of [-1, 1]) {
    const shoulder = [side * .184, .687, -.006], elbow = [side * .232, .555, .023], wrist = [side * .225, .607, .123];
    body.sphere(.049, .053, .052, ...shoulder, joint);
    body.box(.089, .077, .107, side * .195, .704, -.011, pale);
    body.link(shoulder, elbow, .033, armor, .029);
    body.sphere(.037, .037, .037, ...elbow, joint);
    body.link(elbow, wrist, .028, armor, .024);
    body.box(.057, .064, .071, side * .224, .607, .128, frame, -.26);
    neon.strip(.024, .024, .016, side * .056, .856, .108);
    neon.strip(.038, .025, .011, side * .201, .709, .05);
    neon.strip(.012, .108, .014, side * .080, .628, -.172);
  }
  neon.strip(.045, .032, .012, 0, .65, .158);
  neon.strip(.157, .014, .011, 0, .454, .112);
  neon.strip(.018, .023, .018, .083, 1.014, -.05);
  // A bent mechanical knee, open shin strut and shaped toe read from every side.
  legs.sphere(.052, .053, .052, 0, -.014, 0, joint);
  legs.link([0, -.034, 0], [0, -.147, .026], .039, armor, .034);
  legs.box(.079, .082, .064, 0, -.079, .005, armor, -.13);
  legs.sphere(.043, .04, .042, 0, -.155, .023, joint);
  legs.box(.073, .061, .036, 0, -.15, .055, pale);
  legs.link([0, -.173, .025], [0, -.277, -.018], .027, frame, .024);
  legs.box(.071, .088, .047, 0, -.222, .004, armor, .34);
  legs.sphere(.028, .027, .03, 0, -.282, -.016, joint);
  legs.box(.105, .052, .165, 0, -.309, .031, frame);
  legs.box(.094, .024, .095, 0, -.303, .063, pale);
  legs.strip(.101, .014, .157, 0, -.334, .03, '#15232f');
  return { body: body.finish(), neon: neon.finish(), legs: legs.finish() };
}

/** Switch all batches together; inspectors keep their default full detail. */
export function makeDetailSelector(group, meshes, instances, getPosition) {
  const cameraPosition = new THREE.Vector3(), localPosition = new THREE.Vector3();
  let level = 'high';
  return camera => {
    camera.getWorldPosition(cameraPosition); group.worldToLocal(localPosition.copy(cameraPosition));
    const rangeSquared = (22 * Math.max(.01, camera.zoom || 1)) ** 2;
    const next = instances.some(instance => {
      const position = getPosition(instance);
      return (position.x - localPosition.x) ** 2 + (position.y - localPosition.y) ** 2 + (position.z - localPosition.z) ** 2 < rangeSquared;
    }) ? 'high' : 'low';
    if (next === level) return;
    for (const mesh of meshes) mesh.geometry = mesh.userData.detailGeometries[next === 'high' ? 0 : 1];
    level = next; group.userData.detailLevel = next;
  };
}
