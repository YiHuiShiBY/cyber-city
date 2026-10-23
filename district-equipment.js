import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
 * Rooftop searchlights and clamped facade modules.
 *
 * Both are equipment bolted onto existing masses, so they sit outside the
 * `architecture` group on purpose: the declared height bands keep describing the
 * buildings themselves rather than their masts. A searchlight base stands inside
 * its host footprint and starts exactly at that roof, and every facade module
 * overlaps its host footprint while clearing the avenue corridor below.
 *
 * Five draws in total: static structure, static lit details, instanced turret
 * heads, instanced lenses (sharing one transform with the heads) and one
 * instanced beam shader.
 */
export function makeDistrictEquipment({ seed = 2049, buildings = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictEquipment';
  const rng = seeded(Number(seed) + 5153);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  // A unit cone whose apex sits at the origin and whose base is one unit along +y.
  const beamCone = new THREE.ConeGeometry(1, 1, 10, 1, true);
  beamCone.rotateX(Math.PI);
  beamCone.translate(0, .5, 0);

  const structure = [], litParts = [];
  function bake(list, geometry, x, y, z, sx, sy, sz) {
    list.push(geometry.clone().scale(sx, sy, sz).translate(x, y, z).toNonIndexed());
  }

  // --- Rooftop searchlights -------------------------------------------------
  const bySector = new Map();
  for (const building of buildings) {
    if (!bySector.has(building.sector)) bySector.set(building.sector, []);
    bySector.get(building.sector).push(building);
  }
  const searchlights = [];
  for (const list of bySector.values()) {
    const centre = list.reduce((sum, b) => sum + b.x, 0) / list.length;
    const ranked = [...list].sort((a, b) => b.height - a.height);
    const picks = ranked.slice(0, 2);
    if (ranked.length > 3 && ranked[0].height >= 20) picks.push(ranked[2]);
    for (const host of picks) {
      const inward = Math.sign(host.x - centre) || 1;
      const mastHeight = 2.4 + rng() * 2.1;
      const baseX = host.x - inward * host.width * .26;
      const baseZ = host.z + host.depth * .18;
      const roof = .15 + host.height;
      bake(structure, unit, baseX, roof + mastHeight / 2, baseZ, .38, mastHeight, .38);
      bake(structure, unitCylinder, baseX, roof + mastHeight + .09, baseZ, .34, .18, .34);
      searchlights.push({
        host: { x: host.x, z: host.z, width: host.width, depth: host.depth, height: host.height, sector: host.sector },
        x: baseX, y: roof + mastHeight + .30, z: baseZ,
        phase: rng() * Math.PI * 2, sweep: .05 + rng() * .055,
        wobble: .10 + rng() * .12, tiltAngle: .30 + rng() * .16,
        length: 30 + rng() * 16, spread: 1.5 + rng() * 1.1,
        color: new THREE.Color(['#dff4ff', '#ffe6c2', '#e8dcff'][searchlights.length % 3]),
      });
    }
  }

  // --- Clamped facade modules ----------------------------------------------
  const moduleKinds = [
    { size: [1.35, .80, .95], lens: [1.05, .16, .12] },
    { size: [.85, .60, 1.05], lens: [.62, .10, .12] },
    { size: [.55, 1.35, .62], lens: [.36, .10, .10] },
    { size: [1.05, .30, 1.25], lens: [.80, .09, .16] },
  ];
  const moduleRecords = [];
  for (const host of buildings) {
    const sector = bySector.get(host.sector);
    const centre = sector.reduce((sum, b) => sum + b.x, 0) / sector.length;
    const inward = Math.sign(host.x - centre) || 1;
    // Modules clamp onto the real mass, not the conservative footprint: the style
    // builders inset their shells by up to .36 per side, so anchoring to the
    // footprint would leave the pod floating just off the facade.
    const bounds = host.actualBounds;
    const minX = bounds.min[0], maxX = bounds.max[0], minY = bounds.min[1], maxY = bounds.max[1];
    const minZ = bounds.min[2], maxZ = bounds.max[2];
    const count = 2 + Math.floor(rng() * 2);
    for (let index = 0; index < count; index++) {
      const kind = moduleKinds[Math.floor(rng() * moduleKinds.length)];
      const facingInward = rng() > .22;
      const embed = Math.min(.22, kind.size[0] / 2 - .05);
      const faceX = facingInward ? (inward > 0 ? minX : maxX) : (inward > 0 ? maxX : minX);
      const x = faceX + (facingInward ? -inward : inward) * (kind.size[0] / 2 - embed);
      // Off-centre in z so a cross-avenue bridge deck (0.9 wide on the building
      // centre line) always clears modules mounted on the same facade, and never
      // deeper than the real facade is wide.
      const room = (maxZ - minZ) / 2 - kind.size[2] / 2 - .55;
      if (room < 0) continue;
      const zOffset = (rng() > .5 ? 1 : -1) * (.55 + rng() * room);
      const z = host.z + zOffset;
      // Keep the pod above head height and below the real roof; skip the mass
      // entirely when it is too short to hold one.
      const low = minY + 2.15 + kind.size[1] / 2, high = maxY - .1 - kind.size[1] / 2;
      if (high <= low) continue;
      const y = low + rng() * (high - low);
      bake(structure, unit, x, y, z, kind.size[0], kind.size[1], kind.size[2]);
      // The lens strip sits on the module face that looks away from its host.
      bake(litParts, unit, x + (facingInward ? -inward : inward) * (kind.size[0] / 2 + .04), y, z,
        .06, kind.size[1] * .5, kind.size[2] * .78);
      moduleRecords.push({
        x, y, z, size: [kind.size[0], kind.size[1], kind.size[2]],
        host: { x: host.x, z: host.z, width: host.width, depth: host.depth, height: host.height, sector: host.sector },
        hostBounds: bounds,
      });
    }
  }
  const moduleCount = moduleRecords.length;

  // --- Rooftop variants: a greenhouse, a billboard or a light-string bar on
  // roughly two thirds of the masses, breaking up the repeated water tanks.
  // Everything sits on the roof plane inside the footprint.
  let roofCount = 0;
  for (const host of buildings) {
    if (rng() > .68) continue;
    const b = host.actualBounds;
    const roofY = .15 + host.height;
    const cxh = (b.min[0] + b.max[0]) / 2, czh = (b.min[2] + b.max[2]) / 2;
    const roomX = (b.max[0] - b.min[0]) / 2 - .5, roomZ = (b.max[2] - b.min[2]) / 2 - .5;
    const ox = (rng() - .5) * 2 * Math.max(0, roomX - .6), oz = (rng() - .5) * 2 * Math.max(0, roomZ - .6);
    const kind = roofCount % 3;
    if (kind === 0) {
      // Greenhouse: glass box with a lit ridge.
      bake(structure, unit, cxh + ox, roofY + .45, czh + oz, 1.7, .9, 1.3);
      bake(litParts, unit, cxh + ox, roofY + .92, czh + oz, 1.74, .06, 1.34);
    } else if (kind === 1) {
      // Billboard: tilted lit panel on a frame, facing the sector street.
      const inward = Math.sign(cxh - (bySector.get(host.sector).reduce((sum, v) => sum + v.x, 0) / bySector.get(host.sector).length)) || 1;
      bake(structure, unit, cxh + ox, roofY + .55, czh + oz, .18, 1.1, 1.9);
      const plate = unit.clone().scale(2.1, 1.15, .09);
      plate.rotateZ(inward * -.18);
      plate.translate(cxh + ox - inward * .35, roofY + 1.45, czh + oz);
      structure.push(plate.toNonIndexed());
      bake(litParts, unit, cxh + ox - inward * .62, roofY + 1.48, czh + oz, .05, .95, 1.6);
    } else {
      // Light-string bar: six bulbs on a low frame along the roof edge.
      bake(structure, unit, cxh + ox, roofY + .38, czh + oz, 2.4, .09, .09);
      for (let bulb = 0; bulb < 6; bulb++) bake(litParts, unit, cxh + ox - 1.0 + bulb * .4, roofY + .30, czh + oz, .12, .14, .12);
    }
    roofCount++;
  }

  function finish(list, material, name) {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(list), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  const structureMesh = finish(structure, new THREE.MeshStandardMaterial({ color: '#2f3f4b', metalness: .62, roughness: .46 }), 'DistrictEquipment-Structure');
  finish(litParts, new THREE.MeshBasicMaterial({ color: '#cfe6ff', toneMapped: false }), 'DistrictEquipment-LitDetails');

  // The turret head, its lens and its beam share one transform, so the housing
  // always points exactly where the light goes.
  function addInstanced(geometry, material, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, searchlights.length));
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  const headGeometry = mergeGeometries([
    unit.clone().scale(1.5, .66, 1.1).toNonIndexed(),
    unit.clone().scale(.22, .34, .92).translate(0, -.42, 0).toNonIndexed(),
  ]);
  const heads = addInstanced(headGeometry, new THREE.MeshStandardMaterial({ color: '#2b3b47', metalness: .72, roughness: .34 }), 'DistrictEquipment-TurretHeads');
  const lenses = addInstanced(unit.clone().scale(.34, .50, .34).translate(0, .16, .30).toNonIndexed(),
    new THREE.MeshBasicMaterial({ color: '#e8f6ff', toneMapped: false }), 'DistrictEquipment-TurretLenses');

  const beamGeometry = new THREE.InstancedBufferGeometry();
  beamGeometry.index = beamCone.index;
  beamGeometry.setAttribute('position', beamCone.getAttribute('position'));
  beamGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, searchlights.length) * 3), 3));
  beamGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, searchlights.length) * 3), 3));
  beamGeometry.setAttribute('aAngles', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, searchlights.length) * 2), 2));
  beamGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, searchlights.length) * 2), 2));
  beamGeometry.instanceCount = Math.max(1, searchlights.length);
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aAngles,aSize;varying float vAlong;varying vec3 vColor;
      void main(){
        vAlong=position.y;vColor=aColor;
        vec3 local=vec3(position.x*aSize.x,position.y*aSize.y,position.z*aSize.x);
        float cy=cos(aAngles.x),sy=sin(aAngles.x),ct=cos(aAngles.y),st=sin(aAngles.y);
        vec3 tilted=vec3(local.x,local.y*ct-local.z*st,local.y*st+local.z*ct);
        vec3 world=aSite+vec3(tilted.x*cy+tilted.z*sy,tilted.y,-tilted.x*sy+tilted.z*cy);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
      }`,
    fragmentShader: `varying float vAlong;varying vec3 vColor;
      void main(){
        float shaft=pow(1.-clamp(vAlong,0.,1.),1.75)*.075;
        float core=(1.-smoothstep(0.,.12,vAlong))*.085;
        gl_FragColor=vec4(vColor,shaft+core);
      }`,
  });
  const beams = new THREE.Mesh(beamGeometry, beamMaterial);
  beams.name = 'DistrictEquipment-Beams';
  beams.frustumCulled = false;
  beams.renderOrder = 4;
  group.add(beams);
  const sites = beamGeometry.getAttribute('aSite'), colors = beamGeometry.getAttribute('aColor');
  const angles = beamGeometry.getAttribute('aAngles'), sizes = beamGeometry.getAttribute('aSize');
  searchlights.forEach((light, index) => {
    sites.setXYZ(index, light.x, light.y, light.z);
    colors.setXYZ(index, light.color.r, light.color.g, light.color.b);
    sizes.setXY(index, light.spread, light.length);
  });
  sites.needsUpdate = colors.needsUpdate = sizes.needsUpdate = true;

  const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1), matrix = new THREE.Matrix4();
  const yawQ = new THREE.Quaternion(), tiltQ = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    for (const [index, light] of searchlights.entries()) {
      const yaw = light.phase + time * light.sweep;
      const tilt = light.tiltAngle + Math.sin(time * light.wobble + light.phase) * .16;
      yawQ.setFromAxisAngle(yAxis, yaw);
      tiltQ.setFromAxisAngle(xAxis, tilt);
      yawQ.multiply(tiltQ);
      position.set(light.x, light.y, light.z);
      matrix.compose(position, yawQ, scale);
      heads.setMatrixAt(index, matrix);
      lenses.setMatrixAt(index, matrix);
      angles.setXY(index, yaw, tilt);
    }
    heads.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    angles.needsUpdate = true;
  }
  update(0);
  group.userData = {
    seed, searchlights, searchlightCount: searchlights.length, moduleRecords, moduleCount, roofCount,
    structureMesh, heads, lenses, beams, update,
  };
  return group;
}
