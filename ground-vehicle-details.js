import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Surface finishes are vertex colours so the existing fleet batches stay intact.
export function colorGroundGeometry(source, color = '#ffffff') {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.deleteAttribute('uv');
  const tint = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function builder() {
  const pieces = [];
  function add(source, color, x = 0, y = 0, z = 0, rotation = null) {
    if (rotation) source.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]);
    source.translate(x, y, z); pieces.push(colorGroundGeometry(source, color)); source.dispose();
  }
  return {
    geometry(source, color) { pieces.push(colorGroundGeometry(source, color)); },
    box(w, h, d, x, y, z, color, rotation) { add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rotation); },
    panel(w, h, x, y, z, color, rotation) { add(new THREE.PlaneGeometry(w, h), color, x, y, z, rotation); },
    cylinder(radius, height, x, y, z, color, rotation = null, segments = 10) {
      add(new THREE.CylinderGeometry(radius, radius, height, segments), color, x, y, z, rotation);
    },
    disc(radius, x, y, z, color, rotation = null, segments = 10) {
      add(new THREE.CircleGeometry(radius, segments), color, x, y, z, rotation);
    },
    loft(stations, color) {
      const vertices = [], indices = [];
      for (const [z, width, low, high] of stations) {
        const bevel = Math.min(.07, (high - low) * .15);
        for (const [x, y] of [[-width, low + bevel], [-width + bevel, low], [width - bevel, low], [width, low + bevel], [width, high - bevel], [width - bevel, high], [-width + bevel, high], [-width, high - bevel]]) vertices.push(x, y, z);
      }
      for (let ring = 0; ring < stations.length - 1; ring++) for (let i = 0; i < 8; i++) {
        const a = ring * 8 + i, b = ring * 8 + (i + 1) % 8; indices.push(a, b, a + 8, b, b + 8, a + 8);
      }
      for (let i = 1; i < 7; i++) { indices.push(0, i + 1, i); const last = (stations.length - 1) * 8; indices.push(last, last + i, last + i + 1); }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, color);
    },
    finish() {
      const geometry = mergeGeometries(pieces); pieces.forEach(piece => piece.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
    },
  };
}

export function makeBusDetails() {
  const shell = builder(), lamps = builder();
  const pale = '#d6e3e6', metal = '#8ea7b2', frame = '#263b49', rubber = '#15222c';
  // The lower skirt is interrupted around the original four wheels.
  shell.loft([[-2.65, .47, .48, 1.38], [-2.40, .575, .48, 1.44], [2.22, .575, .48, 1.44], [2.65, .49, .50, 1.38]], pale);
  shell.box(1.06, .25, 2.65, 0, .29, .05, frame);
  shell.box(1.06, .25, .68, 0, .29, 2.31, metal);
  shell.box(1.06, .25, .78, 0, .29, -2.26, metal);
  shell.box(1.06, .14, 4.90, 0, 1.50, 0, pale);
  shell.box(.78, .15, 1.60, 0, 1.62, -1.30, frame);
  shell.box(.53, .11, .78, 0, 1.615, .90, metal);
  shell.box(.18, .065, .70, 0, 1.60, -.02, frame);
  for (let index = 0; index < 7; index++) {
    shell.panel(.65, .07, 0, 1.70, -1.89 + index * .195, metal, [-Math.PI / 2, 0, 0]);
  }
  for (const side of [-1, 1]) {
    const outward = [0, side * Math.PI / 2, 0];
    // Window bays have separate glass and raised structural mullions.
    for (let index = 0; index < 5; index++) {
      const z = -1.45 + index * .70;
      lamps.panel(.61, .47, side * .592, 1.07, z, '#244b5b', outward);
      shell.box(.035, .56, .035, side * .592, 1.06, z - .335, metal);
      lamps.panel(.46, .027, side * .596, 1.285, z, '#87afbc', outward);
    }
    shell.box(.03, .075, 4.58, side * .597, .75, 0, metal);
    shell.box(.03, .095, 2.65, side * .60, .35, .05, pale);
    lamps.panel(4.56, .031, side * .618, .56, 0, '#73dddf', outward);
    lamps.panel(2.45, .033, side * .618, .25, .05, '#54afc6', outward);
    // A front doorway with a central seam, step and two dark leaves.
    shell.box(.043, 1.02, .82, side * .592, .91, 1.80, frame);
    lamps.panel(.70, .83, side * .617, .96, 1.80, '#274653', outward);
    shell.box(.025, .94, .028, side * .623, .94, 1.80, metal);
    shell.box(.046, .052, .83, side * .616, .405, 1.80, pale);
    for (const z of [-1.62, 1.72]) {
      shell.cylinder(.27, .12, side * .55, .27, z, rubber, [0, 0, Math.PI / 2]);
      shell.disc(.183, side * .615, .27, z, metal, outward);
      shell.disc(.108, side * .620, .27, z, frame, outward, 8);
      lamps.disc(.039, side * .624, .27, z, '#9cdfdd', outward, 8);
    }
    for (let index = 0; index < 4; index++) shell.panel(.048, .20, side * .609, .565, -2.35 + index * .13, frame, outward);
    shell.box(.31, .215, .07, side * .48, .52, 2.684, frame);
    lamps.panel(.30, .135, side * .48, .53, 2.72, '#d2f4ed');
    lamps.panel(.26, .14, side * .52, .62, -2.72, '#ed8165', [0, Math.PI, 0]);
  }
  lamps.panel(.99, .51, 0, 1.065, 2.674, '#284e61');
  shell.box(.035, .55, .025, 0, 1.065, 2.678, frame);
  lamps.panel(.90, .30, 0, 1.07, -2.674, '#244353', [0, Math.PI, 0]);
  shell.box(.79, .18, .035, 0, 1.385, 2.674, frame);
  for (let index = 0; index < 6; index++) lamps.panel(.062, .071, -.245 + index * .095, 1.385, 2.696, '#c0e7d8');
  shell.box(.73, .15, .035, 0, .32, 2.664, frame);
  for (let index = 0; index < 5; index++) shell.panel(.085, .087, -.245 + index * .122, .32, 2.685, metal);
  return { shell: shell.finish(), neon: lamps.finish() };
}

export function makeSkywayPodDetails({ body, glass, undercarriage, lights }) {
  const shell = builder(), cabin = builder(), chassis = builder(), lamps = builder();
  const contractedBody = body.clone().scale(.97, 1, 1);
  shell.geometry(contractedBody, '#d5e2e6'); contractedBody.dispose();
  const insetGlass = glass.clone(), glassPositions = insetGlass.attributes.position;
  // Keep the cabin foot and windscreens in place while lowering only the high
  // roof vertices. The existing exterior frame then sits above the glazing.
  for (let i = 0; i < glassPositions.count; i++) if (glassPositions.getY(i) > 1.1) glassPositions.setY(i, glassPositions.getY(i) - .03);
  insetGlass.computeVertexNormals(); cabin.geometry(insetGlass, '#305767'); insetGlass.dispose();
  chassis.geometry(undercarriage, '#213540');
  // Preserve the authored warm rear lamps and cool head lamps.
  const originalLights = lights.clone(); originalLights.deleteAttribute('uv');
  for (const side of [-1, 1]) {
    const outward = [0, side * Math.PI / 2, 0];
    for (const z of [-1.08, .15, 1.22]) {
      shell.box(.047, .235, .91, side * .815, .49, z, z < 0 ? '#7e9fac' : '#becfd5');
      shell.panel(.64, .035, side * .840, .42, z, '#273f4c', outward);
    }
    shell.box(.035, .06, 2.44, side * .684, 1.195, -.04, '#a8c0ca');
    for (const z of [-.78, .17, .85]) shell.box(.033, .405, .043, side * .681, 1.015, z, '#718f9d');
    chassis.box(.095, .12, 3.06, side * .725, .17, -.04, '#354f5c');
    for (const z of [-1.29, 1.30]) {
      chassis.cylinder(.205, .12, side * .61, .125, z, '#597886', null, 10);
      chassis.disc(.154, side * .61, .063, z, '#182d3c', [Math.PI / 2, 0, 0]);
      lamps.disc(.102, side * .61, .062, z, '#60c6d8', [Math.PI / 2, 0, 0]);
    }
    lamps.panel(2.69, .032, side * .837, .28, -.08, '#78d5dc', outward);
    lamps.panel(.39, .028, side * .704, .722, 1.20, '#a9e4df', outward);
    shell.box(.33, .026, .37, side * .39, .786, 2.0, '#91acb7', [.326, 0, 0]);
    for (let slot = 0; slot < 3; slot++) shell.box(.245, .013, .025, side * .39, .829 - slot * .0213, 1.91 + slot * .063, '#263d4b', [.326, 0, 0]);
  }
  for (const z of [-.77, .60]) shell.box(1.37, .032, .037, 0, 1.224, z, '#adc3ca');
  shell.box(.16, .024, .75, 0, 1.225, -.19, '#829fac');
  lamps.panel(.11, .29, 0, 1.239, -.22, '#66c1cf', [-Math.PI / 2, 0, 0]);
  shell.box(.57, .095, .032, 0, .30, 2.488, '#243d4b');
  for (let slot = 0; slot < 5; slot++) shell.panel(.060, .055, -.20 + slot * .1, .30, 2.507, '#94b3bc');
  shell.box(.53, .09, .036, 0, .29, -2.46, '#2b424e');
  const emissiveDetail = lamps.finish();
  const lightGeometry = mergeGeometries([originalLights, emissiveDetail]); originalLights.dispose(); emissiveDetail.dispose();
  lightGeometry.computeBoundingBox(); lightGeometry.computeBoundingSphere();
  return { body: shell.finish(), glass: cabin.finish(), undercarriage: chassis.finish(), lights: lightGeometry };
}

/** Factory previews start with full detail; the city opts into a nearby fleet. */
export function makeGroundVehicleDetailView(group, meshes, positions, range) {
  const eye = new THREE.Vector3(); let high = true;
  return camera => {
    camera.getWorldPosition(eye); group.worldToLocal(eye);
    const limit = range * Math.max(.01, camera.zoom || 1), near = positions().some(position =>
      Math.hypot(position.x - eye.x, position.y - eye.y, position.z - eye.z) < limit);
    if (near === high) return;
    for (const mesh of meshes) mesh.geometry = mesh.userData.detailGeometries[near ? 0 : 1];
    high = near; group.userData.detailLevel = high ? 'high' : 'low';
  };
}
