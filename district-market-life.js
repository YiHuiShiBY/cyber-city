import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CYCLE = 80, TAU = Math.PI * 2, GROUND = .03;
const mod = (value, period) => ((value % period) + period) % period;
const smooth = (value, low, high) => {
  const v = THREE.MathUtils.clamp((value - low) / (high - low), 0, 1);
  return v * v * (3 - 2 * v);
};
const envelope = (t, a, b, c, d) => smooth(t, a, b) * (1 - smooth(t, c, d));
const finiteTime = seconds => Number.isFinite(seconds) ? seconds : 0;
const mixAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * A real FIFO loop on the southern apron of the west market row. The row ends
 * at z=66.293 in the current city; kiosks/trees occupy its northern gaps, while
 * the outer cross street begins at z=72.25. No activity enters either road.
 *
 * No people are built here. Fourteen existing instance indices are sampled in
 * world coordinates: two vendors, eight customers, and four neighbours. All
 * poses, bowls and steam derive from absolute seconds, including random seeks.
 */
export function makeMarketLife({ people = [], actorIndices = [], buildings = [], reserved = [] } = {}) {
  if (actorIndices.length !== 14 || new Set(actorIndices).size !== 14 ||
      actorIndices.some(i => !Number.isInteger(i) || !people[i] || people[i].umbrella)) {
    throw new Error('Market life needs exactly 14 distinct existing people without umbrellas.');
  }
  const group = new THREE.Group(); group.name = 'DistrictMarketLife';
  const indices = actorIndices.slice(), slots = new Map(indices.map((index, slot) => [index, slot]));
  const westRow = buildings.filter(b => b.sector === 'southwest' && b.x < -42);
  const host = westRow.slice().sort((a, b) => b.actualBounds.max[2] - a.actualBounds.max[2])[0];
  const preferredX = host ? host.x - .7 : -52.9;
  const preferredZ = host ? host.actualBounds.max[2] + 2.85 : 69.15;
  const relativePlaces = [
    [0, -.98], [-1.08, -.98], [0, 0], [.9, 0], [1.8, 0], [2.7, 0], [3.6, 0],
    [-1.65, 0], [-1.65, 1.55], [2.7, 1.55], [4.3, 1.55], [4.3, 0],
    [-3.2, -.8], [-3.2, .25], [.3, 2.55], [1.5, 2.55],
  ];
  const rectangleDistance = (x, z, b) => Math.hypot(Math.max(b.min[0] - x, 0, x - b.max[0]),
    Math.max(b.min[2] - z, 0, z - b.max[2]));
  let anchor;
  for (const dz of [0, .2, -.2]) {
    for (const dx of [0, -.45, .45, -.9]) {
      const x = preferredX + dx, z = preferredZ + dz;
      const clear = relativePlaces.every(([px, pz]) => {
        px += x; pz += z;
        return px < -47.2 && pz < 72.1 &&
          buildings.every(b => rectangleDistance(px, pz, b.actualBounds) > .35) &&
          reserved.every(r => Math.hypot(px - r.x, pz - r.z) > .8);
      });
      if (clear) { anchor = [x, z]; break; }
    }
    if (anchor) break;
  }
  if (!anchor) throw new Error('The southern market apron has no clear placement for the activity.');
  const [ax, az] = anchor;
  const point = (x, z) => ({ x: ax + x, z: az + z });
  const queue = [point(0, 0), point(.9, 0), point(1.8, 0), point(2.7, 0), point(3.6, 0)];
  const view = { camera: [ax + 2.0, 5.0, az + 8.4], target: [ax + .5, .83, az + .55] };
  const obstacles = [
    { name: 'serving-counter', min: [ax - 1.4, GROUND, az - .73], max: [ax + 1.4, .78, az - .31] },
    { name: 'shared-table', min: [ax + .62, GROUND, az + 2.27], max: [ax + 1.18, .74, az + 2.83] },
    { name: 'bowl-return', min: [ax + 2.46, GROUND, az + 1.83], max: [ax + 2.94, .68, az + 2.27] },
  ];

  // Each customer advances on the same three-second window, then waits seven
  // seconds. The serving customer leaves BEFORE the following person arrives.
  const left = -Math.PI / 2, front = Math.PI;
  const nodes = [
    [0, 3.6, 0, left], [7, 3.6, 0, left], [10, 2.7, 0, left],
    [17, 2.7, 0, left], [20, 1.8, 0, left], [27, 1.8, 0, left],
    [30, .9, 0, left], [37, .9, 0, left], [40, 0, 0, front],
    [47, 0, 0, front], [52, -1.65, 0, left], [57, -1.65, 1.55, 0],
    [62, -1.65, 1.55, 1.15], [69.5, 2.7, 1.55, Math.PI / 2],
    [70, 2.7, 1.55, 0], [72, 2.7, 1.55, 0], [75, 4.3, 1.55, Math.PI / 2],
    [78, 4.3, 0, front], [80, 3.6, 0, left],
  ].map(([t, x, z, yaw]) => ({ t, x: ax + x, z: az + z, yaw, distance: 0 }));
  for (let i = 1; i < nodes.length; i++) nodes[i].distance = nodes[i - 1].distance +
    Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].z - nodes[i - 1].z);
  const phasePerMeter = TAU * Math.round(nodes.at(-1).distance / .61) / nodes.at(-1).distance;

  function sampleCustomer(slot, seconds) {
    const age = mod(finiteTime(seconds) + (slot - 2) * 10, CYCLE);
    let segment = 1;
    while (segment < nodes.length - 1 && age >= nodes[segment].t) segment++;
    const a = nodes[segment - 1], b = nodes[segment], duration = b.t - a.t;
    const u = (age - a.t) / duration, blend = u * u * (3 - 2 * u);
    const length = b.distance - a.distance, speed = length * 6 * u * (1 - u) / duration;
    let action;
    if (age < 40) action = speed > .008 ? 'advance' : 'queue';
    else if (age < 43.5) action = 'order';
    else if (age < 47) action = 'receive';
    else if (age < 57) action = 'leave';
    else if (age < 62) action = 'eat';
    else if (age < 70) action = 'stroll';
    else if (age < 72) action = 'return-bowl';
    else action = 'return';
    const phase = (a.distance + length * blend) * phasePerMeter;
    const pose = {
      x: THREE.MathUtils.lerp(a.x, b.x, blend), y: GROUND,
      z: THREE.MathUtils.lerp(a.z, b.z, blend), yaw: mixAngle(a.yaw, b.yaw, blend),
      speed, phase, action, visible: true,
    };
    const receive = envelope(age, 43.3, 44.3, 46.2, 47.4);
    const carry = envelope(age, 45.0, 46.2, 71.0, 72.0);
    if (receive > 0 || carry > 0) pose.armLeft = -1.24 * Math.max(receive, carry * .82);
    if (receive > 0) pose.armRight = -1.20 * receive;
    if (action === 'eat') pose.armRight = -1.22 - 1.34 * Math.pow(Math.sin((age - 57) * Math.PI / 2.5), 2);
    if (action === 'return-bowl') pose.armLeft = -1.01 - .36 * Math.sin((age - 70) * Math.PI / 2);
    return pose;
  }

  function sampleVendor(slot, seconds) {
    const t = mod(finiteTime(seconds), CYCLE), serving = mod(t, 10);
    const handoff = envelope(serving, 2.9, 4.0, 6.8, 7.8);
    return {
      x: ax - (slot ? 1.08 : 0), y: GROUND, z: az - .98,
      yaw: slot ? .11 * Math.sin(TAU * t / 10) : -.13 * (1 - handoff) * Math.sin(TAU * t / 10),
      speed: 0, phase: 0, action: slot ? 'cook' : handoff > .3 ? 'serve' : 'greet',
      armLeft: slot ? -.83 - .16 * Math.sin(TAU * t / 5) : -.18,
      armRight: slot ? -1.10 - .20 * Math.cos(TAU * t / 5) : -.25 - handoff * 1.03,
      visible: true,
    };
  }

  function sampleNeighbour(slot, seconds) {
    const t = mod(finiteTime(seconds), CYCLE), wave = Math.sin(TAU * t / 10 + slot);
    if (slot < 12) return {
      ...point(-3.2, slot === 10 ? -.8 : .25), y: GROUND,
      yaw: slot === 10 ? .05 * wave : Math.PI + .05 * wave,
      speed: 0, phase: 0, action: 'chat', armLeft: -.16,
      armRight: -.3 - .63 * smooth(wave, -.2, 1), visible: true,
    };
    const eating = slot === 12;
    return {
      ...point(eating ? .3 : 1.5, 2.55), y: GROUND,
      yaw: eating ? Math.PI / 2 : -Math.PI / 2, speed: 0, phase: 0,
      action: eating ? 'eat' : 'chat', armLeft: -1.02,
      armRight: eating ? -1.2 - 1.3 * Math.pow(Math.sin(TAU * t / 8), 2) : -.45 - .22 * wave,
      visible: true,
    };
  }

  function samplePerson(index, seconds) {
    const slot = slots.get(index);
    if (slot === undefined) return null;
    return slot < 2 ? sampleVendor(slot, seconds) : slot < 10 ? sampleCustomer(slot, seconds) : sampleNeighbour(slot, seconds);
  }

  const solids = [], lights = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  function bake(list, geometry, x, y, z, sx, sy, sz, color, yaw = 0) {
    const source = geometry.clone().scale(sx, sy, sz).rotateY(yaw).translate(ax + x, GROUND + y, az + z);
    const part = source.index ? source.toNonIndexed() : source;
    if (part !== source) source.dispose();
    part.deleteAttribute('uv');
    const tint = new THREE.Color(color), colors = new Float32Array(part.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3)); list.push(part);
  }
  const box = (x, y, z, w, h, d, color) => bake(solids, unit, x, y, z, w, h, d, color);
  // A thin mat defines the apron; its top is exactly the actors' foot height.
  bake(solids, unit, .45, -.017, .5, 8.5, .025, 4.6, '#29353a');
  box(0, .57, -.52, 2.80, .28, .42, '#806247');
  box(0, .735, -.52, 2.84, .05, .46, '#bfa67b');
  for (const x of [-1.25, 1.25]) for (const z of [-.66, -.38]) box(x, .215, z, .07, .43, .07, '#445050');
  for (const x of [-1.47, 1.47]) box(x, 1.25, -.96, .06, 2.5, .06, '#516568');
  box(0, 2.52, -.54, 3.06, .10, 1.08, '#a65136');
  for (let n = 0; n < 7; n++) box(-1.34 + n * .445, 2.583, -.54, .19, .035, 1.09, '#e9ba79');
  bake(lights, unit, 0, 2.465, -.13, 2.79, .035, .06, '#ffcf86');
  for (const x of [-1.41, 1.41]) {
    bake(solids, cylinder, x, 2.30, -.01, .10, .035, .10, '#664c39');
    bake(lights, cylinder, x, 2.17, -.01, .13, .22, .13, '#ff8858');
    bake(solids, cylinder, x, 2.04, -.01, .10, .035, .10, '#664c39');
  }
  // Pot, chopping board, serving dishes and a folded menu share one solid batch.
  bake(solids, cylinder, -1.03, .86, -.52, .205, .20, .205, '#9bafa7');
  bake(solids, cylinder, -1.03, .967, -.52, .188, .009, .188, '#e5bd77');
  box(-.30, .80, -.55, .38, .04, .23, '#b88354');
  for (let n = 0; n < 4; n++) box(-.4 + n * .065, .84, -.54, .034, .035, .10, '#b4b27e');
  for (let n = 0; n < 3; n++) bake(solids, cylinder, .48 + n * .19, .80, -.51, .075, .035, .075, '#ead7ad');
  box(1.15, .91, -.56, .19, .26, .045, '#d3b780');
  // Standing table and an open return crate. Their footprints are exposed for QA.
  bake(solids, cylinder, .9, .70, 2.55, .28, .065, .28, '#b7a281');
  bake(solids, cylinder, .9, .35, 2.55, .045, .66, .045, '#587073');
  bake(solids, cylinder, .9, .035, 2.55, .20, .035, .20, '#445559');
  box(2.7, .44, 2.05, .48, .08, .44, '#3d5654');
  for (const x of [2.48, 2.92]) box(x, .55, 2.05, .04, .28, .44, '#769082');
  for (const z of [1.85, 2.25]) box(2.7, .55, z, .48, .28, .04, '#769082');
  box(2.7, .20, 2.05, .07, .40, .07, '#4d6464');
  function finish(parts, material, name) {
    const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; group.add(mesh); return mesh;
  }
  finish(solids, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .12 }), 'MarketLife-MergedProps');
  finish(lights, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), 'MarketLife-WarmLights');
  unit.dispose(); cylinder.dispose();
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3b2925'; ctx.fillRect(0, 0, 1024, 160);
    ctx.fillStyle = '#ffe2aa'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 96px "Microsoft YaHei", sans-serif'; ctx.fillText('南巷食堂 · 现煮热汤', 512, 82);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.70, .42), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sign.name = 'MarketLife-Menu'; sign.position.set(ax, GROUND + 2.21, az + .015); group.add(sign);
  }

  const bowlParts = [];
  function bowlPart(g, color) {
    const part = g.index ? g.toNonIndexed() : g;
    if (part !== g) g.dispose(); part.deleteAttribute('uv');
    const c = new THREE.Color(color), colors = new Float32Array(part.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3)); bowlParts.push(part);
  }
  bowlPart(new THREE.CylinderGeometry(.094, .060, .066, 10), '#ead6ac');
  bowlPart(new THREE.CylinderGeometry(.083, .083, .006, 10).translate(0, .034, 0), '#d9a057');
  for (let i = 0; i < 3; i++) bowlPart(new THREE.BoxGeometry(.015, .01, .067).rotateY(i * 1.6).translate(.015 * i - .018, .042, 0), '#779555');
  const bowlGeometry = mergeGeometries(bowlParts); bowlParts.forEach(g => g.dispose());
  const bowls = new THREE.InstancedMesh(bowlGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62 }), 10);
  bowls.name = 'MarketLife-FoodBowls'; bowls.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bowls.frustumCulled = false; group.add(bowls);
  const steamCount = 18, steamGeometry = new THREE.BufferGeometry();
  steamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(steamCount * 3), 3));
  steamGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(steamCount), 1));
  steamGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(steamCount), 1));
  const steam = new THREE.Points(steamGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `attribute float aAlpha; attribute float aSize; varying float vAlpha;
      void main(){vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;
      gl_PointSize=clamp(aSize*1000.0/max(1.0,-p.z),1.0,48.0);}`,
    fragmentShader: `varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.0;
      float a=pow(max(0.0,1.0-r),2.0)*vAlpha;gl_FragColor=vec4(.87,.83,.72,a);}`,
  }));
  steam.name = 'MarketLife-Steam'; steam.frustumCulled = false; group.add(steam);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  function hand(pose, side, angle) {
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    const x = side * .106, z = -.332 * Math.sin(angle) + .031 * Math.cos(angle);
    return { x: pose.x + x * c + z * s, y: pose.y + .837 - .332 * Math.cos(angle) - .031 * Math.sin(angle) + .037,
      z: pose.z - x * s + z * c };
  }
  const state = { label: '南巷夜市', detail: '', phase: 'queue' };
  function update(seconds) {
    const time = finiteTime(seconds), serving = mod(time, 10), local = mod(time, CYCLE);
    const current = serving < 2.7 ? ['order', '顾客点单', '四位顾客排队 · 两位摊主备餐']
      : serving < 4 ? ['prepare', '热汤出锅', '摊主装碗 · 顾客等候取餐']
      : serving < 6.8 ? ['serve', '递餐取餐', '摊主递出热汤 · 顾客伸手接餐']
      : ['advance', '取餐离场', '顾客从左侧离开 · 队列逐位前移'];
    state.phase = current[0]; state.label = current[1]; state.detail = current[2];
    state.seconds = time; state.cycleSeconds = local;
    const vendor = sampleVendor(0, time);
    for (let slot = 2; slot < 12; slot++) {
      const customerSlot = slot < 10 ? slot : slot + 2;
      const pose = slot < 10 ? sampleCustomer(slot, time) : sampleNeighbour(customerSlot, time);
      let p = hand(pose, -1, pose.armLeft ?? -1.02), size = 1;
      if (slot < 10) {
        const age = mod(time + (slot - 2) * 10, CYCLE);
        size = envelope(age, 43.1, 43.7, 71.75, 72.0);
        if (age < 46.2) {
          const from = hand(vendor, 1, vendor.armRight), blend = smooth(age, 44.8, 46.2);
          p = { x: THREE.MathUtils.lerp(from.x, p.x, blend), y: THREE.MathUtils.lerp(from.y, p.y, blend), z: THREE.MathUtils.lerp(from.z, p.z, blend) };
        } else if (age > 70) {
          const blend = smooth(age, 70.0, 71.0);
          p.x = THREE.MathUtils.lerp(p.x, ax + 2.7, blend);
          p.z = THREE.MathUtils.lerp(p.z, az + 2.05, blend);
          p.y = THREE.MathUtils.lerp(p.y, GROUND + .73, blend) - .27 * smooth(age, 71, 71.8);
        }
      }
      matrix.compose(position.set(p.x, p.y, p.z), rotation, scale.setScalar(size)); bowls.setMatrixAt(slot - 2, matrix);
    }
    bowls.instanceMatrix.needsUpdate = true;
    const positions = steamGeometry.attributes.position, alphas = steamGeometry.attributes.aAlpha, sizes = steamGeometry.attributes.aSize;
    for (let i = 0; i < steamCount; i++) {
      const life = mod(local + i * 4 / steamCount, 4) / 4;
      positions.setXYZ(i, ax - 1.03 + Math.sin(TAU * (life + i * .17)) * (.035 + life * .14),
        GROUND + .99 + life * .96, az - .52 + Math.cos(TAU * (life + i * .21)) * (.04 + life * .10));
      alphas.setX(i, Math.sin(life * Math.PI) * .32); sizes.setX(i, .11 + life * .19);
    }
    positions.needsUpdate = alphas.needsUpdate = sizes.needsUpdate = true;
  }
  const eye = new THREE.Vector3(), center = new THREE.Vector3(ax + .5, .8, az + .5);
  function prepareView(camera) {
    camera.getWorldPosition(eye); group.worldToLocal(eye);
    const visible = eye.distanceTo(center) < 34 * (camera.zoom || 1);
    for (const child of group.children) child.visible = visible;
    group.userData.detailVisible = visible;
  }
  group.userData = {
    actorIndices: indices, state, view, samplePerson, update, prepareView, cycleDuration: CYCLE,
    roles: indices.map((index, slot) => ({ index, role: slot < 2 ? 'vendor' : slot < 10 ? 'customer' : 'neighbour' })),
    layout: { center: [ax + .5, GROUND, az + .5], origin: [ax, GROUND, az], queue,
      bounds: { minX: ax - 3.8, maxX: ax + 4.7, minZ: az - 1.8, maxZ: az + 2.8 },
      serving: point(0, 0), returnCrate: point(2.7, 2.05), hostOrdinal: host?.ordinal ?? null },
    obstacles, detailVisible: true,
  };
  update(0); return group;
}
