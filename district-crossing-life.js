import * as THREE from 'three';

const X = 42, Z = 4.35;
const PERIOD = 112, OFFSET = 82, DRIVE_END = 88, WALK_START = 92, WALK_END = 108;
const RAMP = 5;
const mod = (value, period) => ((value % period) + period) % period;
const finiteTime = seconds => Number.isFinite(seconds) ? seconds : 0;
const smooth = value => { const u = Math.max(0, Math.min(1, value)); return u * u * (3 - 2 * u); };

/** Integrated cosine acceleration: distance and velocity are continuous at
 * every join, including the repeated lap. Nothing depends on previous frames. */
function travelAt(time, duration, ramp, length) {
  const t = Math.max(0, Math.min(duration, time)), velocity = length / (duration - ramp);
  if (t < ramp) return {
    distance: velocity * (t / 2 - ramp * Math.sin(Math.PI * t / ramp) / (2 * Math.PI)),
    speed: velocity * (1 - Math.cos(Math.PI * t / ramp)) / 2,
  };
  if (t > duration - ramp) {
    const left = duration - t;
    return {
      distance: length - velocity * (left / 2 - ramp * Math.sin(Math.PI * left / ramp) / (2 * Math.PI)),
      speed: velocity * (1 - Math.cos(Math.PI * left / ramp)) / 2,
    };
  }
  return { distance: velocity * (t - ramp / 2), speed: velocity };
}

export function makeCrossingLife({ people = [], actorIndices = [], traffic = {} } = {}) {
  const group = new THREE.Group(); group.name = 'DistrictCrossingLife';
  const actors = [...new Set(actorIndices)].filter(index => people[index]);
  const variation = slot => mod(Math.sin((slot + 1) * 78.233) * 43758.5453, 1);
  const roles = new Map(actors.map((index, slot) => [index, {
    slot, row: Math.floor(slot / 4), column: slot % 4,
    departure: [0.07, .63, .31, .49][slot % 4] + variation(slot) * .12,
    duration: 13.72 + variation(slot + 29) * .24,
    stepLength: .41 + variation(slot + 53) * .065,
    zOffset: [-.50, -.17, .17, .50][slot % 4] + [-.028, .004, .030][Math.floor(slot / 4) % 3] + (variation(slot + 71) - .5) * .01,
  }]));
  const rows = Math.ceil(actors.length / 4);
  const lanes = [], records = new Map();

  // A bounded analytic platoon forms an accordion queue. Each car's unwrapped
  // distance is D - rank * expansion(D). The expansion derivative is bounded
  // below 0.75 / rank, proving that every vehicle always moves forward. Spacing
  // is gap + expansion >= gap, including immediately after the light changes.
  // This avoids the discontinuous red-light clamps and frame-dependent queues
  // that otherwise make scrub/replay jump cars backwards or merge them.
  const fleets = [
    { key: 'streets', list: 'vehicles', kind: 'car', halfWidth: .62, halfLength: 1.335, gap: 4.05 },
    { key: 'riders', list: 'riders', kind: 'rider', halfWidth: .19, halfLength: .65, gap: 2.15 },
    { key: 'robots', list: 'robots', kind: 'robot', halfWidth: .29, halfLength: .35, gap: 1.55 },
    { key: 'buses', list: 'buses', kind: 'bus', halfWidth: .65, halfLength: 2.72, gap: 7.05 },
  ];
  for (const fleet of fleets) {
    const source = traffic[fleet.key]?.userData;
    if (!source) continue;
    const byLane = new Map();
    for (const entity of source[fleet.list] ?? []) {
      const route = entity.route ?? { axis: 'z', offset: entity.x, low: entity.low, length: entity.length };
      if (entity.static || route.axis !== 'z' || Math.abs(route.offset - X) > 4.6 || route.low >= Z || route.low + route.length <= Z) continue;
      const key = `${route.offset}/${entity.direction}/${route.low}/${route.length}`;
      if (!byLane.has(key)) byLane.set(key, { ...fleet, key: `${fleet.kind}/${key}`, route, direction: entity.direction, entities: [] });
      byLane.get(key).entities.push(entity);
    }
    for (const lane of byLane.values()) {
      lane.entities.sort((a, b) => a.direction * (b.phase - a.phase));
      const count = lane.entities.length;
      // The legacy buses had both directions on the exact same centreline.
      // Split only this controlled avenue into two clear centre lanes.
      lane.x = lane.kind === 'bus' ? X - lane.direction * .70 : lane.route.offset;
      lane.stopZ = Z - lane.direction * (1.25 + lane.halfLength);
      lane.expansion = count > 1 ? Math.min(
        (lane.route.length / count - lane.gap) * .65,
        lane.route.length * .75 / (Math.PI * (count - 1)),
      ) : 0;
      lane.entities.forEach((entity, rank) => records.set(entity, { lane, rank, pose: {} }));
      lanes.push(lane);
    }
    source.setTrafficSampler?.((entity, seconds) => sampleTraffic(entity, seconds));
  }

  function sampleSignal(seconds) {
    const total = finiteTime(seconds) + OFFSET, local = mod(total, PERIOD), cycle = Math.floor(total / PERIOD);
    const phase = local < 82 ? 'traffic' : local < DRIVE_END ? 'slowing'
      : local < WALK_START ? 'vehicle-clearance' : local < WALK_END ? 'pedestrians' : 'pedestrian-clearance';
    const boundary = local < 82 ? 82 : local < DRIVE_END ? DRIVE_END : local < WALK_START ? WALK_START : local < WALK_END ? WALK_END : PERIOD;
    return {
      local, cycle, phase, direction: mod(cycle, 2) === 0 ? 1 : -1,
      vehicleSignal: phase === 'traffic' ? 'green' : phase === 'slowing' ? 'amber' : 'red',
      pedestrianSignal: phase === 'pedestrians' ? 'green' : 'red',
      remaining: Math.max(0, boundary - local),
    };
  }

  function sampleTraffic(entity, seconds) {
    const record = records.get(entity);
    if (!record) return null;
    const { lane, rank, pose } = record, t = finiteTime(seconds) + OFFSET;
    const local = mod(t, PERIOD), lap = Math.floor(t / PERIOD);
    const moving = travelAt(local, DRIVE_END, RAMP, lane.route.length);
    const angle = Math.PI * moving.distance / lane.route.length;
    const expansion = lane.expansion * Math.sin(angle) ** 2;
    const advance = moving.distance - rank * expansion;
    const rawZ = lane.stopZ - lane.direction * rank * lane.gap + lane.direction * advance;
    pose.x = lane.x;
    pose.z = lane.route.low + mod(rawZ - lane.route.low, lane.route.length);
    pose.speed = moving.speed * (1 - rank * lane.expansion * Math.PI / lane.route.length * Math.sin(2 * angle));
    pose.progress = lap * lane.route.length + advance;
    pose.lane = lane.key; pose.rank = rank;
    return pose;
  }

  function samplePerson(index, seconds) {
    const role = roles.get(index);
    if (!role) return null;
    const signal = sampleSignal(seconds), { row, column, slot } = role;
    const direction = signal.direction;
    const queueRank = direction > 0 ? row : rows - 1 - row;
    // Front-to-back release remains ordered within each narrow walking lane,
    // while unequal column starts, stride lengths and small fixed offsets keep
    // the gathering from reading as a marching formation.
    const start = WALK_START + queueRank * .60 + role.departure, duration = role.duration;
    // Preserve each column's order through the crossing; reversing the bank
    // layout by slot would make followers overtake the first row mid-road.
    const westX = 36.85 - row * .31, eastX = 47.15 + (rows - 1 - row) * .31;
    const fromX = direction > 0 ? westX : eastX;
    const toX = direction > 0 ? eastX : westX;
    const travel = travelAt(signal.local - start, duration, .7, Math.abs(toX - fromX));
    const x = fromX + direction * travel.distance;
    const finished = signal.local >= start + duration;
    const turn = finished ? smooth((signal.local - start - duration) / 1.3) : 0;
    const waiting = travel.speed < .001;
    return {
      x, y: .024 + .111 * smooth((Math.abs(x - X) - 4.7) / .3),
      z: Z + role.zOffset,
      yaw: direction * Math.PI / 2 + Math.PI * turn,
      speed: travel.speed,
      phase: travel.distance * Math.PI * 2 / role.stepLength + slot * .63,
      action: waiting ? finished ? '在对岸等灯' : '等候行人绿灯' : direction > 0 ? '向东过街' : '向西返回',
      ...(waiting ? { armLeft: .05 * Math.sin(finiteTime(seconds) * .7 + slot), armRight: -.08 } : {}),
    };
  }

  const steel = new THREE.MeshStandardMaterial({ color: '#253c49', metalness: .65, roughness: .42 });
  const white = new THREE.MeshBasicMaterial({ color: '#b8d5d6', transparent: true, opacity: .4, depthWrite: false });
  const red = new THREE.MeshBasicMaterial({ color: '#ff5149', toneMapped: false });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffc465', toneMapped: false });
  const green = new THREE.MeshBasicMaterial({ color: '#70ffb6', toneMapped: false });
  const unlit = new THREE.MeshBasicMaterial({ color: '#182b32' });
  const box = new THREE.BoxGeometry(1, 1, 1), vehicleLights = [], pedestrianLights = [];
  function part(name, material, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(box, material); mesh.name = name;
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
  }
  for (const side of [-1, 1]) {
    const px = X + side * 5.02;
    part('CrossingSignal-Post', steel, px, 1.04, Z + 1.65, .065, 2.08, .065);
    part('CrossingSignal-PedestrianHousing', steel, px, 1.6, Z + 1.65, .21, .53, .24);
    const redPed = part('CrossingSignal-Wait', red, px - side * .111, 1.72, Z + 1.65, .014, .13, .14);
    const greenPed = part('CrossingSignal-Walk', unlit, px - side * .111, 1.49, Z + 1.65, .014, .15, .14);
    pedestrianLights.push([redPed, greenPed]);
    const vz = Z + side * 2.3;
    part('CrossingSignal-TrafficHousing', steel, px, 2.01, vz, .3, .75, .2);
    part('CrossingSignal-Bracket', steel, px, 1.78, (vz + Z + 1.65) / 2, .052, .052, Math.abs(vz - Z - 1.65));
    const trafficHeads = [0, 1, 2].map((row) => part('CrossingSignal-TrafficLight', unlit, px, 2.25 - row * .23, vz + side * .108, .17, .16, .014));
    vehicleLights.push(trafficHeads);
    // Existing paint ends before the bike/robot gutter. Extend its final two
    // bars to make the real controlled crossing reach both pavement edges.
    for (const offset of [4.15, 4.75]) part('CrossingPaint-GutterExtension', white, X + side * offset, .018, Z, .35, .009, 1.2);
  }
  const state = { label: '东街路口', detail: '', phase: '' };
  function update(seconds) {
    const signal = sampleSignal(seconds);
    Object.assign(state, signal, { label: '东街路口 · 等灯过街' });
    const descriptions = {
      traffic: '车辆通行 · 行人等待', slowing: '车辆减速 · 队列收拢',
      'vehicle-clearance': '车辆红灯 · 路口清空', pedestrians: signal.direction > 0 ? '行人绿灯 · 向东过街' : '行人绿灯 · 向西返回',
      'pedestrian-clearance': '行人清空 · 即将放行车辆',
    };
    state.detail = `${descriptions[signal.phase]} · ${Math.ceil(signal.remaining)} 秒`;
    for (const heads of vehicleLights) {
      heads[0].material = signal.vehicleSignal === 'red' ? red : unlit;
      heads[1].material = signal.vehicleSignal === 'amber' ? amber : unlit;
      heads[2].material = signal.vehicleSignal === 'green' ? green : unlit;
    }
    for (const heads of pedestrianLights) {
      heads[0].material = signal.pedestrianSignal === 'red' ? red : unlit;
      heads[1].material = signal.pedestrianSignal === 'green' ? green : unlit;
    }
  }
  group.userData = {
    update, samplePerson, sampleSignal, sampleTraffic, actorIndices: actors, state,
    view: { camera: [47.4, 7.4, 8], target: [42, .5, 4.35] },
    crossing: { x: X, z: Z, halfDepth: .75, minX: 36.23, maxX: 47.77 },
    period: PERIOD, actorPeriod: PERIOD * 2, timeOffset: OFFSET,
    trafficLanes: lanes,
  };
  update(0);
  return group;
}
