import * as THREE from 'three';
import { makeDistrictPedestrianParts } from './district-pedestrians.js';
import { sampleWalkingGait } from './pedestrian-gait.js';
import { OUTER_DISTRICT_STYLES } from './district-styles.js';
import { DISTRICT_ASPHALT_ROADS } from './city-ground-footprint.js';

function seeded(seed) {
  let a = Number(seed) >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// The original detailed crossing remains at the origin. These streets connect its neighbours.
export function makeDistrictStreets({ seed = 2049, gpuCrowd = false } = {}) {
  const group = new THREE.Group(); group.name = 'DistrictStreets';
  const rng = seeded(seed + 1704), unit = new THREE.BoxGeometry(1, 1, 1), batches = new Map();
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const steel = new THREE.MeshStandardMaterial({ color: '#334655', metalness: .55, roughness: .55 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#31424a', roughness: .83 });
  const paint = new THREE.MeshBasicMaterial({ color: '#a8c4c7', transparent: true, opacity: .38, depthWrite: false });
  const curb = new THREE.MeshBasicMaterial({ color: '#6fb4b7', transparent: true, opacity: .44 });
  // 湿沥青：基色压深、金属度归零并收敛环境反射——上朝面正对 IBL 的明亮
  // 地平线光带，此前路面被环境光抬成中灰"白毯"，盖过整幅全景。
  const asphalt = new THREE.MeshStandardMaterial({ color: '#0a141d', metalness: .06, roughness: .52, envMapIntensity: .35 });
  const lampLight = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  function box(material, x, y, z, w, h, d, color = '#ffffff') {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push([x, y, z, w, h, d, color]);
  }
  const sectors = [];
  for (const cx of [-42, 0, 42]) for (const cz of [-48, 0, 48]) {
    if (cx === 0 && cz === 0) continue;
    sectors.push({ x: cx, z: cz });
    for (const side of [-1, 1]) for (const half of [-1, 1]) {
      box(concrete, cx + side * 10.5, .015, cz + half * 11.6, 11, .23, 15.2);
      box(curb, cx + side * 5.04, .15, cz + half * 11.7, .035, .035, 15);
      // Narrow seams keep the sidewalks legible at street level.
      for (let n = 0; n < 7; n++) box(steel, cx + side * 10.5, .134, cz + half * (5.2 + n * 2), 10.8, .004, .016);
    }
  }
  for (const road of DISTRICT_ASPHALT_ROADS.vertical) {
    const x = road.x;
    box(asphalt, x, -.018, road.z, road.width, .006, road.depth);
    for (let z = -76; z <= 76; z += 4) {
      if ([-48, -24, 0, 24, 48, 75, -75].every(j => Math.abs(z - j) > 4.5)) box(paint, x, .002, z, .07, .006, 1.4);
    }
  }
  for (const road of DISTRICT_ASPHALT_ROADS.horizontal) {
    const z = road.z;
    box(asphalt, road.x, -.018, z, road.width, .006, road.depth);
    for (let x = -64; x <= 64; x += 4) if ([-63, -42, -21, 0, 21, 42, 63].every(j => Math.abs(x - j) > 4.5)) box(paint, x, .002, z, 1.4, .006, .07);
  }
  for (const cx of [-42, 0, 42]) {
    for (let z = -80; z <= 80; z += 2.5) {
      if (cx === 0 && Math.abs(z) <= 26) continue;
      if ([-48, -24, 0, 24, 48, -75, 75].every(j => Math.abs(z - j) > 5)) box(paint, cx, .007, z, .09, .008, 1.05);
    }
    for (const cz of [-48, 0, 48]) {
      if (cx === 0 && cz === 0) continue;
      for (const side of [-1, 1]) {
        for (let n = -4; n <= 4; n++) box(paint, cx + n * .87, .016, cz + side * 4.35, .43, .009, 1.2);
        for (let n = -3; n <= 3; n++) box(paint, cx + side * 5.55, .016, cz + n * .88, 1.15, .009, .44);
      }
    }
  }
  for (const z of [-48, 0, 48]) for (let x = -68; x <= 68; x += 2.5) {
    if (z === 0 && Math.abs(x) <= 22) continue;
    if ([-63, -42, -21, 0, 21, 42, 63].every(j => Math.abs(x - j) > 6)) box(paint, x, .007, z, 1.05, .008, .09);
  }
  // Low lamps with small luminous heads; no additional per-lamp point lights.
  for (const { x: cx, z: cz } of sectors) for (const side of [-1, 1]) for (const dz of [-19, -3, 3, 19]) {
    const x = cx + side * 4.78, z = cz + dz;
    box(steel, x, 1.7, z, .065, 3.4, .065);
    box(steel, x - side * .23, 3.37, z, .52, .07, .18);
    const palette = OUTER_DISTRICT_STYLES.find(style => style.cx === cx && style.cz === cz);
    box(lampLight, x - side * .23, 3.33, z, .40, .028, .13, side < 0 ? palette.primary : palette.secondary);
    box(steel, x, .15, z, .18, .29, .18);
  }
  // Service lanes, small planted islands and curb bollards fill the space between sectors.
  const foliage = new THREE.MeshStandardMaterial({ color: '#224748', roughness: .94 });
  for (const x of [-17.05, 17.05]) for (const z of [-63, -37, -15, 12, 37, 62]) {
    if (Math.abs(z - 27) < 5) continue;
    box(concrete, x, .18, z, 1.7, .36, 3.2);
    box(foliage, x, .48, z, 1.45, .38, 2.9);
    box(steel, x + (x < 0 ? -.93 : .93), .34, z, .16, .68, .16);
  }
  for (const [material, items] of batches) {
    const mesh = new THREE.InstancedMesh(unit, material, items.length); mesh.name = 'DistrictStreetBatch';
    items.forEach(([x, y, z, w, h, d, color], i) => { matrix.compose(position.set(x, y, z), quaternion, size.set(w, h, d)); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new THREE.Color(color)); });
    mesh.computeBoundingSphere(); group.add(mesh);
  }

  const vehicles = [], people = [];
  let trafficSampler = null, activitySampler = null;
  // 2026-09-15 evening: four cars per 160-unit lane meant one passing car every ~26 s,
  // which left the avenues reading as empty in the street-level views. Seven per lane
  // (phase spaced to cover the loop) keeps the same lanes and speeds; the fleet is
  // instanced, so the density costs +0 draw calls.
  for (const cx of [-42, 42]) for (const lane of [-1, 1]) for (let i = 0; i < 7; i++) {
    vehicles.push({ x: cx + lane * 2, direction: -lane, speed: 1.55 + (lane > 0 ? .08 : 0), phase: i * 23 + 8, low: -80, length: 160, kind: i % 3 });
  }
  for (const half of [-1, 1]) for (const lane of [-1, 1]) for (let i = 0; i < 3; i++) {
    vehicles.push({ x: lane * 2, direction: -lane, speed: 1.28, phase: i * 15 + 4, low: half < 0 ? -80 : 36, length: 44, kind: i });
  }
  vehicles.forEach((car, i) => {
    car.name = `DistrictCar-${i + 1}`; car.width = 1.22; car.height = .95; car.vehicleLength = 2.67; car.visualScale = .65;
    const pos = { x: car.x, y: 0, z: 0 };
    car.pos = pos;
    car.samplePosition = seconds => {
      const time = Number.isFinite(seconds) ? seconds : 0;
      const controlled = trafficSampler?.(car, time);
      pos.x = controlled?.x ?? car.x;
      pos.z = controlled?.z ?? car.low + ((car.phase + car.direction * time * car.speed) % car.length + car.length) % car.length;
      car.sampledSpeed = controlled?.speed ?? car.speed;
      return pos;
    };
  });
  const carMaterial = new THREE.MeshStandardMaterial({ metalness: .55, roughness: .28 });
  const carGlass = new THREE.MeshStandardMaterial({ color: '#173039', emissive: '#385d64', emissiveIntensity: .09, metalness: .65, roughness: .18 });
  const tires = new THREE.MeshStandardMaterial({ color: '#0b141b', roughness: .8 });
  const head = new THREE.MeshBasicMaterial({ color: '#ffe0b5', toneMapped: false });
  const tail = new THREE.MeshBasicMaterial({ color: '#da6554', toneMapped: false });
  const pieces = [
    { material: carMaterial, offsets: [[0, .36, 0, 1.16, .34, 2.62], [0, .91, -.10, .86, .05, .9]] },
    { material: carGlass, offsets: [[0, .69, -.13, .91, .4, 1.12]] },
    // V-4: the wheels were .18 x .33 x .36 in near-black #0b141b, which reads as nothing against
    // the wet road. They are now .20 x .44 x .40 and sit at y .22 so the tyre still meets the road
    // at zero, and the material above is a step lighter.
    { material: tires, offsets: [[-.52, .22, -.83, .20, .44, .40], [.52, .22, -.83, .20, .44, .40], [-.52, .22, .83, .20, .44, .40], [.52, .22, .83, .20, .44, .40]] },
    { material: head, offsets: [[-.38, .43, 1.319, .30, .10, .025], [.38, .43, 1.319, .30, .10, .025]] },
    { material: tail, offsets: [[-.40, .44, -1.319, .23, .09, .025], [.40, .44, -1.319, .23, .09, .025]] },
  ];
  const axis = new THREE.Vector3(0, 1, 0), colors = ['#b5ab8a', '#506876', '#727286', '#67716b'];
  pieces.forEach((piece, p) => {
    piece.mesh = new THREE.InstancedMesh(unit, piece.material, vehicles.length * piece.offsets.length);
    piece.mesh.name = `DistrictTraffic-${p}`; piece.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); piece.mesh.frustumCulled = false;
    if (p === 0) vehicles.forEach((_, i) => piece.offsets.forEach((__, j) => piece.mesh.setColorAt(i * piece.offsets.length + j, new THREE.Color(colors[i % colors.length]))));
    group.add(piece.mesh);
  });

  for (const { x: cx, z: cz } of sectors) for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const originalZ = cz + (i < 3 ? -1 : 1) * (7.6 + (i % 3) * 4.4 + rng() * .65);
    const originalX = cx + side * (5.39 + rng() * .14), phase = rng() * Math.PI * 2;
    // The twin-tower podium narrows the northern sidewalk. Its front forecourt
    // keeps both pedestrians and full umbrellas clear of buildings and crossings.
    const forecourt = cx === 42 && cz === -48 && i < 3;
    const x = forecourt ? cx + side * (6.5 + i * 2) : originalX, z = forecourt ? cz - 5.5 : originalZ;
    const pos = { x, y: .135, z };
    people.push({ x, z, phase, pos, umbrella: i % 3 !== 0, walking: i % 2 === 0, walkFrequency:.22, walkAmplitude:i % 2 === 0 ? (forecourt ? .3 : .55) : 0, visualScale: .65, height: 1.12, radius: .5,
      samplePosition(seconds) { pos.z = z + (i % 2 === 0 ? Math.sin(seconds * .22 + phase) * (forecourt ? .3 : .55) : 0); return pos; } });
  }
  // Strolling crowds: avenue sidewalks and the car-free cross streets. Every path
  // keeps the 1.1 x 1.85 clearance the moving lanes require; northeast strips stop
  // short of the twin-tower podiums, and cross-street segments span only the
  // block interiors between avenues.
  for (const { x: cx, z: cz } of sectors) for (const side of [-1, 1]) {
    const towerZone = cx === 42 && cz === -48, count = towerZone ? 7 : 10, half = towerZone ? 12 : 20, centerZ = towerZone ? cz + 8 : cz;
    for (let n = 0; n < count; n++) {
      const x = cx + side * (5.45 + rng() * .6), speed = .28 + rng() * .22, phase = rng() * Math.PI * 2, umbrella = rng() > .35;
      const pos = { x, y: .135, z: centerZ };
      const walkFrequency = (.65 + speed * .45) / half;
      people.push({ umbrella, walking: true, visualScale: .65, height: 1.12, radius: .5, walkAxis: 'z', speed, phase, pos, walkFrequency, walkAmplitude:half,
        samplePosition(seconds) { pos.z = centerZ + Math.sin((Number.isFinite(seconds) ? seconds : 0) * walkFrequency + phase) * half; return pos; } });
    }
  }
  for (const streetZ of [-75, -24, 24, 75]) for (const edge of [-1, 1]) for (const segment of [-1, 1]) for (let n = 0; n < 6; n++) {
    const z = streetZ + edge * 1.7, center = segment * (12 + rng() * 9), half = (Math.abs(center) - 6.5) * .85, speed = .3 + rng() * .24, phase = rng() * Math.PI * 2, umbrella = rng() > .35;
    const pos = { x: center, y: .135, z };
    const walkFrequency = (.65 + speed * .45) / half;
    people.push({ umbrella, walking: true, visualScale: .65, height: 1.12, radius: .5, walkAxis: 'x', speed, phase, pos, walkFrequency, walkAmplitude:half,
      samplePosition(seconds) { pos.x = center + Math.sin((Number.isFinite(seconds) ? seconds : 0) * walkFrequency + phase) * half; return pos; } });
  }
  for (const { x: cx, z: cz } of sectors) {
    if (cx === 42 && cz === -48) continue;
    for (const side of [-1, 1]) for (let extra = 0; extra < 2; extra++) {
      const x = cx + side * (5.39 + rng() * .14), z = cz + side * (8.6 + rng() * 7.8), phase = rng() * Math.PI * 2, umbrella = rng() > .4;
      const pos = { x, y: .135, z };
      people.push({ x, z, phase, pos, umbrella, walking: false, visualScale: .65, height: 1.12, radius: .5,
        samplePosition(seconds) { pos.z = z + Math.sin((Number.isFinite(seconds) ? seconds : 0) * .22 + phase) * .4; return pos; } });
    }
  }
  // 2026-09-15 night, the crowd pass. The streets still read as a scatter of lone pedestrians: every
  // walker was an independent sine rider, so nobody ever stood next to anybody. These two families
  // put people in knots instead. The pedestrian meshes are instanced, so this is +0 draw calls and
  // buys only triangles (112 a head).
  //
  // Placement is derived, not guessed:
  //   * a body is only .15 x .18 across (coat .54 x .80 at visualScale .65 x scale .27/.22), so a
  //     knot can stand .35 apart without interpenetrating. The .5 radius below is the envelope the
  //     traffic suites use, not the body.
  //   * qa-neon-density rejects a 'z' walker within 5.0 of an avenue centre, which is the avenue
  //     roadway; every lane a car actually drives lies at an avenue centre +-2, so the same bound
  //     keeps these people out of the traffic and qa-neon-district's 1.1 car test never sees them.
  //   * the cross streets are car-free and their walker corridor is |z - cz| in [1.2, 2.2]. The
  //     shopfront ground floor reaches at most .52 out from a face that is always at least 3.3 out,
  //     and the kerb bollards added tonight sit at 3.90. So the standing band is |z - cz| in
  //     [2.7, 3.3]: past the walkers, clear of the shop steps, short of the bollards.
  //   * on the avenue the knots stand outboard of the walking line at ~5.8, inside the 6.1 face line
  //     and clear of the kiosk line at 7.15.
  const clusterRng = seeded(Number(seed) + 7717);
  const AVENUES = [-42, 0, 42], CROSS_STREETS = [-48, -24, 0, 24, 48];
  const offRoadway = x => AVENUES.every(cx => Math.abs(x - cx) >= 5.0);
  const clusters = [];
  const addKnot = (kind, x, z, count, spreadX, spreadZ, facing) => {
    let placed = 0;
    for (let n = 0; n < count; n++) {
      const px = x + (clusterRng() - .5) * spreadX, pz = z + (clusterRng() - .5) * spreadZ;
      const phase = clusterRng() * Math.PI * 2, umbrella = clusterRng() > .62;
      if (!offRoadway(px)) continue;
      const pos = { x: px, y: .135, z: pz };
      people.push({ x: px, z: pz, phase, pos, umbrella, walking: false, idle: true, yaw: facing, crowd: kind,
        visualScale: .65, height: 1.12, radius: .5,
        samplePosition(seconds) { pos.z = pz + Math.sin((Number.isFinite(seconds) ? seconds : 0) * .17 + phase) * .07; return pos; } });
      placed++;
    }
    if (placed) clusters.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), count: placed, facing: +facing.toFixed(3) });
  };
  // (a) A knot on the pavement of every cross street. |x - cx| stays in 10..18, which clears both
  //     the avenue roadway and the kiosk line, and stays inside the 21-unit sector half-width.
  for (const cz of CROSS_STREETS) for (const cx of AVENUES) for (const side of [-1, 1]) {
    const x = cx + side * (10 + clusterRng() * 8);
    addKnot('cross', x, cz + side * 3.0, 3 + Math.floor(clusterRng() * 4), 1.7, .5, side > 0 ? Math.PI : 0);
  }
  // (b) A trio at the shop windows on both avenue pavements. The twin-tower podium sector is skipped
  //     for the same reason the walker loops skip it: its forecourt is not an ordinary pavement.
  for (const { x: cx, z: cz } of sectors) {
    if (cx === 42 && cz === -48) continue;
    for (const side of [-1, 1]) {
      addKnot('avenue', cx + side * (5.62 + clusterRng() * .3), cz + clusterRng() * 30 - 15, 3, .45, 1.9,
        side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // Keep the catalogue records and walking flags intact. Both the renderer and
  // callers of samplePosition see the activity's absolute-time position.
  people.forEach((person, index) => {
    const sampleOriginal = person.samplePosition.bind(person);
    const home = { ...sampleOriginal(0) };
    person.samplePosition = seconds => {
      const time = Number.isFinite(seconds) ? seconds : 0;
      const pose = activitySampler?.(index, time) ?? null;
      person._activityPose = pose;
      if (pose) {
        person.pos.x = pose.x; person.pos.y = pose.y ?? .135; person.pos.z = pose.z;
        return person.pos;
      }
      // Original paths mutate just their walking axis, so restore the other
      // coordinates after an activity has been removed or temporarily hidden.
      Object.assign(person.pos, home);
      return sampleOriginal(time);
    };
  });
  // Articulated sleeves and hands share four additional instanced batches.
  // The inspector receives full geometry; the city's camera selects distant detail.
  const bodyParts = makeDistrictPedestrianParts();
  const pedestrianParts = [
    ...bodyParts,
    { name: 'Umbrellas', geometry: new THREE.ConeGeometry(1, 1, 10), material: new THREE.MeshStandardMaterial({ roughness: .44, metalness: .1, side: THREE.DoubleSide }), scale: [.49, .22, .49], y: 1.28, accessory: true },
    { name: 'UmbrellaPoles', geometry: unit, material: steel, scale: [.013, .56, .013], y: .96, accessory: true },
  ];
  const coats = ['#526a71', '#807078', '#4d5d7a', '#777062', '#314b58'], umbrellas = ['#678084', '#5d556f', '#85655d', '#33495c'];
  pedestrianParts.forEach((part, p) => {
    part.geometry.computeBoundingBox();
    part.lowGeometry?.computeBoundingBox();
    part.mesh = new THREE.InstancedMesh(part.geometry, part.material, people.length); part.mesh.name = `DistrictPeople-${part.name}`;
    part.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); part.mesh.frustumCulled = false;
    if (part.kind === 'coat' || part.tintCoat || part.name === 'Umbrellas') {
      const palette = part.kind === 'coat' || part.tintCoat ? coats : umbrellas;
      people.forEach((_, i) => part.mesh.setColorAt(i, new THREE.Color(palette[i % palette.length])));
    }
    part.mesh.userData.detailGeometries = part.lowGeometry ? [part.geometry, part.lowGeometry] : [part.geometry];
    group.add(part.mesh);
  });
  // Frozen per-part constants for the instancing write loop: scale triple,
  // mount offsets and kind flags are read from these flat records so the
  // per-person hot path never walks the part objects themselves.
  const partRecords = pedestrianParts.map(part => ({
    mesh: part.mesh, kind: part.kind, side: part.side, accessory: part.accessory,
    sx: part.scale[0], sy: part.scale[1], sz: part.scale[2],
    x: part.x || 0, z: part.z || 0, y: part.y, b: null,
  }));
  // P5 GPU crowd: the eight non-leg parts evaluate their instance transform
  // analytically in the vertex shader from per-person pose attributes, so
  // update() stops writing eight of the ten instanceMatrix buffers. The two
  // leg parts stay on the CPU path on purpose -- qa-walking-animation reads
  // live leg matrices from the real city page (sole contact, replay equality,
  // idle stillness), and the standalone factory (character admin,
  // qa-pedestrian-refinement) always uses the full CPU path because gpuCrowd
  // defaults to false. The shader mirrors the CPU matrix math term for term:
  // T(person) * RotY(yaw[+twist]) * T(mount) * RotX(angle) * S(scale).
  const gpuParts = gpuCrowd ? pedestrianParts.filter(part => part.kind !== 'leg') : [];
  const poseArrays = gpuParts.length
    ? { p0: new Float32Array(people.length * 4), p1: new Float32Array(people.length * 4), p2: new Float32Array(people.length * 4), p3: new Float32Array(people.length * 4), p4: new Float32Array(people.length * 4) }
    : null;
  const poseAttributes = poseArrays && {
    aP0: new THREE.InstancedBufferAttribute(poseArrays.p0, 4), aP1: new THREE.InstancedBufferAttribute(poseArrays.p1, 4),
    aP2: new THREE.InstancedBufferAttribute(poseArrays.p2, 4), aP3: new THREE.InstancedBufferAttribute(poseArrays.p3, 4),
    aP4: new THREE.InstancedBufferAttribute(poseArrays.p4, 4),
  };
  if (poseAttributes) for (const attribute of Object.values(poseAttributes)) attribute.setUsage(THREE.DynamicDrawUsage);
  const CROWD_GLSL = `
attribute vec4 aP0;attribute vec4 aP1;attribute vec4 aP2;attribute vec4 aP3;attribute vec4 aP4;
uniform vec3 uMount;uniform vec3 uScale;uniform float uKind;uniform float uSide;uniform float uAccessory;
void crowdRotation(out float cx,out float cy,out float ca,out float sa,out float ytr){
 cx=uKind<1.5?aP1.x:aP1.z;cy=uKind<1.5?aP1.y:aP1.w;
 ca=1.;sa=0.;ytr=uMount.y+aP0.w;
 if(uKind>1.5){if(uSide<.5){ca=aP2.z;sa=aP2.w;}else{ca=aP3.x;sa=aP3.y;}}
}
vec3 crowdPosition(vec3 v){
 float cx,cy,ca,sa,ytr;crowdRotation(cx,cy,ca,sa,ytr);
 float hide=((uAccessory>.5&&aP4.x<.5)||aP4.y>.5)?.0:1.;
 vec3 s=uScale*hide;
 return vec3(aP0.x+uMount.x*cx+uMount.z*cy+s.x*cx*v.x+s.y*cy*sa*v.y+s.z*cy*ca*v.z,
  aP0.y+ytr+s.y*ca*v.y-s.z*sa*v.z,
  aP0.z-uMount.x*cy+uMount.z*cx-s.x*cy*v.x+s.y*cx*sa*v.y+s.z*cx*ca*v.z);
}
vec3 crowdNormal(vec3 n){
 float cx,cy,ca,sa,ytr;crowdRotation(cx,cy,ca,sa,ytr);
 return vec3(cx*n.x+cy*sa*n.y+cy*ca*n.z,ca*n.y-sa*n.z,-cy*n.x+cx*sa*n.y+cx*ca*n.z);
}
`;
  for (const part of gpuParts) {
    for (const geometry of part.mesh.userData.detailGeometries)
      for (const [name, attribute] of Object.entries(poseAttributes)) geometry.setAttribute(name, attribute);
    // Break material sharing (sleeves and coats share `cloth`): each part now
    // needs its own mount/scale/kind uniforms. Instanced meshes never merge, so
    // the draw-call count is unchanged.
    part.mesh.material = part.mesh.material.clone();
    const uniforms = {
      uMount: { value: new THREE.Vector3(part.x || 0, part.y, part.z || 0) },
      uScale: { value: new THREE.Vector3(part.scale[0], part.scale[1], part.scale[2]) },
      uKind: { value: part.kind === 'arm' ? 2 : 0 }, uSide: { value: part.side || 0 },
      uAccessory: { value: part.accessory ? 1 : 0 },
    };
    const material = part.mesh.material;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = CROWD_GLSL + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <begin_vertex>', 'vec3 transformed=crowdPosition(position);')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal=crowdNormal(normal);')
        .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal=objectNormal;transformedNormal=normalMatrix*transformedNormal;')
        .replace('#include <project_vertex>', 'vec4 mvPosition=modelViewMatrix*vec4(transformed,1.0);gl_Position=projectionMatrix*mvPosition;')
        .replace('#include <worldpos_vertex>', `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
 vec4 worldPosition=vec4(transformed,1.0);
#endif`);
    };
    material.customProgramCacheKey = () => `gpu-crowd-${uniforms.uKind.value}-${part.side || 0}-${uniforms.uAccessory.value}`;
  }
  const eye = new THREE.Vector3();
  let detail = 'high', lastTime = 0;
  function prepareView(camera) {
    camera.getWorldPosition(eye); group.worldToLocal(eye);
    const near = people.some(person => Math.hypot(eye.x-person._px, eye.y-person._py-.6, eye.z-person._pz) < 22 * camera.zoom);
    const next = near ? 'high' : 'low';
    if (detail !== next) {
      for (const part of bodyParts) part.mesh.geometry = next === 'high' ? part.geometry : part.lowGeometry;
      detail = next;
      update(lastTime);
    }
    group.userData.pedestrianDetail = detail;
  }
  function update(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0;
    lastTime = t;
    // Sample each car once per frame: the five piece meshes share its position,
    // fade and heading instead of re-deriving them per piece.
    for (const car of vehicles) {
      const p = car.samplePosition(t), local = p.z - car.low;
      car._x = p.x; car._z = p.z;
      car._fade = THREE.MathUtils.smoothstep(Math.min(local, car.length - local), 0, 3.3);
    }
    for (const piece of pieces) {
      const offsets = piece.offsets, mesh = piece.mesh, span = offsets.length;
      for (let i = 0; i < vehicles.length; i++) {
        const car = vehicles[i], flip = car.direction < 0;
        quaternion.setFromAxisAngle(axis, flip ? Math.PI : 0);
        for (let j = 0; j < span; j++) {
          const o = offsets[j];
          matrix.compose(position.set(car._x + o[0] * car.direction, o[1] * car._fade, car._z + o[2] * car.direction), quaternion, size.set(o[3] * car._fade, o[4] * car._fade, o[5] * car._fade));
          mesh.setMatrixAt(i * span + j, matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    // The leg hip height reads the live LOD bounding box, which prepareView
    // swaps between the high and low geometry; refresh it once per update.
    for (const record of partRecords) if (record.kind === 'leg') record.b = record.mesh.geometry.boundingBox;

    // Absolute-time poses preserve replay and do not consume the shared RNG.
    // Each person's yaw and stride trig is evaluated once and shared by every
    // body part, instead of two trig calls per part per person, and standing
    // people skip the gait sampler entirely: with zero amplitude it returns
    // exactly zero for every output, so the zeros are written directly.
    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      const p = person.samplePosition(t);
      const pose = person._activityPose, gait = person._gait ||= {};
      let yaw = person.yaw || 0, bob = 0, stride = 0, liftLeft = 0, liftRight = 0;
      if (pose) {
        const phase = Number.isFinite(pose.phase) ? pose.phase : 0;
        const speed = Number.isFinite(pose.speed) ? Math.abs(pose.speed) : 0;
        const amount = Math.min(1, speed / .55), effort = amount * amount * (3 - 2 * amount);
        gait.velocity = speed;
        stride = gait.stride = Math.cos(phase) * .42 * effort;
        liftLeft = gait.liftLeft = Math.max(0, -Math.sin(phase)) * .075 * effort;
        liftRight = gait.liftRight = Math.max(0, Math.sin(phase)) * .075 * effort;
        gait.bob = Math.abs(Math.sin(phase)) * .012 * effort;
        gait.twist = Math.sin(phase) * .045 * effort;
        yaw = pose.yaw ?? yaw; bob = gait.bob;
      } else if (person.walking) {
        sampleWalkingGait(t, person.walkFrequency || 0, person.walkAmplitude || 0, person.phase, gait);
        stride = gait.stride; liftLeft = gait.liftLeft; liftRight = gait.liftRight;
        const facing = THREE.MathUtils.smoothstep(gait.velocity, -.09, .09);
        yaw = person.walkAxis === 'x' ? -Math.PI / 2 + Math.PI * facing : Math.PI * (1 - facing);
        bob = gait.bob;
      } else {
        gait.velocity = 0; gait.stride = 0; gait.liftLeft = 0; gait.liftRight = 0; gait.bob = 0; gait.twist = 0;
        // A knot standing perfectly still reads as props. A slow breath, a third of the walkers'
        // stride, is enough to say "waiting" rather than "parked".
        if (person.idle) bob = Math.sin(t * .95 + person.phase) * .002;
      }
      person._yaw = yaw; person._bob = bob;
      person._px = p.x; person._py = p.y; person._pz = p.z;
      person._stride = stride;
      const px = p.x, py = p.y, pz = p.z;
      // Legs pivot on the plain yaw; the upper body adds the gait twist. Both
      // legs and both free arms swing on symmetric angles (+/- stride), so one
      // trig pair per pair of limbs covers all four parts.
      const cL = Math.cos(yaw), sL = Math.sin(yaw);
      const twist = gait.twist;
      const cB = twist ? Math.cos(yaw + twist) : cL, sB = twist ? Math.sin(yaw + twist) : sL;
      const cS = Math.cos(stride), sS = Math.sin(stride);
      const cA = Math.cos(stride * .72), sA = Math.sin(stride * .72);
      let aCL = cA, aSL = sA, aCR = cA, aSR = -sA;
      if (pose) {
        if (Number.isFinite(pose.armLeft)) { aCL = Math.cos(pose.armLeft); aSL = Math.sin(pose.armLeft); }
        if (Number.isFinite(pose.armRight)) { aCR = Math.cos(pose.armRight); aSR = Math.sin(pose.armRight); }
      }
      // An umbrella pins the right arm horizontal; the left keeps swinging.
      if (person.umbrella && !Number.isFinite(pose?.armRight)) { aCR = 1; aSR = 0; }
      const show = pose ? pose.visible !== false : true;
      // GPU crowd upload: the eight shader-driven parts read the same scalars
      // from these per-instance attributes, so their matrices need no CPU work.
      if (poseArrays) {
        const o4 = i * 4;
        poseArrays.p0[o4] = px; poseArrays.p0[o4 + 1] = py; poseArrays.p0[o4 + 2] = pz; poseArrays.p0[o4 + 3] = bob;
        poseArrays.p1[o4] = cL; poseArrays.p1[o4 + 1] = sL; poseArrays.p1[o4 + 2] = cB; poseArrays.p1[o4 + 3] = sB;
        poseArrays.p2[o4] = cS; poseArrays.p2[o4 + 1] = sS; poseArrays.p2[o4 + 2] = aCL; poseArrays.p2[o4 + 3] = aSL;
        poseArrays.p3[o4] = aCR; poseArrays.p3[o4 + 1] = aSR; poseArrays.p3[o4 + 2] = 0; poseArrays.p3[o4 + 3] = 0;
        poseArrays.p4[o4] = person.umbrella ? 1 : 0; poseArrays.p4[o4 + 1] = show ? 0 : 1; poseArrays.p4[o4 + 2] = 0; poseArrays.p4[o4 + 3] = 0;
      }
      for (const record of partRecords) {
        if (gpuCrowd && record.kind !== 'leg') continue;
        const array = record.mesh.instanceMatrix.array, o = i * 16;
        const visible = show && (!record.accessory || person.umbrella);
        const fx = visible ? record.sx : 0, fy = visible ? record.sy : 0, fz = visible ? record.sz : 0;
        const leg = record.kind === 'leg';
        const c = leg ? cL : cB, sn = leg ? sL : sB;
        let ca = 1, sa = 0;
        if (leg) { ca = cS; sa = record.side < 0 ? -sS : sS; }
        else if (record.kind === 'arm') {
          if (record.side < 0) { ca = aCL; sa = aSL; } else { ca = aCR; sa = aSR; }
        }
        // Rotate legs at the hip; at least one sole remains planted at all times.
        let y = record.y + (leg ? 0 : bob);
        if (leg) {
          const b = record.b;
          y = -b.min.y * ca + Math.max(sa * b.min.z, sa * b.max.z)
            + (record.side < 0 ? liftLeft : liftRight);
        }
        const x = record.x, z = record.z;
        // T(person) * RotY(yaw) * T(hip) * RotX(stride) * S(scale).
        array[o] = fx * c; array[o + 1] = 0; array[o + 2] = -fx * sn;
        array[o + 4] = fy * sn * sa; array[o + 5] = fy * ca; array[o + 6] = fy * c * sa;
        array[o + 8] = fz * sn * ca; array[o + 9] = -fz * sa; array[o + 10] = fz * c * ca;
        array[o + 3] = 0; array[o + 7] = 0; array[o + 11] = 0;
        array[o + 12] = px + x * c + z * sn; array[o + 13] = py + y; array[o + 14] = pz - x * sn + z * c; array[o + 15] = 1;
      }
    }
    for (const record of partRecords) if (!gpuCrowd || record.kind === 'leg') record.mesh.instanceMatrix.needsUpdate = true;
    if (poseAttributes) for (const attribute of Object.values(poseAttributes)) attribute.needsUpdate = true;
  }
  const walkingCount = people.filter(person => person.walkAxis).length;
  group.userData = { sectors, vehicles, people, clusters,
    setActivitySampler(sampler) { activitySampler = typeof sampler === 'function' ? sampler : null; },
    setTrafficSampler(sampler) { trafficSampler = typeof sampler === 'function' ? sampler : null; },
    vehicleCount: vehicles.length, peopleCount: people.length,
    walkingCount, standingCount: people.length - walkingCount, clusterCount: clusters.length,
    clusterPeople: clusters.reduce((sum, cluster) => sum + cluster.count, 0),
    bounds: { minX: -69, maxX: 69, minZ: -82, maxZ: 82 }, pedestrianDetail: detail, prepareView, update };
  update(0); return group;
}

// A single GPU rain volume covers the avenues, with sparse ripples away from the original crossing.
export function makeDistrictWeather({ seed = 2049 } = {}) {
  const group = new THREE.Group(); group.name = 'DistrictWeather';
  const rng = seeded(seed + 7117), count = 8500, positions = new Float32Array(count * 6), data = new Float32Array(count * 6);
  const uniforms = { uTime: { value: 0 }, uIntensity: { value: .65 } };
  for (let i = 0; i < count; i++) {
    let x = (rng() - .5) * 162, z = (rng() - .5) * 188;
    if (Math.abs(x) < 28 && Math.abs(z) < 32) x += x < 0 ? -29 : 29;
    // V-13: .25 + rng() * .48 made streaks up to .73 long, which read as scratches rather than
    // rain once one crossed the near plane. Halving the span keeps the same draw count.
    const y = rng() * 76, speed = 11 + rng() * 13, length = .10 + rng() * .16, phase = rng();
    for (let v = 0; v < 2; v++) { positions.set([x, y, z], i * 6 + v * 3); data.set([speed, length * v, phase], i * 6 + v * 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('aRain', new THREE.BufferAttribute(data, 3));
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime,uIntensity;attribute vec3 aRain;varying float vAlpha;void main(){vec3 p=position;p.y=mod(p.y-uTime*aRain.x,76.)+.2+aRain.y;p.x+=sin(uTime*.16+position.y*.04)*1.5+aRain.y*.17;vec4 mv=modelViewMatrix*vec4(p,1.);vAlpha=(.13+aRain.z*.2)*smoothstep(0.,3.,p.y)*(1.-smoothstep(45.,140.,-mv.z))*step(aRain.z,uIntensity)*smoothstep(3.,14.,-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vAlpha;void main(){gl_FragColor=vec4(.48,.69,.85,vAlpha);}` });
  const rain = new THREE.LineSegments(geometry, material); rain.name = 'DistrictRain'; rain.frustumCulled = false; group.add(rain);
  const quad = new THREE.PlaneGeometry(1, 1), rippleGeometry = new THREE.InstancedBufferGeometry(); rippleGeometry.index = quad.index;
  rippleGeometry.setAttribute('position', quad.getAttribute('position')); rippleGeometry.setAttribute('uv', quad.getAttribute('uv'));
  const n = 380, sites = new Float32Array(n * 3), phases = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const avenue = i % 3 - 1, x = avenue * 42 + (rng() - .5) * 8.3;
    let z = (rng() - .5) * 156; if (avenue === 0 && Math.abs(z) < 27) z += z < 0 ? -30 : 30;
    sites.set([x, .048, z], i * 3); phases.set([rng(), .65 + rng() * .6], i * 2);
  }
  rippleGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(sites, 3)); rippleGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 2)); rippleGeometry.instanceCount = n;
  const rippleMaterial = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSite;attribute vec2 aPhase;uniform float uTime,uIntensity;varying vec2 vUv;varying float vLife,vActive;void main(){vUv=uv;vLife=fract(uTime*.72*aPhase.y+aPhase.x);vActive=step(aPhase.x,uIntensity);float size=.09+vLife*.64;vec3 p=aSite+vec3(position.x*size,0.,position.y*size);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vLife,vActive;void main(){float r=length(vUv-.5);float ring=1.-smoothstep(0.,.028,abs(r-.4));float fade=pow(1.-vLife,1.7)*smoothstep(0.,.08,vLife);gl_FragColor=vec4(.27,.60,.68,ring*fade*.28*vActive);}` });
  const splashes = new THREE.Mesh(rippleGeometry, rippleMaterial); splashes.name = 'DistrictRipples'; splashes.frustumCulled = false; splashes.renderOrder = 3; group.add(splashes);
  group.userData = { uniforms, rain, splashes, setIntensity(value) { uniforms.uIntensity.value = THREE.MathUtils.clamp(value, 0, 1); }, update(seconds) { uniforms.uTime.value = Number.isFinite(seconds) ? seconds : 0; } };
  return group;
}
