import * as THREE from 'three';
import { makeCyberBuses } from './district-streetgear.js';
import { makeAirships } from './district-air.js';
import { makeDistrictLandmarks } from './district-landmarks.js';
import { makeDistrictBuildings } from './district-buildings.js';
import { makeDistrictLife } from './district-life.js';
import { makeSkyTraffic } from './sky-traffic.js';
import { makeMegacitySkyway } from './megacity-skyway.js';

const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const definitions = [
  ['legacy-flyer', '城市飞行器', '飞行器', '老街巡航与片区快线的真实飞行车。', 'cyber-block-factories.js'],
  ['ground-car', '地面车辆', '地面交通', '老街精细车辆与片区道路车流。', 'cyber-block-factories.js · district-streets.js'],
  ['bus', '城市巴士', '地面交通', '各片区真实线路的公交车体与灯组。', 'district-streetgear.js'],
  ['maglev-train', '磁悬浮列车', '轨道交通', '完整三节列车与按真实时刻表开合的车门。', 'district-landmarks.js'],
  ['airship', '巨型飞艇', '飞行器', 'Blender 分段舰体、机械龙骨、双层吊舱与推进器。', 'district-air.js'],
  ['sky-passenger', '空中客运', '飞行器', '远空客运飞行器的完整实体。', 'sky-traffic.js'],
  ['sky-cargo', '空中货运', '飞行器', '远空货运飞行器的完整实体。', 'sky-traffic.js'],
  ['sky-cruiser', '空中巡航', '飞行器', '远空巡航飞行器的完整实体。', 'sky-traffic.js'],
  ['skyway-vehicle', '高架车辆', '地面交通', '环城高架原始车辆及真实坡道俯仰。', 'megacity-skyway.js'],
  ['market-people', '夜市人物', '城市生活', '现有市民的排队、交接、饮食与交谈动作。', 'district-market-life.js'],
  ['crossing-people', '过街人物', '城市生活', '现有市民随信号灯等待与过街的步态。', 'district-crossing-life.js'],
  ['station-people', '车站乘客', '城市生活', '现有市民候车、上车与下车的真实动作。', 'district-station-life.js'],
];

const sourceClocks = new WeakMap();
export function catalogClock(source) {
  if (sourceClocks.has(source)) return sourceClocks.get(source);
  let previous = NaN;
  const tick = seconds => {
    seconds = Number.isFinite(seconds) ? seconds : 0;
    if (seconds === previous) return;
    source.userData.update(seconds); source.updateMatrixWorld(true); previous = seconds;
  };
  sourceClocks.set(source, tick); return tick;
}
const clock = catalogClock;

function inverseFrame(frame, result) {
  return result.compose(new THREE.Vector3(frame.x, frame.y || 0, frame.z),
    new THREE.Quaternion().setFromAxisAngle(UP, frame.yaw || 0), ONE).invert();
}

function finishCard(object, update, dispose) {
  update(0);
  const bounds = new THREE.Box3().setFromObject(object, true), center = bounds.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -bounds.min.y, -center.z); object.updateMatrixWorld(true);
  return { object, update, dispose() { dispose(); object.removeFromParent(); } };
}

// Keep the original material programs, including custom onBeforeCompile hooks.
// The viewer may clone these materials once more; update the displayed clone's
// uniforms without replacing its wireframe/clay presentation settings.
function materialCopy(source, owned) {
  const copy = source.clone();
  copy.onBeforeCompile = source.onBeforeCompile;
  copy.customProgramCacheKey = source.customProgramCacheKey;
  if (source.uniforms && !copy.uniforms) copy.uniforms = THREE.UniformsUtils.clone(source.uniforms);
  copy.userData.catalogMotionMaterial = true;
  owned.push(copy); return copy;
}
function syncMaterial(source, display, opacity) {
  if (!display?.userData.catalogMotionMaterial) return;
  for (const key of ['color', 'emissive']) if (source[key] && display[key]) display[key].copy(source[key]);
  display.opacity = opacity ?? source.opacity;
  display.emissiveIntensity = source.emissiveIntensity;
  for (const [key, uniform] of Object.entries(source.uniforms || {})) {
    const target = display.uniforms?.[key];
    if (!target) continue;
    if (target.value?.copy && uniform.value?.constructor === target.value.constructor) target.value.copy(uniform.value);
    else target.value = uniform.value;
  }
}
function syncMaterials(source, display, fixedOpacity) {
  [].concat(source).forEach((material, index) => syncMaterial(material, [].concat(display)[index], fixedOpacity?.get(material)));
}

function instanceParts(source, index, prefix = '') {
  const result = [];
  source.traverse(mesh => { if (mesh.isInstancedMesh && mesh.name.startsWith(prefix)) result.push({ mesh, index }); });
  return result;
}

/** A one-instance mesh preserves instanceMatrix and custom shader attributes.
 * Geometry/material references always originate in the live scene factories.
 * Only route placement and its endpoint fade are removed for inspection. */
function instanceCard({ name, parts, tick, frame, fade = () => 1, fadeY = false }) {
  const object = new THREE.Group(), materials = [], geometries = [];
  object.name = `Catalog-${name}`;
  const displayed = parts.map(({ mesh, index, maxDistance }) => {
    if (index < 0 || index >= mesh.count) throw new Error(`Invalid catalogue instance: ${name}/${index}`);
    const attributes = Object.entries(mesh.geometry.attributes).filter(([, attribute]) => attribute.isInstancedBufferAttribute);
    let geometry = mesh.geometry;
    if (attributes.length) {
      geometry = geometry.clone(); geometries.push(geometry);
      for (const [key, attribute] of attributes) {
        const offset = Math.floor(index / attribute.meshPerAttribute) * attribute.itemSize;
        geometry.setAttribute(key, new THREE.InstancedBufferAttribute(attribute.array.slice(offset, offset + attribute.itemSize), attribute.itemSize, attribute.normalized));
      }
    }
    const material = Array.isArray(mesh.material) ? mesh.material.map(m => materialCopy(m, materials)) : materialCopy(mesh.material, materials);
    const item = new THREE.InstancedMesh(geometry, material, 1);
    item.name = mesh.name; item.frustumCulled = false; item.renderOrder = mesh.renderOrder;
    item.userData.sourceMesh = mesh.name; item.userData.sourceInstance = index;
    if (mesh.instanceColor) { const color = new THREE.Color(); mesh.getColorAt(index, color); item.setColorAt(0, color); }
    object.add(item); return { mesh, index, item, maxDistance };
  });
  const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  function update(seconds) {
    let time = Number.isFinite(seconds) ? seconds : 0;
    tick(time);
    // At an exact hidden endpoint the scale matrix is singular. The adjacent
    // absolute sample recovers the same body; no frame delta is accumulated.
    if (fade() < 1e-7) { time += .05; tick(time); }
    inverseFrame(frame(time), inverse);
    const scale = Math.max(1e-9, fade());
    for (const { mesh, index, item, maxDistance } of displayed) {
      mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld).premultiply(inverse);
      if (scale !== 1) {
        for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) matrix.elements[i] /= scale;
        if (fadeY) matrix.elements[13] /= scale;
      }
      if (maxDistance !== undefined) {
        // A meal belongs to the inspected actor only while it is within reach;
        // the counter/return crate remains part of the city environment.
        const e = matrix.elements;
        item.visible = Math.hypot(e[12], e[14]) <= maxDistance && Math.hypot(e[0], e[1], e[2]) > 1e-6;
        if (!item.visible) matrix.makeScale(0, 0, 0);
      }
      item.setMatrixAt(0, matrix); item.instanceMatrix.needsUpdate = true;
      item.computeBoundingBox(); item.computeBoundingSphere();
      syncMaterials(mesh.material, item.material);
    }
    object.updateMatrixWorld(true);
  }
  return finishCard(object, update, () => {
    displayed.forEach(({ item }) => item.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
  });
}

function subtreeCard({ original, tick, frame, fixedOpacity, exclude = () => false }) {
  tick(0);
  const object = new THREE.Group(), materials = [], pairs = [];
  object.name = `Catalog-${original.name}`;
  function copyNode(source) {
    // Initially hidden LOD branches are alternative geometry, not moving parts.
    if (exclude(source) || (!source.visible && source.parent?.userData.modelDetail === 'high')) return null;
    const item = source.clone(false); item.userData = {};
    if (source.material) item.material = Array.isArray(source.material) ? source.material.map(m => materialCopy(m, materials)) : materialCopy(source.material, materials);
    pairs.push({ source, item });
    for (const child of source.children) { const copied = copyNode(child); if (copied) item.add(copied); }
    return item;
  }
  const content = copyNode(original); object.add(content); content.matrixAutoUpdate = false;
  const inverse = new THREE.Matrix4();
  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0; tick(time);
    inverseFrame(frame(time), inverse);
    for (const { source, item } of pairs) {
      if (item === content) { item.matrix.copy(inverse).multiply(source.matrixWorld); item.visible = true; }
      else { item.position.copy(source.position); item.quaternion.copy(source.quaternion); item.scale.copy(source.scale); item.visible = source.visible; }
      if (source.material) syncMaterials(source.material, item.material, fixedOpacity);
    }
    object.updateMatrixWorld(true);
  }
  return finishCard(object, update, () => { materials.forEach(m => m.dispose()); pairs.forEach(({ item }) => { if (item.isInstancedMesh) item.dispose(); }); });
}

export function extendMotionCatalog({ own, add, addGroup, groups, legacy, rosters, streets, outerRobots, outerRiders }) {
  definitions.forEach(([id, label, category, description, source]) => addGroup({ id, label, category, description, source }));
  const addVehicle = (group, id, label, source, create, family = group) => add(group, {
    id, label, name: id, source, family, tags: ['真实场景实例', '原地动作', label], create,
  });

  const buses = own(makeCyberBuses({ seed: 2049, routes: rosters.BUS_LANES }));
  const landmarks = own(makeDistrictLandmarks({ seed: 2049 })), landmarkTick = clock(landmarks);
  // Life placement consumes the real building bounds (the geometry stays offscreen).
  const architecture = own(makeDistrictBuildings({ seed: 2049 })), buildings = architecture.userData.buildings;
  const life = own(makeDistrictLife({ streets, landmarks, riders: outerRiders, robots: outerRobots, buses, buildings }));
  const streetTick = clock(streets);
  // Riding passengers are hidden inside the train in the city. Inspection keeps
  // their actual sampled pose visible, just as route fades are removed for cars.
  streets.userData.setActivitySampler((index, seconds) => {
    const pose = life.userData.samplePerson(index, seconds); return pose ? { ...pose, visible: true } : null;
  });
  let lifeTime = NaN;
  const lifeTick = seconds => {
    landmarkTick(seconds);
    if (seconds !== lifeTime) {
      life.userData.update(seconds); life.updateMatrixWorld(true); lifeTime = seconds;
    }
    streetTick(seconds);
  };
  for (const [activityId, activity] of Object.entries(life.userData.activities)) {
    for (const [slot, index] of activity.userData.actorIndices.entries()) {
      const id = `district-person-${index + 1}`, person = streets.userData.people[index];
      const oldGroup = groups.find(group => group.variants.some(variant => variant.id === id));
      const variant = oldGroup.variants.splice(oldGroup.variants.findIndex(item => item.id === id), 1)[0];
      const label = definitions.find(def => def[0] === `${activityId}-people`)[1];
      const parts = instanceParts(streets, index, 'DistrictPeople-').filter(({ mesh }) => !mesh.name.includes('Umbrella'));
      if (activityId === 'market') {
        const mesh = activity.getObjectByName('MarketLife-FoodBowls');
        const bowlIndices = slot < 2 ? Array.from({ length: 8 }, (_, i) => i) : slot < 10 ? [slot - 2] : slot >= 12 ? [slot - 4] : [];
        parts.push(...bowlIndices.map(index => ({ mesh, index, maxDistance: .8 })));
      }
      add(`${activityId}-people`, { ...variant, label: `${label} ${slot + 1}`, family: activityId,
        source: `district-${activityId}-life.js`, tags: ['城市生活', label, '真实绝对秒动作'],
        create: () => instanceCard({ name: variant.name, tick: lifeTick,
          parts,
          frame: () => ({ x: person._px, y: person._py, z: person._pz, yaw: person._yaw }),
        }),
      });
    }
  }

  rosters.flyers.forEach((source, index) => {
    const tick = clock(source), craft = source.userData.craft;
    addVehicle('legacy-flyer', `legacy-flyer-${index + 1}`, `城市飞行器 ${index + 1}`, 'cyber-block-factories.js / makeFlyer',
      () => subtreeCard({ original: craft, tick, frame: () => ({ ...craft.position, yaw: new THREE.Euler().setFromQuaternion(craft.quaternion, 'YXZ').y }) }));
  });

  const traffic = own(legacy.makeGroundTraffic({ seed: 2049 })), trafficTick = clock(traffic);
  traffic.userData.vehicles.forEach((vehicle, index) => {
    const original = vehicle.group, fixedOpacity = new Map();
    // Capture authored opacity away from route fade, then retain wheel animation.
    let sample = 0; while (Math.abs(vehicle.samplePosition(sample).z) > 27 && sample < 200) sample += 1;
    trafficTick(sample); original.traverse(node => [].concat(node.material || []).forEach(m => fixedOpacity.set(m, m.opacity)));
    addVehicle('ground-car', `ground-central-${index + 1}`, `老街 · ${vehicle.kind} ${index + 1}`, 'cyber-block-factories.js / makeGroundTraffic',
      () => subtreeCard({ original, tick: trafficTick, fixedOpacity,
        frame: () => ({ x: vehicle.x, y: 0, z: vehicle.z, yaw: original.rotation.y }),
        exclude: node => /ContactShadow|WetPool/.test(node.name),
      }), 'old-street');
  });
  streets.userData.vehicles.forEach((car, index) => {
    const parts = streets.children.filter(mesh => mesh.isInstancedMesh && mesh.name.startsWith('DistrictTraffic-'))
      .flatMap(mesh => Array.from({ length: mesh.count / streets.userData.vehicles.length }, (_, piece) => ({ mesh, index: index * (mesh.count / streets.userData.vehicles.length) + piece })));
    addVehicle('ground-car', `ground-district-${index + 1}`, `片区车辆 ${index + 1}`, 'district-streets.js / makeDistrictStreets',
      () => instanceCard({ name: car.name, parts, tick: streetTick, fade: () => car._fade, fadeY: true,
        frame: () => ({ x: car._x, y: 0, z: car._z, yaw: car.direction < 0 ? Math.PI : 0 }),
      }), 'district');
  });
  const busTick = clock(buses);
  buses.userData.buses.forEach((bus, index) => addVehicle('bus', `bus-${index + 1}`, `城市巴士 ${index + 1}`, 'district-streetgear.js / makeCyberBuses',
    () => instanceCard({ name: `Bus-${index + 1}`, parts: instanceParts(buses, index), tick: busTick, fade: () => bus.fade,
      frame: () => ({ x: bus.x, y: 0, z: bus.z, yaw: bus.yaw }),
    })));

  const train = landmarks.userData.train;
  addVehicle('maglev-train', 'maglev-train-1', '三节磁悬浮列车', 'district-landmarks.js / makeDistrictLandmarks',
    () => subtreeCard({ original: train, tick: landmarkTick, frame: () => ({ x: train.position.x, y: 7.5, z: train.position.z, yaw: 0 }),
      exclude: node => node.name === 'ThreeCarLocalTrain-FieldPool',
    }));

  const airships = own(makeAirships({ seed: 2049, count: 3 })), airshipTick = clock(airships);
  airships.userData.ships.forEach((ship, index) => addVehicle('airship', `airship-${index + 1}`, `巨型飞艇 ${index + 1}`, 'district-air.js / makeAirships',
    () => instanceCard({ name: `Airship-${index + 1}`, parts: instanceParts(airships, index).filter(({ mesh }) => ['Airships-Structures', 'Airships-Lights', 'Airships-Glass'].includes(mesh.name)), tick: airshipTick,
      frame: () => ({ x: ship.x, y: ship.height, z: ship.z, yaw: ship.pose.yaw }),
    })));
  const sky = own(makeSkyTraffic({ buildings })), skyTick = clock(sky);
  sky.userData.vehicles.forEach(vehicle => addVehicle(`sky-${vehicle.kind}`, `sky-${vehicle.id}`, `${{ passenger: '客运', cargo: '货运', cruiser: '巡航' }[vehicle.kind]}飞行器 ${vehicle.modelIndex + 1}`, 'sky-traffic.js / makeSkyTraffic',
    () => instanceCard({ name: vehicle.id, parts: instanceParts(sky, vehicle.modelIndex, `SkyTraffic-${vehicle.kind}-`), tick: skyTick,
      frame: time => sky.userData.sampleVehicle(vehicle.index, time),
    })));
  const skyway = own(makeMegacitySkyway({ buildings })), skywayTick = clock(skyway);
  skyway.userData.vehicles.forEach((vehicle, index) => addVehicle('skyway-vehicle', vehicle.id, `高架车辆 ${index + 1}`, 'megacity-skyway.js / makeMegacitySkyway',
    () => instanceCard({ name: vehicle.id, parts: instanceParts(skyway, index, 'SkywayPod'), tick: skywayTick,
      frame: time => skyway.userData.sampleVehicle(index, time),
    })));
}
