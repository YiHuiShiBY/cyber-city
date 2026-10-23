import { makeAirshipIllumination } from './airship-illumination.js';
import { makeDetailedAirship } from './transport-model-details.js';
import { enhanceAircraftGeometry, makeAircraftGlassMaterial, makeAircraftLightMaterial, updateAircraftLights } from './aircraft-lighting.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFlyingBikeDetail, tintGeometry, makeDetailSelector } from './aerial-model-details.js';

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
 * Mid-air single-rider bikes and high-altitude luminous airships.
 *
 * The bikes own the band between the road traffic and the skyline (7-13 units up),
 * keep to the avenue corridors, and are built like the ground riders so one
 * instanced part set covers the whole flight: shell, luminous parts, rider and a
 * continuous trail. The airships drift far above every roof on long slow orbits,
 * with a lit hull band, fins and a gondola; hull and lights are two draws.
 */
export function makeFlyingBikes({ seed = 2049, routes = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'FlyingBikes';
  const rng = seeded(Number(seed) + 3313);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const wheel = new THREE.CylinderGeometry(1, 1, 1, 10);
  wheel.rotateZ(Math.PI / 2);
  const coatColors = ['#8b6f78', '#6f8794', '#94795f', '#7f8f6d'];

  const bikes = [];
  for (const route of routes) {
    const count = route.count ?? 2, spacing = route.spacing ?? 40;
    for (let index = 0; index < count; index++) {
      const direction = route.direction ?? 1;
      bikes.push({
        route, direction, pos: { x: 0, y: 0, z: 0 },
        phase: (route.phase ?? rng() * 30) + index * spacing,
        speed: route.speed * (1 + (rng() - .5) * .06),
        coat: coatColors[Math.floor(rng() * coatColors.length)],
        neon: ['#7ff0ff', '#ff7ad2', '#ffe08a'][Math.floor(rng() * 3)],
        yaw: route.axis === 'x' ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? 0 : Math.PI),
      });
    }
  }
  const slots = Math.max(1, bikes.length);
  function bake(geometry, x, y, z, sx, sy, sz, rotateX = 0) {
    const part = geometry.clone().scale(sx, sy, sz);
    if (rotateX) part.rotateX(rotateX);
    part.translate(x, y, z);
    return part.toNonIndexed();
  }
  // Local frame: +z forward, origin at the bike's centre of mass.
  const shellGeo = mergeGeometries([
    bake(unit, 0, 0, .08, .26, .22, 1.10),          // frame
    bake(unit, 0, -.16, -.28, .40, .10, .52),       // thruster deck
    bake(unit, 0, .18, .42, .44, .05, .06),         // handlebar
    bake(unit, 0, .14, .30, .16, .22, .16),         // cowl
  ]);
  const neonGeo = mergeGeometries([
    bake(wheel, 0, -.10, .62, .09, .19, .19),       // front wheel
    bake(wheel, 0, -.12, -.52, .10, .21, .21),      // rear wheel
    bake(unit, 0, -.24, -.40, .40, .10, .22),       // thruster glow
    bake(unit, 0, -.26, .10, .30, .06, .70),        // belly strip
    bake(unit, 0, .20, .55, .14, .07, .06),         // headlight
    bake(unit, 0, .02, -.64, .16, .06, .05),        // tail light
    bake(unit, 0, .30, .18, .06, .06, .40),         // spine light
  ]);
  const riderGeo = mergeGeometries([
    bake(unit, 0, .38, -.06, .22, .30, .20),
    bake(unit, 0, .54, -.06, .26, .07, .18),
    bake(unit, -.11, .40, .10, .08, .08, .30),
    bake(unit, .11, .40, .10, .08, .08, .30),
    bake(unit, -.11, .16, .04, .09, .20, .16, -.42),
    bake(unit, .11, .16, .04, .09, .20, .16, -.42),
    bake(unit, 0, .61, -.04, .17, .17, .17),        // helmet
  ]);
  // The rider is baked into the shell: at altitude a bike should read as one dark
  // silhouette carrying its own lights, and that also keeps the flight at 3 draws.
  const detail = makeFlyingBikeDetail();
  const lowShell = mergeGeometries([shellGeo, riderGeo]);
  const layers = [
    { name: 'Shells', geometry: detail.shell, lowGeometry: tintGeometry(lowShell, '#31414f'), material: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .52, roughness: .45 }) },
    { name: 'NeonParts', geometry: detail.neon, lowGeometry: tintGeometry(neonGeo), material: new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false }), tint: bike => bike.neon },
  ];
  lowShell.dispose(); shellGeo.dispose(); riderGeo.dispose(); neonGeo.dispose();
  for (const layer of layers) {
    const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, slots);
    mesh.name = `FlyingBikes-${layer.name}`;
    mesh.userData.detailGeometries = [layer.geometry, layer.lowGeometry];
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (layer.tint) {
      bikes.forEach((bike, index) => mesh.setColorAt(index, new THREE.Color(layer.tint(bike))));
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    layer.mesh = mesh;
  }
  // A short additive ribbon behind every bike, one draw for the whole flight.
  const ribbon = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 4);
  ribbon.index = quad.index;
  ribbon.setAttribute('position', quad.getAttribute('position'));
  ribbon.setAttribute('uv', quad.getAttribute('uv'));
  ribbon.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  ribbon.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  ribbon.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2));
  ribbon.setAttribute('aYaw', new THREE.InstancedBufferAttribute(new Float32Array(slots), 1));
  ribbon.instanceCount = slots;
  const ribbonMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aSize;attribute float aYaw;
      varying vec2 vUv;varying vec3 vColor;varying float vTime;
      void main(){
        vUv=uv;vColor=aColor;
        vec3 local=vec3(position.x*aSize.x,0.,position.y*aSize.y);
        float cy=cos(aYaw),sy=sin(aYaw);
        vec3 world=aSite+vec3(local.x*cy+local.z*sy,local.y,-local.x*sy+local.z*cy);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
      }`,
    fragmentShader: `varying vec2 vUv;varying vec3 vColor;
      void main(){
        float along=vUv.y;
        float alpha=(1.-along)*(1.-along)*.16*(1.-smoothstep(.25,.5,abs(vUv.x-.5)));
        gl_FragColor=vec4(vColor,alpha);
      }`,
  });
  const trail = new THREE.Mesh(ribbon, ribbonMaterial);
  trail.name = 'FlyingBikes-Trails';
  trail.frustumCulled = false;
  trail.renderOrder = 4;
  group.add(trail);
  const sites = ribbon.getAttribute('aSite'), colors = ribbon.getAttribute('aColor');
  const sizes = ribbon.getAttribute('aSize'), yaws = ribbon.getAttribute('aYaw');
  bikes.forEach((bike, index) => {
    const color = new THREE.Color(bike.neon);
    colors.setXYZ(index, color.r, color.g, color.b);
    sizes.setXY(index, .5, 5.5);
  });
  colors.needsUpdate = colors.needsUpdate = sizes.needsUpdate = true;

  const halfWidth = .3, halfLength = .7;
  function samplePosition(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0, route = this.route, pos = this.pos;
    const along = route.low + ((((this.phase + this.direction * t * this.speed) % route.length) + route.length) % route.length);
    const bob = Math.sin(t * .6 + this.phase) * .18;
    // The lane is the lateral coordinate; `height` is the flight level.
    if (route.axis === 'x') { pos.x = along; pos.z = route.offset; }
    else { pos.x = route.offset; pos.z = along; }
    pos.y = route.height + bob;
    return pos;
  }
  const yUp = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), bankQ = new THREE.Quaternion();
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    for (const [index, bike] of bikes.entries()) {
      const point = samplePosition.call(bike, time);
      const along = bike.route.axis === 'x' ? point.x : point.z;
      const local = along - bike.route.low;
      const fade = THREE.MathUtils.smoothstep(Math.min(local, bike.route.length - local), 0, bike.route.fade ?? 5);
      bike.x = point.x; bike.y = point.y; bike.z = point.z; bike.fade = fade;
      const bank = Math.sin(time * .9 + bike.phase) * .16;
      quaternion.setFromAxisAngle(yUp, bike.yaw);
      quaternion.multiply(bankQ.setFromAxisAngle(zAxis, bank));
      position.set(point.x, point.y, point.z);
      // Slightly oversize: a true-scale bike vanishes against a dark facade from below.
      const size = 1.25 * fade;
      matrix.compose(position, quaternion, scale.set(size, size, size));
      for (const layer of layers) layer.mesh.setMatrixAt(index, matrix);
      // The ribbon trails behind the bike along its heading.
      const behind = bike.route.axis === 'x'
        ? { x: point.x - bike.direction * 3.0, z: point.z }
        : { x: point.x, z: point.z - bike.direction * 3.0 };
      sites.setXYZ(index, behind.x, point.y - .02, behind.z);
      yaws.setX(index, bike.yaw);
      sizes.setXY(index, .5, 6.0 * fade);
    }
    for (const layer of layers) layer.mesh.instanceMatrix.needsUpdate = true;
    sites.needsUpdate = true; yaws.needsUpdate = true; sizes.needsUpdate = true;
  }
  update(0);
  const prepareView = makeDetailSelector(group, layers.map(layer => layer.mesh), bikes, bike => bike);
  group.userData = {
    seed, bikes, bikeCount: bikes.length, routes, halfWidth, halfLength,
    meshes: layers.length + 1,
    samplePosition: (bike, seconds) => samplePosition.call(bike, seconds), update,
    prepareView, detailLevel: 'high',
  };
  return group;
}

export function makeAirships({ seed = 2049, count = 3 } = {}) {
  const group = new THREE.Group();
  group.name = 'Airships';
  const rng = seeded(Number(seed) + 5531);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 14, 9);
  const ring = new THREE.TorusGeometry(1, .035, 5, 18);
  ring.rotateY(Math.PI / 2);
  // Everything is authored in "unit ship" space (length 1 along x, radius 1 in
  // y/z), so one scale vector per instance places every part of a ship together.
  const hullGeo = sphere.clone().scale(.5, 1, 1).toNonIndexed();
  const gondolaGeo = mergeGeometries([
    unit.clone().scale(.115, .30, .26).translate(0, -1.18, 0).toNonIndexed(),
    unit.clone().scale(.085, .10, .20).translate(0, -1.44, 0).toNonIndexed(),
  ]);
  const finGeo = mergeGeometries([
    unit.clone().scale(.040, 1.55, .14).translate(-.465, 0, 0).toNonIndexed(),
    unit.clone().scale(.032, .5, 1.30).translate(-.465, 0, 0).toNonIndexed(),
    unit.clone().scale(.18, .10, .90).translate(-.34, .58, 0).toNonIndexed(),
    unit.clone().scale(.18, .10, .90).translate(.34, .58, 0).toNonIndexed(),
  ]);
  const glowGeo = mergeGeometries([
    ring.clone().scale(1.0, 1.0, 1.0).toNonIndexed(),                       // hull band
    unit.clone().scale(.10, .16, .21).translate(0, -1.18, .005).toNonIndexed(),  // gondola windows
    unit.clone().scale(.175, .07, .80).translate(-.36, .60, 0).toNonIndexed(),   // fin lamps
    unit.clone().scale(.175, .07, .80).translate(.36, .60, 0).toNonIndexed(),
    unit.clone().scale(.05, .05, .05).translate(-.5, 0, 0).toNonIndexed(),
  ]);
  const accents = ['#8fe8ff', '#ffb0e4', '#c9ffd6'];
  const ships = [];
  for (let index = 0; index < count; index++) {
    ships.push({
      pose: { x: 0, y: 0, z: 0, yaw: 0 },
      length: 13 + rng() * 5, radius: 3.0 + rng() * 1.0,
      height: 74 + index * 9 + rng() * 5,
      orbit: { radius: 58 + index * 16, zRadius: 66 + index * 14, speed: .016 - index * .002, phase: rng() * Math.PI * 2, cx: (index - 1) * 22, cz: 0 },
      accent: new THREE.Color(accents[index % accents.length]),
    });
  }
  // Hull fittings and light effects remain merged; transparent panes are one batch.
  const structureGeo = mergeGeometries([hullGeo, gondolaGeo, finGeo].map(geometry => geometry.toNonIndexed()));
  const low = enhanceAircraftGeometry('airship', {body:structureGeo, lights:glowGeo}, {low:true});
  const definitions = [
    { name: 'Structures', layer:'structure', geometry: low.body, material: new THREE.MeshStandardMaterial({ vertexColors:true, metalness: .46, roughness: .40, emissive: '#1d3850', emissiveIntensity: .40 }) },
    { name: 'Lights', layer:'lights', geometry: low.lights, material: makeAircraftLightMaterial(), tint: ship => ship.accent },
    { name: 'Glass', layer:'glass', geometry: low.glass, material: makeAircraftGlassMaterial() },
  ];
  for (const definition of definitions) {
    const mesh = new THREE.InstancedMesh(definition.geometry, definition.material, ships.length);
    mesh.name = `Airships-${definition.name}`;
    if(definition.layer==='glass')mesh.renderOrder=3;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (definition.tint) {
      ships.forEach((ship, index) => mesh.setColorAt(index, new THREE.Color(definition.tint(ship))));
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    definition.mesh = mesh;
  }
  // Lighting shares the hull matrices but remains outside both LOD geometries.
  const illumination = makeAirshipIllumination({ ships });
  // The Blender hull has authored seams and engine lamps; the old broad
  // decorative ribbons only belong to the distant silhouette.
  illumination.visible = false;
  group.add(illumination);
  const detailed = makeDetailedAirship();
  for (const definition of definitions) {
    definition.lowGeometry = definition.geometry;
    definition.lowMaterial = definition.material;
    definition.highGeometry = detailed[definition.layer];
    definition.highMaterial = definition.layer === 'structure'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .42, roughness: .37 })
      : definition.material;
    definition.mesh.geometry = definition.highGeometry;
    definition.mesh.material = definition.highMaterial;
    definition.mesh.userData.detailGeometries = [definition.lowGeometry, definition.highGeometry];
    definition.mesh.userData.detailMaterials = [definition.lowMaterial, definition.highMaterial];
  }
  const viewPosition = new THREE.Vector3(), shipPosition = new THREE.Vector3();
  function prepareView(camera) {
    camera.getWorldPosition(viewPosition); group.worldToLocal(viewPosition);
    const high = ships.some(ship => shipPosition.set(ship.x,ship.y,ship.z).distanceTo(viewPosition) < 55 * (camera.zoom || 1));
    illumination.visible = !high;
    for (const definition of definitions) {
      definition.mesh.geometry = high ? definition.highGeometry : definition.lowGeometry;
      definition.mesh.material = high ? definition.highMaterial : definition.lowMaterial;
      definition.mesh.boundingBox = null; definition.mesh.boundingSphere = null;
    }
    group.userData.modelDetail = high ? 'high' : 'low';
  }
  // Downward searchlights: one per ship, apex under the gondola, sweeping slowly.
  // The cone is authored apex-at-origin along +y, then flipped so it points down.
  // Apex at the emitter, widening as it falls, so the pool of light spreads out.
  const beamCone = new THREE.ConeGeometry(1, 1, 12, 1, true);
  beamCone.translate(0, -.5, 0);
  const beamGeometry = new THREE.InstancedBufferGeometry();
  beamGeometry.index = beamCone.index;
  beamGeometry.setAttribute('position', beamCone.getAttribute('position'));
  beamGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(ships.length * 3), 3));
  beamGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(ships.length * 3), 3));
  beamGeometry.setAttribute('aAngles', new THREE.InstancedBufferAttribute(new Float32Array(ships.length * 2), 2));
  beamGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(ships.length * 2), 2));
  beamGeometry.instanceCount = ships.length;
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aAngles,aSize;varying float vAlong;varying vec3 vColor;
      void main(){
        // The cone runs from the apex at y=0 down to its wide end at y=-1.
        vAlong=-position.y;vColor=aColor;
        vec3 local=vec3(position.x*aSize.x,position.y*aSize.y,position.z*aSize.x);
        float cy=cos(aAngles.x),sy=sin(aAngles.x),ct=cos(aAngles.y),st=sin(aAngles.y);
        vec3 tilted=vec3(local.x,local.y*ct-local.z*st,local.y*st+local.z*ct);
        vec3 world=aSite+vec3(tilted.x*cy+tilted.z*sy,tilted.y,-tilted.x*sy+tilted.z*cy);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
      }`,
    fragmentShader: `varying float vAlong;varying vec3 vColor;
      void main(){
        // Taken from the searchlight shader: bright at the emitter, fading with reach.
        float shaft=pow(1.-clamp(vAlong,0.,1.),1.6)*.05;
        float core=(1.-smoothstep(0.,.10,vAlong))*.09;
        gl_FragColor=vec4(vColor,shaft+core);
      }`,
  });
  const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
  beamMesh.name = 'Airships-Beams';
  beamMesh.frustumCulled = false;
  beamMesh.renderOrder = 4;
  group.add(beamMesh);
  const beamSites = beamGeometry.getAttribute('aSite'), beamColors = beamGeometry.getAttribute('aColor');
  const beamAngles = beamGeometry.getAttribute('aAngles'), beamSizes = beamGeometry.getAttribute('aSize');

  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const yUp = new THREE.Vector3(0, 1, 0);
  function sampleShip(ship, seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0, pose = ship.pose;
    const angle = t * ship.orbit.speed + ship.orbit.phase;
    pose.x = ship.orbit.cx + Math.sin(angle) * ship.orbit.radius;
    pose.y = ship.height + Math.sin(angle * 2.1) * .9;
    pose.z = ship.orbit.cz + Math.cos(angle) * ship.orbit.zRadius;
    pose.yaw = angle + Math.PI / 2;
    return pose;
  }
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    updateAircraftLights(definitions[1].material,time);
    for (const [index, ship] of ships.entries()) {
      const pose = sampleShip(ship, time);
      ship.x = pose.x; ship.y = pose.y; ship.z = pose.z;
      quaternion.setFromAxisAngle(yUp, pose.yaw);
      position.set(pose.x, pose.y, pose.z);
      scale.set(ship.length, ship.radius, ship.radius);
      matrix.compose(position, quaternion, scale);
      for (const definition of definitions) definition.mesh.setMatrixAt(index, matrix);
      illumination.userData.setMatrixAt(index, matrix);
      // The beam hangs from the gondola, tilts with a slow sweep and reaches the
      // ground: its length is the ship's own altitude plus a little margin.
      const sweep = Math.sin(time * .09 + index) * .30;
      const reach = pose.y - 1.5;
      beamSites.setXYZ(index, pose.x, pose.y - ship.radius - 1.5, pose.z);
      beamColors.setXYZ(index, ship.accent.r, ship.accent.g, ship.accent.b);
      beamSizes.setXY(index, .55 + ship.radius * .18, reach);
      beamAngles.setXY(index, pose.yaw + Math.sin(time * .05 + index * 2) * .8, sweep);
    }
    beamSites.needsUpdate = true; beamColors.needsUpdate = true;
    beamSizes.needsUpdate = true; beamAngles.needsUpdate = true;
    beamMaterial.uniforms.uTime.value = time;
    for (const definition of definitions) definition.mesh.instanceMatrix.needsUpdate = true;
    illumination.userData.update(time);
  }
  update(0);
  group.userData = {
    seed, shipCount: ships.length, ships, sampleShip, beamMesh, prepareView, illumination,
    /** Emitter point and reach of every downward searchlight. */
    beams: () => ships.map((ship, index) => ({
      x: beamSites.getX(index), y: beamSites.getY(index), z: beamSites.getZ(index),
      reach: beamSizes.getY(index), tilt: beamAngles.getY(index),
    })),
    meshes: definitions.length + 1 + illumination.userData.meshCount, update,
    /** Lowest hull point over every ship, for the height-clearance check. */
    lowest: () => Math.min(...ships.map(ship => ship.y - ship.radius - 1.5)),
  };
  return group;
}
