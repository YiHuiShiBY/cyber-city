import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCourierDetail, tintGeometry, makeDetailSelector } from './aerial-model-details.js';

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
 * Rooftop couriers: small runners that cross a row of roofs and leap the gaps.
 *
 * A track is a ping-pong list of segments built from the sector's real footprints:
 * a run along each roof, then a parabolic hop (or a long hop over the secondary
 * street) to the next roof. The arc peaks above both roofs, so the two feet never
 * pass through a mass, and the run phase drives the same opposed leg swing as the
 * ground bipeds. Body, two leg sets and luminous parts are four draws in total.
 */
export function makeDistrictLeapers({ seed = 2049, buildings = [], perSector = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictLeapers';
  const rng = seeded(Number(seed) + 8821);
  const unit = new THREE.BoxGeometry(1, 1, 1);

  const rows = new Map();
  for (const building of buildings) {
    if (!rows.has(building.sector)) rows.set(building.sector, []);
    rows.get(building.sector).push(building);
  }
  const tracks = [];
  for (const [sector, list] of rows) {
    const centre = list.reduce((sum, b) => sum + b.x, 0) / list.length;
    const sides = new Map();
    for (const building of list) {
      const side = Math.sign(building.x - centre) || 1;
      if (!sides.has(side)) sides.set(side, []);
      sides.get(side).push(building);
    }
    for (const row of sides.values()) {
      row.sort((a, b) => a.z - b.z);
      if (row.length < 2) continue;
      const segments = [];
      for (let index = 0; index < row.length; index++) {
        const host = row[index];
        const roof = .15 + host.height;
        // Roof sets are inset by the style builders, so the run stays near the middle.
        const inset = host.depth * .3;
        const from = segments.length ? segments[segments.length - 1].to : null;
        segments.push({
          kind: 'run', x: host.x, y: roof,
          fromZ: host.z - host.depth / 2 + inset, toZ: host.z + host.depth / 2 - inset,
          host: { x: host.x, z: host.z, width: host.width, depth: host.depth, height: host.height, sector },
        });
        const next = row[index + 1];
        if (!next) break;
        const nextRoof = .15 + next.height;
        // An arc only clears both roofs when the height step is modest, so a row
        // with a large step simply ends there and the runner turns back.
        if (Math.abs(nextRoof - roof) > 4) break;
        const gapSpan = Math.abs(next.z - host.z) - (host.depth + next.depth) / 2;
        segments.push({
          kind: 'jump',
          x: host.x, y: roof,
          fromZ: host.z + host.depth / 2 - inset, toZ: next.z - next.depth / 2 + inset,
          arc: Math.max(1.4, Math.min(3.4, gapSpan * .42 + Math.abs(nextRoof - roof) * .5 + 1.1)),
          toX: next.x, toY: nextRoof,
          hosts: [
            { x: host.x, z: host.z, width: host.width, depth: host.depth, height: host.height, sector },
            { x: next.x, z: next.z, width: next.width, depth: next.depth, height: next.height, sector },
          ],
        });
      }
      if (segments.some(segment => segment.kind === 'jump')) tracks.push({ sector, segments });
    }
  }
  const runners = [];
  for (const track of tracks) {
    for (let index = 0; index < perSector; index++) {
      runners.push({
        track, phase: rng() * 60, speed: 2.6 + rng() * 1.4, pose: { x: 0, y: 0, z: 0, yaw: 0, running: true, segment: null },
        stride: 2.2 + rng() * .6, direction: index % 2 ? -1 : 1,
        neon: ['#8ff6ff', '#ff9be4', '#a6ffc8'][Math.floor(rng() * 3)],
      });
    }
  }
  // Ping-pong: walk the segment list forward, then backward, so a runner never
  // teleports back to the start of its row.
  function trackLength(track) {
    let total = 0;
    // Exactly the walk the sampler performs, doubled for the ping-pong return.
    for (const segment of track.segments) total += Math.abs(segment.toZ - segment.fromZ);
    return Math.max(1e-3, total * 2);
  }
  for (const track of tracks) track.length = trackLength(track);
  // The pose record lives on the runner and one scratch record serves every
  // back-sample, so a frame of rooftop motion allocates nothing.
  const backPose = { x: 0, y: 0, z: 0, yaw: 0, running: false, segment: null };
  function sample(runner, seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    const track = runner.track;
    const pose = runner.pose;
    let distance = ((runner.phase + time * runner.speed) % track.length + track.length) % track.length;
    const reverse = distance > track.length / 2;
    if (reverse) distance = track.length - distance;
    let index = 0, local = distance;
    while (index < track.segments.length - 1 && local > Math.abs(track.segments[index].toZ - track.segments[index].fromZ)) {
      local -= Math.abs(track.segments[index].toZ - track.segments[index].fromZ);
      index++;
    }
    const segment = track.segments[index];
    const span = segment.toZ - segment.fromZ;
    const u = THREE.MathUtils.clamp(Math.abs(span) < 1e-4 ? 0 : local / Math.abs(span), 0, 1);
    const travel = reverse ? 1 - u : u;
    const z = segment.fromZ + span * travel;
    if (segment.kind === 'run') {
      pose.x = segment.x; pose.y = segment.y; pose.z = z;
      pose.yaw = Math.atan2(0, span * (reverse ? -1 : 1));
      pose.running = true; pose.segment = segment;
      return pose;
    }
    pose.x = THREE.MathUtils.lerp(segment.x, segment.toX, travel);
    pose.y = THREE.MathUtils.lerp(segment.y, segment.toY, travel) + Math.sin(Math.PI * travel) * segment.arc;
    pose.z = z;
    const forward = Math.sign(span) * (reverse ? -1 : 1);
    pose.yaw = Math.atan2(segment.toX - segment.x, Math.abs(span)) + (forward < 0 ? Math.PI : 0);
    pose.running = false; pose.segment = segment;
    return pose;
  }
  function sampleBack(runner, seconds) { return Object.assign(backPose, sample(runner, seconds)); }

  function bake(geometry, x, y, z, sx, sy, sz) {
    return geometry.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed();
  }
  const HIP = .34;
  const bodyGeo = mergeGeometries([
    bake(unit, 0, .46, 0, .30, .24, .26),          // hips
    bake(unit, 0, .64, -.01, .38, .26, .30),       // chest
    bake(unit, 0, .84, -.01, .24, .20, .24),       // head
    bake(unit, -.25, .64, .02, .09, .28, .10),     // arms
    bake(unit, .25, .64, .02, .09, .28, .10),
    bake(unit, 0, .97, 0, .06, .14, .06),          // antenna
  ]);
  const legGeo = mergeGeometries([
    bake(unit, 0, -.12, 0, .11, .26, .13),
    bake(unit, 0, -.30, .03, .10, .16, .11),
    bake(unit, 0, -.40, .05, .12, .07, .20),
  ]);
  const neonGeo = mergeGeometries([
    bake(unit, 0, .85, .118, .24, .07, .05),       // eye
    bake(unit, 0, .66, .158, .18, .11, .05),       // chest core
    bake(unit, 0, .40, .105, .28, .05, .05),       // belt
    bake(unit, 0, .55, -.16, .10, .34, .04),       // spine strip
    bake(unit, -.25, .66, .04, .11, .05, .12),     // shoulder lamps
    bake(unit, .25, .66, .04, .11, .05, .12),
  ]);
  const slots = Math.max(1, runners.length);
  const detail = makeCourierDetail();
  const layers = [
    { name: 'Bodies', geometry: detail.body, lowGeometry: tintGeometry(bodyGeo, '#42556a'), material: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .55, roughness: .43 }) },
    { name: 'NeonParts', geometry: detail.neon, lowGeometry: tintGeometry(neonGeo), material: new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false }), tint: runner => runner.neon },
  ];
  bodyGeo.dispose(); neonGeo.dispose();
  for (const layer of layers) {
    const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, slots);
    mesh.name = `DistrictLeapers-${layer.name}`;
    mesh.userData.detailGeometries = [layer.geometry, layer.lowGeometry];
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (layer.tint) {
      runners.forEach((runner, index) => mesh.setColorAt(index, new THREE.Color(layer.tint(runner))));
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    layer.mesh = mesh;
  }
  const lowLeg = tintGeometry(legGeo, '#36485a');
  legGeo.dispose(); lowLeg.computeBoundingBox();
  const legMeshes = [0, 1].map(side => {
    const mesh = new THREE.InstancedMesh(detail.legs, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .56, roughness: .46 }), slots);
    mesh.name = `DistrictLeapers-Legs${side}`;
    mesh.userData.detailGeometries = [detail.legs, lowLeg];
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });

  // Motion streaks: one quad per runner, stretched along its recent velocity and
  // faded towards the tail, so the arc of a jump leaves a visible smear.
  const streakQuad = new THREE.PlaneGeometry(1, 1);
  const streakGeometry = new THREE.InstancedBufferGeometry();
  streakGeometry.index = streakQuad.index;
  streakGeometry.setAttribute('position', streakQuad.getAttribute('position'));
  streakGeometry.setAttribute('uv', streakQuad.getAttribute('uv'));
  streakGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  streakGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  streakGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2));
  streakGeometry.setAttribute('aAngles', new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2));
  streakGeometry.instanceCount = slots;
  const streakMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aSize,aAngles;varying vec2 vUv;varying vec3 vColor;
      void main(){
        vUv=uv;vColor=aColor;
        // Local x spans the width, local y runs along the velocity direction.
        float cy=cos(aAngles.x),sy=sin(aAngles.x),cp=cos(aAngles.y),sp=sin(aAngles.y);
        // yaw is measured from +z, pitch lifts the streak along the jump arc.
        vec3 along=vec3(sy*cp,sp,cy*cp);
        vec3 across=vec3(cy,0.,-sy);
        vec3 world=aSite+across*(position.x*aSize.x)+along*(position.y*aSize.y);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
      }`,
    fragmentShader: `varying vec2 vUv;varying vec3 vColor;
      void main(){
        float tail=1.-vUv.y;
        float alpha=tail*tail*.30*(1.-smoothstep(.22,.5,abs(vUv.x-.5)));
        gl_FragColor=vec4(vColor,alpha);
      }`,
  });
  const streak = new THREE.Mesh(streakGeometry, streakMaterial);
  streak.name = 'DistrictLeapers-Streaks';
  streak.frustumCulled = false;
  streak.renderOrder = 4;
  group.add(streak);
  const streakSites = streakGeometry.getAttribute('aSite'), streakColors = streakGeometry.getAttribute('aColor');
  const streakSizes = streakGeometry.getAttribute('aSize'), streakAngles = streakGeometry.getAttribute('aAngles');
  runners.forEach((runner, index) => {
    const color = new THREE.Color(runner.neon);
    streakColors.setXYZ(index, color.r, color.g, color.b);
  });
  streakColors.needsUpdate = true;

  const yUp = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const yawQ = new THREE.Quaternion(), legQ = new THREE.Quaternion(), outQ = new THREE.Quaternion(), torsoQ = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  const hipOffset = new THREE.Vector3();
  const halfWidth = .24, halfLength = .3;
  let lastSeconds = 0;
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    lastSeconds = time;
    for (const [index, runner] of runners.entries()) {
      const pose = sample(runner, time);
      const swing = pose.running ? Math.sin(time * runner.stride * 3 + runner.phase) * .5 : -.55;
      runner.x = pose.x; runner.y = pose.y; runner.z = pose.z;
      yawQ.setFromAxisAngle(yUp, pose.yaw);
      // A gentle lean around the hip makes the fixed bent arms read as a compact
      // running/jumping pose without adding two instanced draw calls per runner.
      const lean = pose.running ? .045 + Math.abs(swing) * .025 : .09;
      torsoQ.setFromAxisAngle(xAxis, lean);
      outQ.copy(yawQ).multiply(torsoQ);
      hipOffset.set(0, HIP * (1 - Math.cos(lean)), -HIP * Math.sin(lean)).applyQuaternion(yawQ);
      position.set(pose.x + hipOffset.x, pose.y + hipOffset.y, pose.z + hipOffset.z);
      matrix.compose(position, outQ, scale.set(1, 1, 1));
      for (const layer of layers) layer.mesh.setMatrixAt(index, matrix);
      position.set(pose.x, pose.y, pose.z);
      for (const [side, mesh] of legMeshes.entries()) {
        const legAngle = side === 0 ? swing : -swing;
        legQ.setFromAxisAngle(xAxis, legAngle);
        outQ.copy(yawQ).multiply(legQ);
        const bounds = mesh.geometry.boundingBox;
        const s = Math.sin(legAngle), c = Math.cos(legAngle);
        const bottom = HIP + bounds.min.y * c - (s > 0 ? bounds.max.z : bounds.min.z) * s;
        const groundLift = pose.running ? Math.max(0, -bottom) : 0;
        hipOffset.set(side === 0 ? -.13 : .13, HIP + groundLift, 0).applyQuaternion(yawQ);
        matrix.compose(position.set(pose.x + hipOffset.x, pose.y + hipOffset.y, pose.z + hipOffset.z), outQ, scale.set(1, 1, 1));
        mesh.setMatrixAt(index, matrix);
      }
      // The streak spans the ground the courier covered over the last fraction of
      // a second, which during a hop is a slanted smear rather than a flat one.
      const back = sampleBack(runner, time - .22);
      const dx = pose.x - back.x, dy = pose.y - back.y, dz = pose.z - back.z;
      const length = Math.hypot(dx, dy, dz);
      streakSites.setXYZ(index, (pose.x + back.x) / 2, (pose.y + back.y) / 2, (pose.z + back.z) / 2);
      streakSizes.setXY(index, .34, Math.max(.4, length * 1.25));
      streakAngles.setXY(index, Math.atan2(dx, dz), length > 1e-4 ? Math.asin(THREE.MathUtils.clamp(dy / length, -1, 1)) : 0);
    }
    for (const layer of layers) layer.mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of legMeshes) mesh.instanceMatrix.needsUpdate = true;
    streakSites.needsUpdate = true; streakSizes.needsUpdate = true; streakAngles.needsUpdate = true;
  }
  update(0);
  const selectDetail = makeDetailSelector(group, [...layers.map(layer => layer.mesh), ...legMeshes], runners, runner => runner);
  function prepareView(camera) {
    const previousLevel = group.userData.detailLevel;
    selectDetail(camera);
    // Each leg length has its own ground offset. Rebuild its matrix at the same
    // animation time even when the city is paused and only the camera has moved.
    if (previousLevel !== group.userData.detailLevel) update(lastSeconds);
  }
  group.userData = {
    seed, runners, runnerCount: runners.length, tracks, trackCount: tracks.length,
    halfWidth, halfLength, streak, meshes: layers.length + legMeshes.length + 1, sample, update,
    prepareView, detailLevel: 'high',
  };
  return group;
}
