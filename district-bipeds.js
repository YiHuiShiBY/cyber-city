import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBipedRobotDetails, makeCrabRobotDetails, makeMechanicalLegDetails, colorLowRobotGeometry, makeRobotDetailView } from './robot-model-details.js';

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
 * Two-legged ground machines in two shapes.
 *
 * `bot` units are the human-sized glowing machines that patrol the cross streets.
 * `crab` units are the heavy walkers: a wide carapace, claws forward and two long
 * splayed legs. Both shapes reuse one leg geometry and one pair of leg meshes — a
 * crab leg is the same limb under a taller scale and an outward roll — so the whole
 * contingent costs six draws: two bodies, two neon sets and the shared leg pair.
 */
export function makeDistrictBipeds({ seed = 2049, units = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictBipeds';
  const rng = seeded(Number(seed) + 2251);
  const unit = new THREE.BoxGeometry(1, 1, 1);

  const robots = [];
  for (const entry of units) {
    const kind = entry.kind === 'crab' ? 'crab' : 'bot';
    const scale = entry.scale ?? 1;
    const count = entry.count ?? 1;
    for (let index = 0; index < count; index++) {
      const direction = entry.direction ?? 1;
      const palette = kind === 'crab' ? ['#ffc46b', '#ff9a6b', '#e2ff8f'] : ['#7df0ff', '#ff8fd8', '#9dffc4', '#ffc46b'];
      robots.push({
        kind, route: entry.route, static: !!entry.static, scale, direction, pos: { x: 0, z: 0 },
        phase: (entry.phase ?? rng() * 20) + index * (entry.spacing ?? 30),
        speed: (entry.speed ?? 1.1) * (1 + (rng() - .5) * .06),
        stride: (kind === 'crab' ? 2.1 : 1.5) + rng() * .5,
        neon: palette[Math.floor(rng() * palette.length)],
        yaw: entry.route && entry.route.axis === 'x'
          ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (direction > 0 ? 0 : Math.PI),
        x: entry.route ? entry.route.offset : 0, z: 0,
      });
    }
  }

  function bake(geometry, x, y, z, sx, sy, sz, rotateX = 0, rotateZ = 0) {
    const part = geometry.clone().scale(sx, sy, sz);
    if (rotateX) part.rotateX(rotateX);
    if (rotateZ) part.rotateZ(rotateZ);
    part.translate(x, y, z);
    return part.toNonIndexed();
  }
  // Local frame: +z forward, origin at the ground under the hips.
  const botBody = mergeGeometries([
    bake(unit, 0, .78, 0, .40, .30, .30),          // pelvis
    bake(unit, 0, 1.06, -.01, .52, .34, .36),      // chest
    bake(unit, 0, 1.30, -.02, .30, .16, .26),      // collar
    bake(unit, 0, 1.46, -.02, .34, .26, .32),      // head
    bake(unit, -.36, 1.05, .02, .13, .40, .13),    // arms
    bake(unit, .36, 1.05, .02, .13, .40, .13),
    bake(unit, 0, 1.62, 0, .10, .18, .10),         // antenna
  ]);
  // 2026-09-15 evening: at street distance the dark shells used to read as anonymous boxes,
  // so every neon part got wider and both shells now carry a soft self-light of their own.
  const botNeon = mergeGeometries([
    bake(unit, 0, 1.47, .155, .34, .08, .04),      // sensor eye
    bake(unit, 0, 1.08, .195, .26, .13, .04),      // chest core
    bake(unit, -.36, 1.26, .02, .18, .07, .18),    // shoulder lights
    bake(unit, .36, 1.26, .02, .18, .07, .18),
    bake(unit, 0, .95, .13, .44, .07, .05),        // waist strip
    bake(unit, 0, 1.08, -.19, .22, .30, .04),      // back strip
  ]);
  // The crab walker: a wide low carapace, claws forward, a lit eye band and a
  // sensor mast. Its hips sit lower and wider, and the shared leg mesh is scaled
  // long and rolled outward, which is what gives it the splayed crab stance.
  const crabBody = mergeGeometries([
    bake(unit, 0, .66, 0, .98, .40, .84),                    // carapace
    bake(unit, 0, .90, -.06, .70, .24, .60),                 // crown
    bake(unit, 0, .40, 0, .80, .16, .72),                    // belly plate
    bake(unit, 0, .72, -.52, .46, .26, .30, .22),            // rear housing
    bake(unit, 0, .74, .46, .40, .22, .26),                  // face
    bake(unit, -.52, .54, .40, .20, .18, .54, 0, .30),       // claw arms
    bake(unit, .52, .54, .40, .20, .18, .54, 0, -.30),
    bake(unit, -.62, .54, .72, .16, .14, .30, 0, .18),       // pincers
    bake(unit, .62, .54, .72, .16, .14, .30, 0, -.18),
    bake(unit, 0, 1.02, .12, .12, .24, .12),                 // sensor mast
  ]);
  const crabNeon = mergeGeometries([
    bake(unit, 0, .76, .60, .54, .16, .05),        // eye band
    bake(unit, 0, .97, .12, .12, .10, .12),        // mast lamp
    bake(unit, 0, .26, 0, .86, .08, .78),          // underglow
    bake(unit, -.64, .54, .88, .18, .15, .06),     // pincer tips
    bake(unit, .64, .54, .88, .18, .15, .06),
    bake(unit, -.44, .70, -.30, .07, .24, .36),    // flank strips
    bake(unit, .44, .70, -.30, .07, .24, .36),
  ]);
  // Each leg hangs from its own hip origin, so a hip rotation swings the whole limb.
  const legGeo = mergeGeometries([
    bake(unit, 0, -.22, 0, .17, .44, .19),
    bake(unit, 0, -.53, .02, .14, .26, .16),
    bake(unit, 0, -.68, .07, .19, .09, .30),
  ]);
  const botDetails = makeBipedRobotDetails(), crabDetails = makeCrabRobotDetails();
  const detailedLeg = makeMechanicalLegDetails();
  const lowLeg = colorLowRobotGeometry(legGeo, '#31424f');
  // Both leg meshes have a flat sole. Cache its actual vertices instead of
  // using the entire leg's bounding box, whose empty corners overestimate
  // ground penetration as the leg swings. Four support points per detail level
  // are enough for the existing hip swing and crab roll ranges.
  const soleSupports = new Map([detailedLeg, lowLeg].map(geometry => {
    geometry.computeBoundingBox();
    const positions = geometry.getAttribute('position'), points = new Map();
    const bottom = geometry.boundingBox.min.y;
    for (let i = 0; i < positions.count; i++) {
      if (Math.abs(positions.getY(i) - bottom) > 1e-6) continue;
      const point = [positions.getX(i), positions.getY(i), positions.getZ(i)];
      points.set(point.join(','), point);
    }
    return [geometry, [...points.values()]];
  }));
  const shapes = {
    // Short thick legs under a squat carapace: the foot must land on the ground, so the
    // vertical leg scale is tied to the crab's hip height rather than to its overall size.
    crab: { body: crabDetails.body, neon: crabDetails.neon, lowBody: colorLowRobotGeometry(crabBody, '#3a4c5c'), lowNeon: crabNeon, hip: .58, legScale: [1.25, .80, 1.25], legRoll: .34, legHalf: .46, swing: .30, list: [] },
    bot: { body: botDetails.body, neon: botDetails.neon, lowBody: colorLowRobotGeometry(botBody, '#3a4c5c'), lowNeon: botNeon, hip: .62, legScale: [1, 1, 1], legRoll: 0, legHalf: .19, swing: .42, list: [] },
  };
  robots.forEach(robot => shapes[robot.kind].list.push(robot));
  for (const [kind, shape] of Object.entries(shapes)) {
    for (const [name, geometry] of [['Bodies', shape.body], ['NeonParts', shape.neon]]) {
      const mesh = new THREE.InstancedMesh(geometry, name === 'Bodies'
        ? new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .62, roughness: .4, emissive: '#16394a', emissiveIntensity: .9 })
        : new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), Math.max(1, shape.list.length));
      mesh.name = `DistrictBipeds-${name}-${kind}`;
      mesh.userData.detailGeometries = [geometry, name === 'Bodies' ? shape.lowBody : shape.lowNeon];
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      if (name === 'NeonParts') {
        shape.list.forEach((robot, index) => mesh.setColorAt(index, new THREE.Color(robot.neon)));
        mesh.instanceColor.needsUpdate = true;
      }
      group.add(mesh);
      shape[name === 'Bodies' ? 'bodyMesh' : 'neonMesh'] = mesh;
    }
    shape.list.forEach((robot, index) => { robot.index = index; });
  }
  // Left and right legs get their own instanced mesh so they can swing in opposition.
  const legMeshes = [0, 1].map(side => {
    const mesh = new THREE.InstancedMesh(detailedLeg, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .58, roughness: .44, emissive: '#12293a', emissiveIntensity: .8 }), Math.max(1, robots.length));
    mesh.name = `DistrictBipeds-Legs${side}`;
    mesh.userData.detailGeometries = [detailedLeg, lowLeg];
    // Contact translation scales with route fade, just like the leg geometry;
    // the inspection catalogue restores both when showing an unfaded unit.
    mesh.userData.fadeTranslationY = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
  // One additive ground pool under the whole fleet -- the same trick the district's rolling
  // StreetRobots use, so the walkers read as lit machines at overview distance too. The whole
  // contingent pays a single extra draw for it.
  const glowQuad = new THREE.PlaneGeometry(1, 1);
  glowQuad.rotateX(-Math.PI / 2);
  const fleetSlots = Math.max(1, robots.length);
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.index = glowQuad.index;
  glowGeometry.setAttribute('position', glowQuad.getAttribute('position'));
  glowGeometry.setAttribute('uv', glowQuad.getAttribute('uv'));
  glowGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(fleetSlots * 3), 3));
  glowGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(fleetSlots * 2), 2));
  glowGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(fleetSlots * 3), 3));
  glowGeometry.instanceCount = fleetSlots;
  const glowMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aSize;varying vec2 vUv;varying vec3 vColor;
      void main(){vUv=uv;vColor=aColor;vec3 p=aSite+vec3(position.x*aSize.x,0.,position.z*aSize.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vColor;
      void main(){vec2 q=(vUv-.5)*2.;float glow=exp(-dot(q,q)*2.8)*(1.-smoothstep(.48,1.,length(q)));gl_FragColor=vec4(vColor,glow*.22);
      #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = 'DistrictBipeds-GroundGlow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  group.add(glow);
  const glowSites = glowGeometry.getAttribute('aSite'), glowSizes = glowGeometry.getAttribute('aSize'), glowColors = glowGeometry.getAttribute('aColor');
  robots.forEach((robot, index) => {
    const color = new THREE.Color(robot.neon);
    glowColors.setXYZ(index, color.r, color.g, color.b);
  });
  glowColors.needsUpdate = true;

  const halfWidth = .52, halfLength = .55;
  function samplePosition(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0, pos = this.pos;
    if (this.static) { pos.x = this.x; pos.z = this.z; return pos; }
    const route = this.route;
    const along = route.low + ((((this.phase + this.direction * t * this.speed) % route.length) + route.length) % route.length);
    if (route.axis === 'x') { pos.x = along; pos.z = route.offset; } else { pos.x = route.offset; pos.z = along; }
    return pos;
  }
  const yUp = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const yawQ = new THREE.Quaternion(), legQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion(), outQ = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const hipOffset = new THREE.Vector3();
  let frameTime = 0;
  robots.forEach(robot => { robot.slot = robots.indexOf(robot); });
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    frameTime = time;
    for (const robot of robots) {
      const shape = shapes[robot.kind];
      const point = samplePosition.call(robot, time);
      let fade = 1;
      if (!robot.static && robot.route) {
        const along = robot.route.axis === 'x' ? point.x : point.z;
        const local = along - robot.route.low;
        fade = THREE.MathUtils.smoothstep(Math.min(local, robot.route.length - local), 0, robot.route.fade ?? 3.4);
      }
      robot.x = point.x; robot.z = point.z; robot.fade = fade;
      // Stride phase comes from ground distance, so the gait matches the speed.
      const travelled = robot.static ? 0 : robot.direction * time * robot.speed;
      const cycle = travelled * robot.stride + robot.phase;
      const swing = robot.static ? Math.sin(time * 1.6 + robot.phase) * .12 : Math.sin(cycle) * shape.swing;
      const bob = robot.static ? 0 : Math.abs(Math.cos(cycle)) * .045;
      // A crab also rocks slightly on its two legs, which reads as scuttling.
      const rock = robot.kind === 'crab' && !robot.static ? Math.sin(cycle) * .07 : 0;
      yawQ.setFromAxisAngle(yUp, robot.yaw);
      if (rock) yawQ.multiply(rollQ.setFromAxisAngle(zAxis, rock));
      scale.setScalar(robot.scale * fade);
      position.set(point.x, bob * robot.scale, point.z);
      matrix.compose(position, yawQ, scale);
      shape.bodyMesh.setMatrixAt(robot.index, matrix);
      shape.neonMesh.setMatrixAt(robot.index, matrix);
      for (const [side, mesh] of legMeshes.entries()) {
        legQ.setFromAxisAngle(xAxis, side === 0 ? swing : -swing);
        // Reset on every leg; the previous crab's roll must not tilt a bot.
        rollQ.setFromAxisAngle(zAxis, side === 0 ? -shape.legRoll : shape.legRoll);
        outQ.copy(yawQ).multiply(rollQ).multiply(legQ);
        hipOffset.set(side === 0 ? -shape.legHalf : shape.legHalf, shape.hip, 0).multiplyScalar(robot.scale).applyQuaternion(yawQ);
        scale.set(robot.scale * fade * shape.legScale[0], robot.scale * fade * shape.legScale[1], robot.scale * fade * shape.legScale[2]);
        matrix.compose(position.set(point.x + hipOffset.x, hipOffset.y + bob * robot.scale, point.z + hipOffset.z), outQ, scale);
        // Slide only the telescoping leg chain inside its hip housing. The
        // route, body pose and stride timing stay unchanged, while the visible
        // sole reaches the road rather than disappearing beneath it.
        const elements = matrix.elements;
        let lowest = Infinity;
        for (const [x, y, z] of soleSupports.get(mesh.geometry)) {
          lowest = Math.min(lowest, elements[1] * x + elements[5] * y + elements[9] * z + elements[13]);
        }
        elements[13] -= lowest;
        mesh.setMatrixAt(robot.slot, matrix);
      }
      glowSites.setXYZ(robot.slot, point.x, .05, point.z);
      const wide = robot.kind === 'crab';
      glowSizes.setXY(robot.slot, (wide ? 1.5 : 1.3) * robot.scale * fade, (wide ? 1.05 : .85) * robot.scale * fade);
    }
    for (const shape of Object.values(shapes)) {
      shape.bodyMesh.instanceMatrix.needsUpdate = true;
      shape.neonMesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of legMeshes) mesh.instanceMatrix.needsUpdate = true;
    glowSites.needsUpdate = true; glowSizes.needsUpdate = true;
  }
  update(0);
  const updateDetail = makeRobotDetailView(group, robots, [...Object.values(shapes).flatMap(shape => [shape.bodyMesh, shape.neonMesh]), ...legMeshes]);
  function prepareView(camera) {
    const previous = group.userData.detailLevel;
    updateDetail(camera);
    // A paused scene still changes geometry when its camera moves. Reuse the
    // exact saved animation time so the new sole also lands on the road.
    if (group.userData.detailLevel !== previous) update(frameTime);
  }
  group.userData = {
    seed, robots, robotCount: robots.length, units, halfWidth, halfLength, shapes, legMeshes, glow,
    crabCount: shapes.crab.list.length, botCount: shapes.bot.list.length,
    bodyMeshes: [shapes.crab.bodyMesh, shapes.bot.bodyMesh],
    neonMeshes: [shapes.crab.neonMesh, shapes.bot.neonMesh],
    meshes: group.children.length,
    samplePosition: (robot, seconds) => samplePosition.call(robot, seconds), update,
    detailLevel: 'high', prepareView,
  };
  return group;
}
