import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeServiceRobotDetails, colorLowRobotGeometry, makeRobotDetailView } from './robot-model-details.js';
import { colorGroundGeometry, makeBusDetails, makeGroundVehicleDetailView } from './ground-vehicle-details.js';

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
 * Sidewalk vending kiosks plus the rolling street robots.
 *
 * Kiosks only go in the z gaps between neighbouring buildings in a row, which is
 * the one place on the avenue sidewalk that is provably clear of both footprints
 * and of the pedestrians' walking band. Their fronts face the roadway.
 *
 * Robots are the animated half: merged into three geometries (shell, luminous
 * parts, ground glow) and driven by absolute seconds like the riders, with
 * `routes` for moving units and `statics` for idle scanning sentries.
 */
export function makeDistrictKiosks({ seed = 2049, buildings = [], sectors = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictKiosks';
  const rng = seeded(Number(seed) + 4421);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const shells = [], litParts = [], trims = [];
  const kiosks = [];
  const KIOSK_OFFSET = 7.15, FRONT = .55;
  for (const sector of sectors) {
    const list = (buildings.filter(b => b.sector === sector.id));
    if (!list.length) continue;
    const rows = new Map();
    for (const building of list) {
      const side = Math.sign(building.x - sector.cx) || 1;
      if (!rows.has(side)) rows.set(side, []);
      rows.get(side).push(building);
    }
    for (const [side, row] of rows) {
      row.sort((a, b) => a.z - b.z);
      let placed = 0;
      for (let index = 0; index < row.length - 1 && placed < 2; index++) {
        const a = row[index], b = row[index + 1];
        const gap = (b.z - b.depth / 2) - (a.z + a.depth / 2);
        if (gap < 1.25 || gap > 3.5 || rng() > .8) continue;
        const z = (a.z + a.depth / 2 + b.z - b.depth / 2) / 2;
        const x = sector.cx + side * KIOSK_OFFSET;
        // Front faces the roadway: local +z turns to face -side * x.
        const yaw = -side * Math.PI / 2;
        const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const place = (list, x0, y0, z0, sx, sy, sz) => {
          const part = unit.clone().scale(sx, sy, sz);
          part.applyQuaternion(quaternion);
          part.translate(x + x0, y0, z + z0);
          list.push(part.toNonIndexed());
        };
        place(shells, 0, .05, 0, 1.00, .10, 1.00);            // plinth
        place(shells, 0, .61, 0, .92, 1.02, .92);             // body
        place(trims, 0, .74, FRONT, .98, .07, .26);           // counter ledge
        place(shells, 0, 1.18, 0, 1.10, .07, 1.10);           // canopy
        place(litParts, 0, 1.14, FRONT - .03, 1.02, .035, .06); // canopy light strip
        place(litParts, 0, 1.02, .475, .66, .50, .04);        // menu panel
        place(litParts, .47, .95, 0, .04, .42, .40);          // side sign
        place(shells, 0, 1.30, -.05, .40, .18, .40);          // roof vent
        place(shells, -.55, .18, .10, .30, .26, .34);         // delivery crate
        kiosks.push({ sector: sector.id, side, x, z, yaw });
        placed++;
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
  finish(shells, new THREE.MeshStandardMaterial({ color: '#2b3a45', metalness: .48, roughness: .55 }), 'DistrictKiosks-Shells');
  finish(trims, new THREE.MeshStandardMaterial({ color: '#6d7f89', metalness: .72, roughness: .36 }), 'DistrictKiosks-Trims');
  finish(litParts, new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }), 'DistrictKiosks-LitPanels');
  group.userData = { seed, kiosks, kioskCount: kiosks.length, frontOffset: FRONT, halfWidth: .56, update() {} };
  return group;
}

export function makeStreetRobots({ seed = 2049, routes = [], statics = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'StreetRobots';
  const rng = seeded(Number(seed) + 6637);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const roller = new THREE.CylinderGeometry(1, 1, 1, 10);
  roller.rotateZ(Math.PI / 2);
  const neonColors = ['#6ff0ff', '#ffb45e', '#9dffc4'];

  const robots = [];
  let trafficSampler = null;
  for (const route of routes) {
    const count = route.count ?? 2, spacing = route.spacing ?? 30;
    for (let index = 0; index < count; index++) {
      const direction = route.direction ?? 1;
      robots.push({
        route, direction, static: false, pos: { x: 0, z: 0 },
        phase: (route.phase ?? rng() * 20) + index * spacing,
        speed: route.speed * (1 + (rng() - .5) * .06),
        neon: neonColors[Math.floor(rng() * neonColors.length)],
        yaw: route.axis === 'x' ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? 0 : Math.PI),
      });
    }
  }
  for (const spot of statics) {
    robots.push({
      static: true, x: spot.x, z: spot.z, pos: { x: spot.x, z: spot.z }, baseYaw: spot.yaw ?? 0,
      phase: rng() * Math.PI * 2, speed: 0, direction: 1,
      neon: neonColors[Math.floor(rng() * neonColors.length)], yaw: spot.yaw ?? 0,
    });
  }
  const slots = Math.max(1, robots.length);

  function bake(geometry, x, y, z, sx, sy, sz, rotateX = 0) {
    const part = geometry.clone().scale(sx, sy, sz);
    if (rotateX) part.rotateX(rotateX);
    part.translate(x, y, z);
    return part.toNonIndexed();
  }
  const shellGeo = mergeGeometries([
    bake(unit, 0, .10, 0, .44, .16, .58),                       // chassis
    bake(unit, 0, .38, 0, .42, .36, .50),                       // torso
    bake(unit, 0, .68, -.01, .34, .26, .36),                    // head
    bake(unit, 0, .90, -.13, .03, .22, .03),                    // antenna
    bake(unit, -.225, .20, 0, .05, .16, .40),                   // left rail
    bake(unit, .225, .20, 0, .05, .16, .40),                    // right rail
    bake(unit, 0, .52, -.28, .26, .22, .06),                    // rear rack
    bake(roller, -.19, .075, .20, .05, .075, .075),             // four rollers
    bake(roller, .19, .075, .20, .05, .075, .075),
    bake(roller, -.19, .075, -.20, .05, .075, .075),
    bake(roller, .19, .075, -.20, .05, .075, .075),
  ]);
  // 2026-09-15 evening: the neon set is what makes the silhouette read as a machine in the
  // dark, so every luminous part got wider and the shell carries its own soft self-light.
  const neonGeo = mergeGeometries([
    bake(unit, 0, .70, .175, .34, .07, .04),                    // sensor eye
    bake(unit, 0, .46, .255, .15, .12, .04),                    // chest telltale
    bake(unit, -.235, .36, 0, .045, .08, .40),                  // side strips
    bake(unit, .235, .36, 0, .045, .08, .40),
    bake(unit, 0, .84, 0, .10, .09, .10),                       // beacon
    bake(unit, 0, .40, -.305, .13, .07, .04),                   // rear lamp
    bake(unit, 0, .175, .295, .30, .05, .03),                   // front apron strip
  ]);
  const details = makeServiceRobotDetails();
  const layers = [
    { name: 'Shells', geometry: details.shell, lowGeometry: colorLowRobotGeometry(shellGeo, '#37495a'), material: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .66, roughness: .36, emissive: '#16394a', emissiveIntensity: .9 }) },
    { name: 'NeonParts', geometry: details.neon, lowGeometry: neonGeo, material: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), tint: robot => robot.neon },
  ];
  for (const layer of layers) {
    const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, slots);
    mesh.name = `StreetRobots-${layer.name}`;
    mesh.userData.detailGeometries = [layer.geometry, layer.lowGeometry];
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (layer.tint) {
      robots.forEach((robot, index) => mesh.setColorAt(index, new THREE.Color(layer.tint(robot))));
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    layer.mesh = mesh;
  }
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.index = quad.index;
  glowGeometry.setAttribute('position', quad.getAttribute('position'));
  glowGeometry.setAttribute('uv', quad.getAttribute('uv'));
  glowGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  glowGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2));
  glowGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  glowGeometry.instanceCount = slots;
  const glowMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aSize;varying vec2 vUv;varying vec3 vColor;
      void main(){vUv=uv;vColor=aColor;vec3 p=aSite+vec3(position.x*aSize.x,0.,position.z*aSize.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vColor;
      void main(){vec2 q=(vUv-.5)*2.;float glow=exp(-dot(q,q)*3.0)*(1.-smoothstep(.48,1.,length(q)));gl_FragColor=vec4(vColor,glow*.34);
      #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = 'StreetRobots-GroundGlow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  group.add(glow);
  const sites = glowGeometry.getAttribute('aSite'), sizes = glowGeometry.getAttribute('aSize'), colors = glowGeometry.getAttribute('aColor');
  robots.forEach((robot, index) => {
    const color = new THREE.Color(robot.neon);
    colors.setXYZ(index, color.r, color.g, color.b);
  });
  colors.needsUpdate = true;

  const halfWidth = .25, halfLength = .34;
  function samplePosition(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0, pos = this.pos;
    if (this.static) { pos.x = this.x; pos.z = this.z; return pos; }
    const route = this.route;
    const controlled = trafficSampler?.(this, t);
    const along = route.low + ((((this.phase + this.direction * t * this.speed) % route.length) + route.length) % route.length);
    if (controlled) { pos.x = controlled.x; pos.z = controlled.z; }
    else if (route.axis === 'x') { pos.x = along; pos.z = route.offset; } else { pos.x = route.offset; pos.z = along; }
    this.sampledSpeed = controlled?.speed ?? this.speed;
    return pos;
  }
  const yUp = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    for (const [index, robot] of robots.entries()) {
      const point = samplePosition.call(robot, time);
      let yaw = robot.yaw, fade = 1;
      if (robot.static) {
        // An idle sentry sweeps its sensor across the pavement.
        yaw = robot.baseYaw + Math.sin(time * .5 + robot.phase) * .45;
      } else {
        const along = robot.route.axis === 'x' ? point.x : point.z;
        const local = along - robot.route.low;
        fade = THREE.MathUtils.smoothstep(Math.min(local, robot.route.length - local), 0, robot.route.fade ?? 3.2);
        yaw = robot.yaw + Math.sin(time * .9 + robot.phase) * .09;
      }
      robot.x = point.x; robot.z = point.z; robot.fade = fade;
      quaternion.setFromAxisAngle(yUp, yaw);
      position.set(point.x, .02 + Math.sin(time * 2.4 + robot.phase) * .012, point.z);
      matrix.compose(position, quaternion, scale.set(fade, fade, fade));
      for (const layer of layers) layer.mesh.setMatrixAt(index, matrix);
      sites.setXYZ(index, point.x, .05, point.z);
      const alongAxis = robot.route && robot.route.axis === 'x';
      sizes.setXY(index, (alongAxis ? 1.5 : .9) * fade, (alongAxis ? .9 : 1.5) * fade);
    }
    for (const layer of layers) layer.mesh.instanceMatrix.needsUpdate = true;
    sites.needsUpdate = true; sizes.needsUpdate = true;
  }
  update(0);
  group.userData = {
    seed, robots, robotCount: robots.length, routes, halfWidth, halfLength,
    movingCount: robots.filter(robot => !robot.static).length,
    layers: layers.map(layer => layer.mesh), glow,
    samplePosition: (robot, seconds) => samplePosition.call(robot, seconds), update,
    setTrafficSampler(sampler) { trafficSampler = typeof sampler === 'function' ? sampler : null; },
    detailLevel: 'high', prepareView: makeRobotDetailView(group, robots, layers.map(layer => layer.mesh)),
  };
  return group;
}

/**
 * Cyber buses on a pair of centre lanes.
 *
 * Each avenue carries cars at +/-2 and riders at +/-3.6. The bus lanes at +/-.70
 * separate their full 1.30-wide envelopes by .10, retaining at least .03 from
 * the neighbouring car envelope. Shell, glazing and a ground pool remain three
 * instanced draws for the whole fleet; only the supplied route sets lane position.
 */
export function makeCyberBuses({ seed = 2049, routes = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'CyberBuses';
  const rng = seeded(Number(seed) + 7781);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const roller = new THREE.CylinderGeometry(1, 1, 1, 10);
  roller.rotateZ(Math.PI / 2);
  const liveries = ['#c8d4cf', '#d8c49a', '#9fb7c4', '#c9a0a8'];
  const buses = [];
  let trafficSampler = null;
  for (const route of routes) {
    const count = route.count ?? 1, spacing = route.spacing ?? 60;
    for (let index = 0; index < count; index++) {
      const direction = route.direction ?? 1;
      buses.push({
        route, direction, pos: { x: 0, z: 0 },
        phase: (route.phase ?? rng() * 40) + index * spacing,
        speed: route.speed * (1 + (rng() - .5) * .05),
        livery: liveries[Math.floor(rng() * liveries.length)],
        yaw: route.axis === 'x' ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? 0 : Math.PI),
      });
    }
  }
  const slots = Math.max(1, buses.length);
  function bake(geometry, x, y, z, sx, sy, sz) {
    return geometry.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed();
  }
  // Local frame: +z forward, origin on the road surface.
  const shellGeo = mergeGeometries([
    bake(unit, 0, .82, 0, 1.15, 1.24, 5.30),          // body
    bake(unit, 0, .16, 0, 1.06, .22, 5.10),           // skirt
    bake(unit, 0, 1.50, 0, 1.06, .14, 4.90),          // roof
    bake(unit, 0, 1.62, -1.30, .78, .16, 1.60),       // roof unit
    bake(roller, -.55, .27, 1.72, .12, .27, .27),     // four wheels
    bake(roller, .55, .27, 1.72, .12, .27, .27),
    bake(roller, -.55, .27, -1.62, .12, .27, .27),
    bake(roller, .55, .27, -1.62, .12, .27, .27),
  ]);
  const neonGeo = mergeGeometries([
    bake(unit, 0, 1.06, 2.67, 1.02, .58, .04),        // windscreen
    bake(unit, 0, 1.06, -2.67, .92, .34, .04),       // rear glazing
    bake(unit, -.585, 1.06, 0, .04, .56, 3.60),       // side glazing
    bake(unit, .585, 1.06, 0, .04, .56, 3.60),
    bake(unit, 0, 1.36, 2.68, .72, .26, .04),         // route blind
    bake(unit, -.60, .60, 0, .04, .08, 4.60),         // body light strips
    bake(unit, .60, .60, 0, .04, .08, 4.60),
    bake(unit, -.48, .52, 2.70, .30, .18, .04),       // headlights
    bake(unit, .48, .52, 2.70, .30, .18, .04),
    bake(unit, -.52, .62, -2.70, .26, .14, .04),      // tail lamps
    bake(unit, .52, .62, -2.70, .26, .14, .04),
  ]);
  const detail = makeBusDetails();
  const layers = [
    { name: 'Shells', geometry: detail.shell, lowGeometry: colorGroundGeometry(shellGeo), material: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .48, roughness: .35, emissive: '#132530', emissiveIntensity: .13 }), tint: bus => bus.livery },
    { name: 'NeonParts', geometry: detail.neon, lowGeometry: colorGroundGeometry(neonGeo, '#9dc6dd'), material: new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false }), tint: () => '#ffffff' },
  ];
  shellGeo.dispose(); neonGeo.dispose(); unit.dispose(); roller.dispose();
  for (const layer of layers) {
    const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, slots);
    mesh.name = `CyberBuses-${layer.name}`;
    mesh.userData.detailGeometries = [layer.geometry, layer.lowGeometry];
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (layer.tint) {
      buses.forEach((bus, index) => mesh.setColorAt(index, new THREE.Color(layer.tint(bus))));
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    layer.mesh = mesh;
  }
  const poolQuad = new THREE.PlaneGeometry(1, 1);
  poolQuad.rotateX(-Math.PI / 2);
  const poolGeometry = new THREE.InstancedBufferGeometry();
  poolGeometry.index = poolQuad.index;
  poolGeometry.setAttribute('position', poolQuad.getAttribute('position'));
  poolGeometry.setAttribute('uv', poolQuad.getAttribute('uv'));
  poolGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  poolGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2));
  poolGeometry.instanceCount = slots;
  const pool = new THREE.Mesh(poolGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSite;attribute vec2 aSize;varying vec2 vUv;
      void main(){vUv=uv;vec3 p=aSite+vec3(position.x*aSize.x,0.,position.z*aSize.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;
      void main(){vec2 q=(vUv-.5)*2.;float glow=exp(-dot(q,q)*2.6)*(1.-smoothstep(.5,1.,length(q)));gl_FragColor=vec4(.66,.86,1.,glow*.2);
      #include <colorspace_fragment>
      }`,
  }));
  pool.name = 'CyberBuses-LightPool';
  pool.frustumCulled = false;
  pool.renderOrder = 3;
  group.add(pool);
  const sites = poolGeometry.getAttribute('aSite'), sizes = poolGeometry.getAttribute('aSize');

  const halfWidth = .6, halfLength = 2.72;
  function samplePosition(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0, route = this.route, pos = this.pos;
    const controlled = trafficSampler?.(this, t);
    const along = route.low + ((((this.phase + this.direction * t * this.speed) % route.length) + route.length) % route.length);
    if (controlled) { pos.x = controlled.x; pos.z = controlled.z; }
    else if (route.axis === 'x') { pos.x = along; pos.z = route.offset; } else { pos.x = route.offset; pos.z = along; }
    this.sampledSpeed = controlled?.speed ?? this.speed;
    return pos;
  }
  const yUp = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    for (const [index, bus] of buses.entries()) {
      const point = samplePosition.call(bus, time);
      const along = bus.route.axis === 'x' ? point.x : point.z;
      const local = along - bus.route.low;
      const fade = THREE.MathUtils.smoothstep(Math.min(local, bus.route.length - local), 0, bus.route.fade ?? 6);
      bus.x = point.x; bus.z = point.z; bus.fade = fade;
      quaternion.setFromAxisAngle(yUp, bus.yaw);
      position.set(point.x, 0, point.z);
      matrix.compose(position, quaternion, scale.set(fade, fade, fade));
      for (const layer of layers) layer.mesh.setMatrixAt(index, matrix);
      sites.setXYZ(index, point.x, .05, point.z);
      const alongAxis = bus.route.axis === 'x';
      sizes.setXY(index, (alongAxis ? 8.2 : 2.0) * fade, (alongAxis ? 2.0 : 8.2) * fade);
    }
    for (const layer of layers) layer.mesh.instanceMatrix.needsUpdate = true;
    sites.needsUpdate = true; sizes.needsUpdate = true;
  }
  update(0);
  const prepareView = makeGroundVehicleDetailView(group, layers.map(layer => layer.mesh), () => buses.map(bus => ({ x: bus.x, y: .85, z: bus.z })), 18);
  group.userData = {
    seed, buses, busCount: buses.length, routes, halfWidth, halfLength,
    meshes: layers.length + 1,
    samplePosition: (bus, seconds) => samplePosition.call(bus, seconds), update, prepareView, detailLevel: 'high',
    setTrafficSampler(sampler) { trafficSampler = typeof sampler === 'function' ? sampler : null; },
  };
  return group;
}
