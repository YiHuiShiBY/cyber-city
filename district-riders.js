import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRiderModelDetails, colorRiderGeometry } from './rider-model-details.js';

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
 * Neon motorcycles with riders, sized to the miniature street scale (about 1.25
 * units long, rider crown at 1.03, matching the 1.12-unit pedestrians). Every
 * part of every rider is baked into one of five merged geometries, so the fleet
 * costs five instanced draws plus a single ground-glow layer.
 *
 * Routes are straight lanes: `axis` 'z' or 'x' is the travel axis, `offset` is the
 * lateral coordinate, `low` + `length` define the loop, and `fade` fades riders in
 * and out at the loop ends so no bike pops into view mid-street.
 */
export function makeNeonRiders({ seed = 2049, routes = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'NeonMotorcade';
  const rng = seeded(Number(seed) + 3391);
  const coatColors = ['#7d95a3', '#8f8095', '#a08e74', '#6a86a8', '#7d9a86', '#9c6f78'];
  const neonColors = ['#5ff0ff', '#ff5ad0', '#ffb347', '#7dffb0', '#8f9dff'];

  const riders = [];
  let trafficSampler = null;
  for (const route of routes) {
    const count = route.count ?? 2, spacing = route.spacing ?? 26;
    for (let index = 0; index < count; index++) {
      const direction = route.direction ?? 1;
      riders.push({
        route, direction, pos: { x: 0, z: 0 },
        phase: (route.phase ?? rng() * 24) + index * spacing,
        speed: route.speed * (1 + (rng() - .5) * .07),
        coat: coatColors[Math.floor(rng() * coatColors.length)],
        neon: neonColors[Math.floor(rng() * neonColors.length)],
        yaw: route.axis === 'x' ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? 0 : Math.PI),
      });
    }
  }
  const slots = Math.max(1, riders.length);

  // Local frame: +z is forward, so an instance only needs a yaw to face its route.
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const wheel = new THREE.CylinderGeometry(1, 1, 1, 12);
  wheel.rotateZ(Math.PI / 2);        // rolling axis along x
  const dome = new THREE.SphereGeometry(1, 9, 7);
  function bake(geometry, x, y, z, sx, sy, sz, rotateX = 0) {
    const part = geometry.clone();
    part.scale(sx, sy, sz);
    if (rotateX) part.rotateX(rotateX);
    part.translate(x, y, z);
    return part.toNonIndexed();
  }
  const shellGeo = mergeGeometries([
    bake(unit, 0, .37, -.02, .20, .17, .86),       // frame and tank
    bake(unit, 0, .50, -.16, .19, .05, .30),       // seat
    bake(unit, 0, .62, .40, .34, .035, .05),       // handlebar
    bake(unit, 0, .40, .47, .04, .30, .04),        // front fork
    bake(unit, 0, .30, -.52, .17, .13, .16),       // tail cowl
  ]);
  const riderGeo = mergeGeometries([
    bake(unit, 0, .70, -.12, .20, .26, .17),       // torso
    bake(unit, 0, .82, -.12, .24, .07, .16),       // shoulders
    bake(unit, -.105, .74, .03, .075, .075, .30),  // left arm
    bake(unit, .105, .74, .03, .075, .075, .30),   // right arm
    bake(unit, -.105, .50, .04, .085, .19, .16, -.42),  // left leg, knee forward
    bake(unit, .105, .50, .04, .085, .19, .16, -.42),   // right leg, knee forward
  ]);
  // Everything luminous shares one batch; the colour arrives per instance.
  const neonGeo = mergeGeometries([
    bake(unit, 0, .27, .02, .24, .075, .62),       // frame underglow
    bake(wheel, 0, .125, .50, .055, .125, .125),   // front wheel
    bake(wheel, 0, .135, -.48, .065, .135, .135),  // rear wheel
    bake(unit, 0, .90, -.005, .10, .035, .02),     // helmet visor
    bake(unit, 0, .44, -.60, .09, .055, .04),      // tail light
    // A lit jacket band and crown stripe keep the rider readable in the dark.
    bake(unit, 0, .775, -.209, .20, .045, .022),
    bake(unit, .105, .780, .03, .078, .018, .30),
    bake(unit, -.105, .780, .03, .078, .018, .30),
    bake(unit, 0, .985, -.09, .05, .022, .26),
  ]);
  const helmetGeo = bake(dome, 0, .90, -.09, .17, .18, .17);

  const layers = [
    { name: 'Bikes', geometry: shellGeo, material: new THREE.MeshStandardMaterial({ color: '#233240', metalness: .72, roughness: .31 }) },
    { name: 'Riders', geometry: riderGeo, material: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .74, metalness: .05 }), tint: rider => rider.coat },
    { name: 'Helmets', geometry: helmetGeo, material: new THREE.MeshStandardMaterial({ color: '#1b262f', roughness: .38, metalness: .22 }) },
    { name: 'NeonParts', geometry: neonGeo, material: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), tint: rider => rider.neon },
    { name: 'Headlights', geometry: bake(unit, 0, .56, .55, .10, .075, .05), material: new THREE.MeshBasicMaterial({ color: '#ffeccd', toneMapped: false }) },
  ];
  const detailed = makeRiderModelDetails();
  for (const layer of layers) {
    // Preserve the original miniature as the far-view LOD, with its material
    // colour baked in so the detailed set can use several finishes per batch.
    layer.lowGeometry = colorRiderGeometry(layer.geometry, layer.material.color);
    layer.highGeometry = detailed[layer.name];
    layer.geometry = layer.highGeometry;
    layer.material.color.set('#ffffff');
    layer.material.vertexColors = true;
    const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, slots);
    mesh.name = `NeonRiders-${layer.name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.detailGeometries = [layer.highGeometry, layer.lowGeometry];
    if (layer.tint) {
      riders.forEach((rider, index) => mesh.setColorAt(index, new THREE.Color(layer.tint(rider))));
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    layer.mesh = mesh;
  }
  // A soft additive pool travels with each rider; one draw call for the whole fleet.
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
      void main(){vec2 q=(vUv-.5)*2.;float glow=exp(-dot(q,q)*3.4)*(1.-smoothstep(.48,1.,length(q)));gl_FragColor=vec4(vColor,glow*.26);
      #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = 'NeonRiders-GroundGlow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  group.add(glow);

  const yUp = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), unitScale = new THREE.Vector3(1, 1, 1);
  const glowSite = glowGeometry.getAttribute('aSite'), glowSize = glowGeometry.getAttribute('aSize'), glowColor = glowGeometry.getAttribute('aColor');
  const halfWidth = .17, halfLength = .62;
  const cameraPosition = new THREE.Vector3();

  function prepareView(camera) {
    camera.getWorldPosition(cameraPosition);
    group.worldToLocal(cameraPosition);
    const threshold = 22 * Math.max(.01, camera.zoom ?? 1);
    const near = riders.some(rider => {
      const dx = cameraPosition.x - rider.x, dz = cameraPosition.z - rider.z;
      return dx * dx + cameraPosition.y * cameraPosition.y + dz * dz < threshold * threshold;
    });
    const detailLevel = near ? 'high' : 'low';
    if (detailLevel === group.userData.detailLevel) return;
    for (const layer of layers) layer.mesh.geometry = near ? layer.highGeometry : layer.lowGeometry;
    group.userData.detailLevel = detailLevel;
  }

  // Every sample reuses the caller's own record, so the render loop never
  // allocates for position sampling.
  function samplePosition(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0, route = this.route;
    const controlled = trafficSampler?.(this, t);
    const along = route.low + ((((this.phase + this.direction * t * this.speed) % route.length) + route.length) % route.length);
    const pos = this.pos;
    if (controlled) { pos.x = controlled.x; pos.z = controlled.z; }
    else if (route.axis === 'x') { pos.x = along; pos.z = route.offset; } else { pos.x = route.offset; pos.z = along; }
    this.sampledSpeed = controlled?.speed ?? this.speed;
    return pos;
  }
  function update(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0;
    for (const [index, rider] of riders.entries()) {
      const point = samplePosition.call(rider, t);
      const along = rider.route.axis === 'x' ? point.x : point.z;
      const local = along - rider.route.low;
      const fade = THREE.MathUtils.smoothstep(Math.min(local, rider.route.length - local), 0, rider.route.fade ?? 3.4);
      rider.x = point.x; rider.z = point.z; rider.fade = fade;
      quaternion.setFromAxisAngle(yUp, rider.yaw);
      position.set(point.x, 0, point.z);
      // Baked geometry carries each part's local offset; the instance supplies
      // world position, yaw and the end-of-loop fade only.
      matrix.compose(position, quaternion, unitScale.set(1, 1, 1).multiplyScalar(fade));
      for (const layer of layers) layer.mesh.setMatrixAt(index, matrix);
      const alongAxis = rider.route.axis === 'x';
      glowSite.setXYZ(index, point.x, .05, point.z);
      glowSize.setXY(index, (alongAxis ? 3.3 : 1.35) * fade, (alongAxis ? 1.35 : 3.3) * fade);
      if (!rider.glowWritten) {
        const color = new THREE.Color(rider.neon);
        glowColor.setXYZ(index, color.r, color.g, color.b);
        rider.glowWritten = true;
      }
    }
    for (const layer of layers) layer.mesh.instanceMatrix.needsUpdate = true;
    glowSite.needsUpdate = true; glowSize.needsUpdate = true; glowColor.needsUpdate = true;
  }
  group.userData = {
    seed, riders, riderCount: riders.length, routes, halfWidth, halfLength,
    neonColors, coatColors, glow, lanes: layers.map(layer => layer.mesh),
    samplePosition: (rider, seconds) => samplePosition.call(rider, seconds), update,
    setTrafficSampler(sampler) { trafficSampler = typeof sampler === 'function' ? sampler : null; },
    prepareView, detailLevel: 'high',
  };
  update(0);
  return group;
}
