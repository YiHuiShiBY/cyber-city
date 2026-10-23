import * as THREE from 'three';

export const STATION_TIMETABLE = Object.freeze({ cycle: 140, stops: [24, 88], dwell: 24, x: 21, z: 27, platformHeight: 7.65, doorOffsets: [-3.04, .86, 4.76] });
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
const mod = (value, period) => ((value % period) + period) % period;
const cleanTime = value => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Absolute-time timetable. Stops and reversals have zero velocity and acceleration. */
export function sampleStationTrain(seconds) {
  const time = cleanTime(seconds), t = mod(time, STATION_TIMETABLE.cycle);
  const state = { time, cycleTime: t, cycleDuration: 140, x: -54, y: 7.5, z: 27, speed: 0, velocityX: 0,
    direction: t < 70 ? 1 : -1, phase: 'reversing', doorOpen: 0, platformHeight: 7.65,
    stopTime: null, stopIndex: t < 70 ? 0 : 1, label: '端点折返', detail: '车门关闭 · 即将反向行驶' };
  for (let index = 0; index < 2; index++) {
    const arrival = STATION_TIMETABLE.stops[index], local = t - arrival;
    if (local < 0 || local >= 24) continue;
    state.x = 21; state.stopIndex = index; state.stopTime = local;
    if (local < 1) Object.assign(state, { phase: 'arrived', label: '九龍站 · 已停稳', detail: '请站在黄线后 · 等候开门' });
    else if (local < 3) Object.assign(state, { phase: 'opening', label: '九龍站 · 正在开门', detail: '踏板伸出 · 请先下后上', doorOpen: smooth((local - 1) / 2) });
    else if (local < 11) Object.assign(state, { phase: 'alighting', label: '九龍站 · 乘客下车', detail: '请让出车门 · 先下后上', doorOpen: 1 });
    else if (local < 20) Object.assign(state, { phase: 'boarding', label: '九龍站 · 乘客上车', detail: '请有序上车 · 注意脚下踏板', doorOpen: 1 });
    else if (local < 22) Object.assign(state, { phase: 'closing', label: '九龍站 · 正在关门', detail: '请勿上下车 · 踏板收回', doorOpen: 1 - smooth((local - 20) / 2) });
    else Object.assign(state, { phase: 'ready', label: '九龍站 · 即将发车', detail: '车门已关闭 · 请退至黄线后' });
    return state;
  }
  for (const [start, end, from, to, stationBound] of [[0, 24, -54, 21, true], [48, 66, 21, 54, false], [70, 88, 54, 21, true], [112, 136, 21, -54, false]]) {
    if (t < start || t >= end) continue;
    const u = (t - start) / (end - start), ease = u * u * u * (10 + u * (-15 + 6 * u));
    state.x = from + (to - from) * ease;
    state.velocityX = (to - from) * 30 * u * u * (u - 1) * (u - 1) / (end - start);
    state.speed = Math.abs(state.velocityX); state.direction = Math.sign(to - from);
    state.y = 7.5 + Math.sin(time * .92) * .014 * smooth(state.speed / .65);
    state.phase = u < .3 ? 'departing' : stationBound && u > .58 ? 'approaching' : !stationBound && u > .7 ? 'turning-approach' : 'running';
    state.label = stationBound ? (state.phase === 'approaching' ? '列车减速进站' : '九龍站 · 列车驶来') : (state.phase === 'departing' ? '列车驶离九龍站' : '九龍站 · 候车中');
    state.detail = stationBound ? `约 ${Math.ceil(end - t)} 秒后到站 · 请在黄线后候车` : '列车前往折返点 · 请在黄线后候车';
    state.arrivalIn = stationBound ? end - t : (t < 70 ? 88 : 164) - t;
    return state;
  }
  state.x = t < 70 ? 54 : -54;
  state.arrivalIn = t < 70 ? 88 - t : 164 - t;
  return state;
}

/** Eight existing people exchange places between platform and carriage at each stop. */
export function makeStationLife({ landmarks, people = [], actorIndices = [] } = {}) {
  if (!landmarks?.userData?.train) throw new Error('Station life requires the district train');
  const group = new THREE.Group(); group.name = 'KowloonStationLife';
  const actors = [...new Set(actorIndices)].slice(0, 8);
  const slots = new Map(actors.map((index, slot) => [index, slot]));
  const sampleTrain = landmarks.userData.sampleTrain || sampleStationTrain;
  const state = { phase: '', label: '', detail: '', time: 0 };
  const platformZ = 28.655, cabinZ = 27.29;
  // Two separated doorways give each queue an exit lane. Park positions are also
  // the next boarding positions, so there is no reset on the platform or at t=140.
  const stations = [STATION_TIMETABLE.doorOffsets[0], STATION_TIMETABLE.doorOffsets[1]];
  function parked(slot) {
    const lane = slot % 4, offset = stations[Math.floor(lane / 2)], side = slot < 4 ? -1 : 1;
    return { x: 21 + offset + side * (lane % 2 ? 1.25 : .70), z: platformZ };
  }
  function pose(x, y, z, yaw, speed, seconds, action, visible = true) {
    return { x, y, z, yaw, speed, phase: seconds * 6.8, action, visible };
  }
  function samplePerson(index, seconds) {
    const slot = slots.get(index); if (slot === undefined) return null;
    const train = sampleTrain(seconds), t = train.cycleTime, lane = slot % 4, cohort = Math.floor(slot / 4);
    const door = stations[Math.floor(lane / 2)], doorX = 21 + door, wait = parked(slot);
    // Far passengers leave first; near passengers board first. The two cohorts
    // wait on opposite sides, so nobody walks through an occupied queue slot.
    const alightAt = STATION_TIMETABLE.stops[cohort ? 1 : 0] + 3.4 + (1 - lane % 2) * 3.2;
    const boardAt = STATION_TIMETABLE.stops[cohort ? 0 : 1] + 11.35 + (lane % 2) * 3.35;
    const alightEnd = alightAt + 2.65, boardEnd = boardAt + 2.65;
    let alight = t >= alightAt && t < alightEnd, board = t >= boardAt && t < boardEnd;
    if (alight || board) {
      const elapsed = t - (alight ? alightAt : boardAt);
      const points = alight
        ? [[doorX, cabinZ], [doorX, 27.82], [doorX, platformZ], [wait.x, platformZ]]
        : [[wait.x, platformZ], [doorX, platformZ], [doorX, 27.82], [doorX, cabinZ]];
      const times = alight ? [0, .75, 1.7, 2.65] : [0, .95, 1.9, 2.65];
      let segment = elapsed < times[1] ? 0 : elapsed < times[2] ? 1 : 2;
      const from = points[segment], to = points[segment + 1], duration = times[segment + 1] - times[segment];
      const u = clamp((elapsed - times[segment]) / duration), e = smooth(u);
      const dx = to[0] - from[0], dz = to[1] - from[1], x = from[0] + dx * e, z = from[1] + dz * e;
      const speed = Math.hypot(dx, dz) * 6 * u * (1 - u) / duration;
      // Hidden only when the entire person is behind the doorway and inside the
      // carriage. A passenger never vanishes from the bridge or the platform.
      return pose(x, 7.65, z, Math.atan2(dx, dz), speed, seconds, alight ? 'alighting' : 'boarding', z >= 27.40);
    }
    const aboard = cohort ? t >= boardEnd && t < alightAt : t < alightAt || t >= boardEnd;
    if (aboard) return pose(train.x + door, train.y + .15, cabinZ, Math.PI, 0, seconds, 'riding', false);
    return pose(wait.x, 7.65, wait.z, Math.atan2(doorX - wait.x, -.6), 0, seconds, t < boardAt ? 'waiting' : 'arrived');
  }

  const detail = new THREE.Group(); detail.name = 'StationLiveInformation'; group.add(detail);
  const metal = new THREE.MeshStandardMaterial({ color: '#233e49', metalness: .6, roughness: .38 });
  function box(name, w, h, d, x, y, z, material) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.name = name; mesh.position.set(x, y, z); detail.add(mesh); return mesh; }
  // The information board occupies the quieter eastern bay, leaving both active
  // doorways and their queues visible through the transparent platform screen.
  const boardX = 24.7;
  box('Station-DepartureBoardFrame', 2.88, .69, .09, boardX, 9.31, 29.25, metal);
  for (const offset of [-.95, .95]) box('Station-DepartureBoardHanger', .035, .41, .035, boardX + offset, 9.835, 29.25, metal);
  let canvas, context, texture;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 208; context = canvas.getContext('2d');
    texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.72, .59), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sign.name = 'Station-LiveDepartureBoard'; sign.position.set(boardX, 9.31, 29.301); detail.add(sign);
  }
  const markerMaterial = new THREE.MeshBasicMaterial({ color: '#e9c68d', toneMapped: false });
  for (const offset of STATION_TIMETABLE.doorOffsets) {
    // Painted marks lie on the safe side of the platform edge; the bridge itself
    // is attached to the train and is deployed by the train's shared door rig.
    for (const side of [-1, 1]) box('Station-BoardingQueueMark', .38, .009, .035, 21 + offset + side * .48, 7.659, platformZ - .12, markerMaterial);
  }
  let lastText = '';
  function update(seconds) {
    const train = sampleTrain(seconds); Object.assign(state, train);
    const samples = actors.map(index => samplePerson(index, seconds));
    state.platformCount = samples.filter(p => p.visible && p.z >= 28.45).length;
    state.aboardCount = samples.filter(p => !p.visible).length;
    state.alightingCount = samples.filter(p => p.action === 'alighting').length;
    state.boardingCount = samples.filter(p => p.action === 'boarding').length;
    const text = train.label + '|' + train.detail;
    if (context && text !== lastText) {
      lastText = text; context.fillStyle = '#07171e'; context.fillRect(0, 0, 1024, 208);
      context.fillStyle = train.doorOpen > .99 ? '#9becd4' : '#efd59e'; context.fillRect(0, 0, 9, 208);
      context.textAlign = 'left'; context.textBaseline = 'middle'; context.font = 'bold 57px "Microsoft YaHei", sans-serif'; context.fillText(train.label, 36, 68);
      context.fillStyle = '#c2d7db'; context.font = '30px "Microsoft YaHei", sans-serif'; context.fillText(train.detail, 38, 152);
      texture.needsUpdate = true;
    }
  }
  const eye = new THREE.Vector3();
  function prepareView(camera) { camera.getWorldPosition(eye); detail.visible = eye.distanceTo(new THREE.Vector3(21, 8.5, 28.5)) < 62 * (camera.zoom || 1); }
  group.userData = { actorIndices: actors, state, samplePerson, sampleTrain, update, prepareView,
    timetable: STATION_TIMETABLE, view: { camera: [21, 15.2, 36.1], target: [21, 8.4, 27.8],
      mobileCamera: [30.5, 14, 30.8], mobileTarget: [20.5, 8.4, 27.8] },
    passengerDoorOffsets: stations, platformHeight: 7.65 };
  update(0); return group;
}
