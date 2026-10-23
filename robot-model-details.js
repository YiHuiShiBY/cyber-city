import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One coloured geometry per existing shell batch: surface separation without
// extra materials, objects or draw calls. All authored dimensions are in the
// original robot's local frame, with +z facing forward.
const PALETTE = { armor: '#879da6', light: '#b9c8c9', edge: '#4c626d', frame: '#263743', rubber: '#141e25', lens: '#111f2a', copper: '#a28057' };
function finish(geometry, color = 'armor') {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  result.deleteAttribute('uv');
  const c = new THREE.Color(PALETTE[color] || color);
  const colors = new Float32Array(result.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}
function box(x, y, z, w, h, d, color = 'armor', rz = 0, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  return finish(g.translate(x, y, z), color);
}
function cylinder(x, y, z, r, length, color = 'frame', axis = 'y', segments = 12) {
  const g = new THREE.CylinderGeometry(r, r, length, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return finish(g.translate(x, y, z), color);
}
function strut(a, b, radius, color = 'edge', segments = 8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(radius, radius, direction.length(), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  g.translate(...start.add(end).multiplyScalar(.5).toArray());
  return finish(g, color);
}
// Octagonal perimeter with a shallow bevel at the top and bottom. Flat face
// normals keep manufactured edges readable without a large rounded-box mesh.
function armor(x, y, z, w, h, d, color = 'armor', bevel = .025) {
  const cut = Math.min(bevel, w / 5, h / 5, d / 5);
  const vertices = [], indices = [];
  const ring = (width, depth) => [
    [-width / 2 + cut, -depth / 2], [width / 2 - cut, -depth / 2],
    [width / 2, -depth / 2 + cut], [width / 2, depth / 2 - cut],
    [width / 2 - cut, depth / 2], [-width / 2 + cut, depth / 2],
    [-width / 2, depth / 2 - cut], [-width / 2, -depth / 2 + cut],
  ];
  const rings = [[w - cut * 2, d - cut * 2, -h / 2], [w, d, -h / 2 + cut], [w, d, h / 2 - cut], [w - cut * 2, d - cut * 2, h / 2]];
  for (const [rw, rd, height] of rings) for (const [px, pz] of ring(rw, rd)) vertices.push(x + px, y + height, z + pz);
  for (let level = 0; level < 3; level++) for (let i = 0; i < 8; i++) {
    const a = level * 8 + i, b = level * 8 + (i + 1) % 8, c = b + 8, e = a + 8;
    indices.push(a, e, b, b, e, c);
  }
  for (let i = 1; i < 7; i++) { indices.push(0, i, i + 1); indices.push(24, 24 + i + 1, 24 + i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  const flat = g.toNonIndexed(); flat.computeVertexNormals();
  return finish(flat, color);
}
function join(parts) {
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
function neon(parts) {
  const geometry = join(parts);
  // Instance tint remains the single source of each unit's neon colour.
  geometry.deleteAttribute('color');
  return geometry;
}

export function makeServiceRobotDetails() {
  const shell = [
    armor(0, .13, 0, .40, .18, .55, 'frame', .03),
    armor(0, .375, -.01, .39, .39, .47, 'armor', .035),
    armor(0, .59, -.015, .36, .08, .43, 'light', .015),
    // Front loading hatch, recessed gasket and small pull handle.
    box(0, .372, .23, .31, .282, .012, 'rubber'),
    armor(0, .38, .242, .282, .247, .012, 'light', .004),
    box(0, .46, .253, .092, .025, .014, 'frame'),
    box(0, .303, .253, .16, .006, .01, 'edge'),
    cylinder(0, .633, -.025, .049, .07, 'frame'),
    armor(0, .705, -.015, .32, .155, .295, 'light', .028),
    armor(0, .712, .142, .278, .098, .022, 'lens', .008),
    cylinder(-.082, .715, .158, .025, .009, 'edge', 'z'),
    cylinder(.082, .715, .158, .025, .009, 'edge', 'z'),
    box(0, .69, .16, .045, .008, .008, 'edge'),
    cylinder(0, .804, -.026, .047, .055, 'frame'),
    cylinder(0, .861, -.026, .047, .018, 'edge'),
    cylinder(0, .91, -.13, .012, .19, 'frame', 'y', 6),
    cylinder(0, 1.00, -.13, .016, .016, 'light', 'y', 8),
    // Ribbed rear cargo casing, hinges and bumper stay inside the old rack.
    armor(0, .425, -.278, .275, .23, .053, 'edge', .01),
    box(0, .46, -.307, .17, .014, .008, 'rubber'),
    box(0, .432, -.307, .17, .014, .008, 'rubber'),
    box(0, .404, -.307, .17, .014, .008, 'rubber'),
    armor(0, .168, .28, .385, .08, .055, 'rubber', .009),
  ];
  for (const side of [-1, 1]) {
    shell.push(armor(side * .205, .29, -.012, .036, .16, .35, 'edge', .008));
    shell.push(box(side * .2, .44, -.018, .01, .072, .13, 'frame'));
    // Exposed tire sidewalls and inset concentric hubs; no wheel exceeds x=.25.
    for (const z of [-.19, .19]) {
      shell.push(cylinder(side * .211, .081, z, .081, .073, 'rubber', 'x', 14));
      shell.push(cylinder(side * .248, .081, z, .049, .003, 'edge', 'x', 12));
      shell.push(cylinder(side * .25, .081, z, .023, .003, 'light', 'x', 10));
      shell.push(box(side * .251, .081, z, .002, .01, .083, 'frame'));
    }
  }
  return {
    shell: join(shell),
    neon: neon([
      cylinder(-.082, .715, .164, .014, .004, '#ffffff', 'z', 10),
      cylinder(.082, .715, .164, .014, .004, '#ffffff', 'z', 10),
      box(0, .82, -.026, .045, .023, .047),
      box(0, .541, .221, .17, .017, .012),
      box(0, .168, .3075, .27, .014, .005),
      box(-.225, .309, 0, .006, .017, .24), box(.225, .309, 0, .006, .017, .24),
      box(0, .369, -.311, .10, .016, .006),
    ]),
  };
}

export function makeBipedRobotDetails() {
  const body = [
    armor(0, .735, 0, .34, .21, .267, 'edge', .023),
    armor(0, .86, -.01, .265, .14, .245, 'frame', .02),
    armor(0, 1.069, -.016, .46, .328, .325, 'armor', .045),
    armor(0, 1.098, .15, .31, .229, .041, 'light', .014),
    armor(0, 1.085, .174, .14, .099, .016, 'frame', .008),
    box(0, .775, .147, .13, .043, .02, 'copper'),
    cylinder(0, 1.287, -.02, .056, .098, 'frame'),
    armor(0, 1.46, -.02, .299, .23, .279, 'light', .032),
    armor(0, 1.47, .126, .258, .079, .024, 'lens', .008),
    box(0, 1.392, .127, .107, .027, .015, 'edge'),
    cylinder(.092, 1.621, -.07, .012, .152, 'frame', 'y', 6),
    armor(0, 1.066, -.18, .299, .248, .044, 'frame', .011),
    box(0, 1.119, -.203, .204, .018, .008, 'edge'),
    box(0, 1.074, -.203, .204, .018, .008, 'edge'),
    box(0, 1.029, -.203, .204, .018, .008, 'edge'),
  ];
  for (const side of [-1, 1]) {
    body.push(cylinder(side * .262, 1.178, -.006, .077, .077, 'frame', 'x'));
    body.push(armor(side * .337, 1.197, .009, .145, .154, .179, 'light', .025));
    body.push(strut([side * .344, 1.144, .009], [side * .351, 1.017, .037], .045, 'frame'));
    body.push(cylinder(side * .354, 1.012, .029, .058, .107, 'edge', 'x'));
    body.push(armor(side * .357, .94, .034, .112, .134, .136, 'armor', .018));
    body.push(armor(side * .357, .851, .044, .084, .054, .10, 'frame', .014));
    body.push(box(side * .357, .842, .083, .049, .03, .034, 'edge'));
    body.push(cylinder(side * .158, .704, .005, .063, .065, 'frame', 'x'));
    body.push(cylinder(side * .156, 1.465, -.03, .041, .017, 'edge', 'x'));
  }
  return {
    body: join(body),
    neon: neon([
      box(-.067, 1.475, .14, .076, .022, .006), box(.067, 1.475, .14, .076, .022, .006),
      box(0, 1.085, .186, .093, .047, .005),
      box(-.339, 1.209, .104, .08, .017, .005), box(.339, 1.209, .104, .08, .017, .005),
      box(0, .924, .153, .22, .017, .006),
      box(-.1, 1.073, -.207, .018, .166, .006), box(.1, 1.073, -.207, .018, .166, .006),
      cylinder(.092, 1.701, -.07, .015, .014, '#ffffff', 'y', 6),
    ]),
  };
}

export function makeCrabRobotDetails() {
  const body = [
    armor(0, .473, -.035, .785, .199, .724, 'frame', .04),
    armor(0, .671, -.021, .956, .325, .804, 'armor', .073),
    armor(0, .887, -.08, .654, .224, .557, 'light', .051),
    armor(0, .708, .444, .434, .197, .238, 'edge', .031),
    armor(0, .76, .572, .405, .102, .029, 'lens', .01),
    armor(0, .706, -.523, .43, .22, .289, 'frame', .035),
    armor(0, .851, -.305, .35, .085, .209, 'edge', .014),
    cylinder(0, 1.032, .12, .038, .162, 'frame'),
    armor(0, 1.094, .12, .12, .089, .119, 'edge', .018),
    box(0, .995, -.075, .048, .005, .355, 'edge'),
  ];
  for (const side of [-1, 1]) {
    body.push(armor(side * .334, .721, -.033, .228, .181, .613, 'light', .029));
    body.push(cylinder(side * .435, .492, .21, .11, .116, 'frame', 'x'));
    body.push(strut([side * .471, .537, .231], [side * .571, .545, .58], .064, 'edge'));
    body.push(armor(side * .543, .55, .402, .133, .15, .291, 'armor', .025));
    body.push(strut([side * .49, .611, .274], [side * .578, .612, .613], .022, 'light'));
    body.push(cylinder(side * .595, .55, .632, .085, .119, 'frame', 'y'));
    // Two separated jaws on each arm create a readable working pincer.
    for (const finger of [-1, 1]) {
      const x = side * .606 + finger * .062;
      body.push(armor(x, .551, .737, .047, .115, .176, 'light', .013));
      body.push(armor(x - finger * .013, .551, .842, .054, .094, .088, 'edge', .014));
    }
    // Rear vents and belly hardware are modelled, rather than left as a solid box.
    body.push(cylinder(side * .117, .72, -.68, .059, .023, 'edge', 'z'));
    body.push(cylinder(side * .117, .72, -.69, .039, .007, 'rubber', 'z'));
    for (let i = 0; i < 3; i++) body.push(box(side * .467, .713, -.205 + i * .07, .014, .052, .017, 'frame'));
    body.push(cylinder(side * .398, .473, -.09, .08, .127, 'copper', 'x'));
  }
  return {
    body: join(body),
    neon: neon([
      box(-.118, .763, .591, .115, .038, .007), box(.118, .763, .591, .115, .038, .007),
      box(0, 1.097, .182, .064, .024, .006),
      box(0, .394, .329, .36, .018, .008),
      box(-.476, .737, .033, .006, .027, .207), box(.476, .737, .033, .006, .027, .207),
      box(-.606, .613, .649, .033, .006, .042), box(.606, .613, .649, .033, .006, .042),
      box(-.172, .859, -.645, .036, .02, .008), box(.172, .859, -.645, .036, .02, .008),
    ]),
  };
}

export function makeMechanicalLegDetails() {
  return join([
    cylinder(0, -.059, 0, .077, .159, 'frame', 'x'),
    armor(0, -.223, -.004, .156, .283, .17, 'armor', .021),
    strut([-.052, -.117, -.054], [-.052, -.384, -.021], .016, 'light'),
    strut([.052, -.117, -.054], [.052, -.384, -.021], .016, 'light'),
    cylinder(0, -.403, .009, .075, .168, 'frame', 'x'),
    cylinder(-.085, -.403, .009, .042, .01, 'edge', 'x'),
    cylinder(.085, -.403, .009, .042, .01, 'edge', 'x'),
    armor(0, -.534, .024, .127, .207, .151, 'edge', .018),
    armor(0, -.527, .105, .085, .141, .021, 'light', .008),
    cylinder(0, -.647, .032, .041, .124, 'frame', 'x'),
    armor(0, -.676, .068, .184, .062, .287, 'edge', .014),
    box(0, -.715, .068, .189, .02, .296, 'rubber'),
    box(0, -.665, .183, .15, .028, .064, 'light'),
    box(0, -.65, -.041, .106, .034, .054, 'frame'),
  ]);
}

export function colorLowRobotGeometry(geometry, color) {
  // Low detail vertices retain the former material colour after the common
  // material becomes white/vertex-coloured for the detailed body.
  const result = finish(geometry, color);
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

export function makeRobotDetailView(group, robots, meshes) {
  const cameraPosition = new THREE.Vector3();
  return function prepareView(camera) {
    if (!camera) return;
    camera.getWorldPosition(cameraPosition);
    group.worldToLocal(cameraPosition);
    const radius = 22 * Math.max(.1, camera.zoom || 1);
    const high = robots.some(robot => (robot.x - cameraPosition.x) ** 2 + (cameraPosition.y - .7) ** 2 + (robot.z - cameraPosition.z) ** 2 < radius * radius);
    const detailLevel = high ? 'high' : 'low';
    if (group.userData.detailLevel === detailLevel) return;
    for (const mesh of meshes) mesh.geometry = mesh.userData.detailGeometries[high ? 0 : 1];
    group.userData.detailLevel = detailLevel;
  };
}
