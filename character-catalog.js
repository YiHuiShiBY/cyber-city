import * as THREE from 'three';
import { makeDistrictStreets } from './district-streets.js';
import { makeStreetRobots } from './district-streetgear.js';
import { makeDistrictBipeds } from './district-bipeds.js';
import { makeNeonRiders } from './district-riders.js';
import { makeDistrictLeapers } from './district-leapers.js';
import { makeFlyingBikes } from './district-air.js';
import { DISTRICT_LAYOUT } from './district-layout.js';
import { DISTRICT_STYLES } from './district-styles.js';
import { extendMotionCatalog, catalogClock } from './character-motion-catalog.js';

const SOURCE_BASE = new URL('.', import.meta.url);
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const COLORS = { '#688f93': '青灰', '#a57568': '砖红', '#b5aa8c': '米色', '#687c9a': '蓝灰', '#7a897a': '苔绿', '#8b7487': '灰紫' };

async function readSource(path) {
  const response = await fetch(new URL(path, SOURCE_BASE), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法读取模型源文件 ${path} (${response.status})`);
  return response.text();
}

function between(source, start, end, label) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`${label} 的源代码边界已改变，请更新角色目录适配器。`);
  return source.slice(first + start.length, last);
}

async function importSource(source) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

// The legacy factories live in their own ES module since 2026-09-28, so the
// catalogue can just import them — no source slicing, no Blob, no hand-injected
// import preamble. The person definition table is exported alongside them.
async function loadLegacyFactories() {
  return import(new URL('cyber-block-factories.js', SOURCE_BASE).href);
}

async function loadSceneRosters(indexSource, districtSource) {
  const routes = between(districtSource, 'const RIDER_LANES =', '\nexport function createDistrict', '片区角色名册');
  const central = between(indexSource, 'const streetRiders=', '\nconst district=createDistrict', '旧街角色名册');
  const aircraft = between(indexSource, 'const flyers=', '// Neon motorcycles', '旧街飞行器名册');
  return importSource(`
    import { makeNeonRiders } from ${JSON.stringify(new URL('district-riders.js', SOURCE_BASE).href)};
    import { makeStreetRobots } from ${JSON.stringify(new URL('district-streetgear.js', SOURCE_BASE).href)};
    import { makeFlyer } from ${JSON.stringify(new URL('cyber-block-factories.js', SOURCE_BASE).href)};
    const scene = { add() {} };
    const RIDER_LANES = ${routes}
    const streetRiders=${central}
    const flyers=${aircraft}
    export { RIDER_LANES, ROBOT_LANES, BIPED_UNITS, BIKE_LANES, BUS_LANES, streetRiders, streetRobots, flyers };
  `);
}

function disposeSources(sources) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const source of sources) source.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const geometry of node.userData.detailGeometries || []) geometries.add(geometry);
    if (node.isInstancedMesh) node.dispose();
    for (const material of [].concat(node.material || [], node.userData.detailMaterials || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

function updater(source) {
  return catalogClock(source);
}

function groundObject(object) {
  object.updateMatrixWorld(true);
  // Rotated feet leave empty space inside their transformed bounding boxes.
  // Ground the actual vertices so the inspection grid meets the visible soles.
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (!bounds.isEmpty()) object.position.y -= bounds.min.y;
  object.updateMatrixWorld(true);
}

function cloneCharacter(original, tick) {
  tick?.(0);
  const object = new THREE.Group(), content = original.clone(true);
  object.name = `Catalog-${original.name}`;
  object.add(content);
  content.position.set(0, 0, 0);
  content.quaternion.identity();
  const sourceNodes = [], displayNodes = [];
  original.traverse(node => sourceNodes.push(node));
  content.traverse(node => displayNodes.push(node));
  function update(seconds) {
    tick?.(seconds);
    for (let index = 1; index < sourceNodes.length; index++) {
      const from = sourceNodes[index], to = displayNodes[index];
      to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale);
      to.visible = from.visible;
    }
    content.scale.copy(original.scale);
    object.updateMatrixWorld(true);
  }
  update(0); groundObject(object);
  return {
    object, update,
    dispose() { content.traverse(node => { if (node.isInstancedMesh) node.dispose(); }); object.removeFromParent(); },
  };
}

// An instance becomes an ordinary mesh with its original geometry and material.
// Per-instance colour multiplies the base material exactly as Three's shader does.
// Geometry is owned by the catalogue; only the tinted materials belong to a card.
function extractInstances({ name, parts, tick, frame, fade = () => 1 }) {
  const object = new THREE.Group(), content = new THREE.Group();
  object.name = `Catalog-${name}`; object.add(content);
  const ownedMaterials = [], tint = new THREE.Color();
  const displayed = parts.map(({ mesh, index }) => {
    if (index < 0 || index >= mesh.count) throw new Error(`${name} 的模型实例索引无效。`);
    let material = mesh.material;
    if (mesh.instanceColor) {
      mesh.getColorAt(index, tint);
      material = material.clone(); material.color.multiply(tint); ownedMaterials.push(material);
    }
    const item = new THREE.Mesh(mesh.geometry, material);
    item.name = mesh.name; item.matrixAutoUpdate = false;
    item.castShadow = mesh.castShadow; item.receiveShadow = mesh.receiveShadow;
    item.userData.sourceMesh = mesh.name; item.userData.sourceInstance = index;
    content.add(item);
    return { source: mesh, index, item };
  });
  const inverse = new THREE.Matrix4(), translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  function update(seconds) {
    let time = Number.isFinite(seconds) ? seconds : 0;
    tick(time);
    // A route endpoint hides a city instance. Sample just past it for inspection;
    // removing its presentation fade preserves the actual authored model scale.
    if (fade() < 1e-7) { time += .05; tick(time); }
    const origin = frame();
    inverse.compose(translation.set(origin.x, origin.y || 0, origin.z), rotation.setFromAxisAngle(UP, origin.yaw || 0), UNIT_SCALE).invert();
    const opacityScale = Math.max(1e-9, fade());
    for (const { source, index, item } of displayed) {
      source.getMatrixAt(index, matrix);
      item.matrix.copy(inverse).multiply(source.matrixWorld).multiply(matrix);
      if (opacityScale !== 1) {
        const e = item.matrix.elements;
        for (const offset of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[offset] /= opacityScale;
        // Grounded telescoping legs shrink their contact offset with the route
        // fade; restore that offset together with their geometry in inspection.
        if (source.userData.fadeTranslationY) e[13] /= opacityScale;
      }
      item.matrixWorldNeedsUpdate = true;
    }
    object.updateMatrixWorld(true);
  }
  update(0); groundObject(object);
  return { object, update, dispose() { ownedMaterials.forEach(material => material.dispose()); object.removeFromParent(); } };
}

function instanceParts(source, index, prefix) {
  return source.children.filter(node => node.isInstancedMesh && (!prefix || node.name.startsWith(prefix))).map(mesh => ({ mesh, index }));
}

function sectorLabel(x, z) {
  let nearest = DISTRICT_STYLES[0], distance = Infinity;
  for (const style of DISTRICT_STYLES) {
    const next = Math.hypot(x - style.cx, z - style.cz);
    if (next < distance) { distance = next; nearest = style; }
  }
  return nearest.name;
}

function weaveVariants(variants) {
  const buckets = new Map();
  for (const variant of variants) {
    const key = variant.family;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(variant);
  }
  const result = [];
  while ([...buckets.values()].some(bucket => bucket.length)) {
    for (const bucket of buckets.values()) if (bucket.length) result.push(bucket.shift());
  }
  return result;
}

/**
 * Every variant is a real scene instance, including repeated colour/pose variants.
 * Cards are created on demand. Disposing one card never disposes shared geometry.
 * Dispose all cards before disposing the catalogue itself.
 */
export async function createCharacterCatalog() {
  const [indexSourceRaw, districtSourceRaw, architectureSource] = await Promise.all([
    readSource('index.html'), readSource('district.js'), readSource('district-building-geometry.js'),
  ]);
  const indexSource = indexSourceRaw.replace(/\r\n/g, '\n'), districtSource = districtSourceRaw.replace(/\r\n/g, '\n');
  const [legacy, rosters] = await Promise.all([loadLegacyFactories(), loadSceneRosters(indexSource, districtSource)]);
  const sources = [], activeCards = new Set();
  let disposed = false;
  const own = source => { sources.push(source); return source; };
  own(rosters.streetRobots); own(rosters.streetRiders);
  rosters.flyers.forEach(own);
  const groups = [
    { id: 'umbrella', label: '撑伞行人', category: '行人', description: '并列比较老街分片雨伞、原始伞客和片区行人。', source: 'index.html · district-streets.js' },
    { id: 'phone', label: '手机行人', category: '行人', description: '集中查看拿手机的不同服装、姿势和配色。', source: 'index.html / makeStreetCrowd' },
    { id: 'tote', label: '提袋行人', category: '行人', description: '手提帆布袋的等候者、夜游者与茶摊顾客。', source: 'index.html / makeStreetCrowd' },
    { id: 'tea', label: '茶摊人物', category: '行人', description: '持杯顾客与茶摊店主，比较手势、杯子、围裙和托盘。', source: 'index.html / makeStreetCrowd' },
    { id: 'pedestrian', label: '普通行人', category: '行人', description: '外围步行、停留和结伴人群的原始实例。', source: 'district-streets.js' },
    { id: 'service-robot', label: '服务机器人', category: '机器人', description: '观察配送舱、传感器、轮组与分层机壳。', source: 'district-streetgear.js' },
    { id: 'biped', label: '双足机器人', category: '机器人', description: '观察巡逻机体的装甲、关节与双腿步态。', source: 'district-bipeds.js' },
    { id: 'crab', label: '蟹式重机', category: '机器人', description: '观察重型装甲、成对前钳与外展机械腿。', source: 'district-bipeds.js' },
    { id: 'rider', label: '霓虹骑手', category: '骑手与信使', description: '观察骑姿、头盔面罩、轮组与摩托车架。', source: 'district-riders.js' },
    { id: 'flying-rider', label: '飞行骑手', category: '骑手与信使', description: '观察骑手、悬浮车壳与推进器。', source: 'district-air.js' },
    { id: 'courier', label: '楼顶信使', category: '骑手与信使', description: '观察轻型机体、配送背包与真实跑跳动作。', source: 'district-leapers.js' },
  ].map(group => ({ ...group, variants: [] }));
  const byId = new Map(groups.map(group => [group.id, group]));
  const addGroup = definition => {
    const group = { ...definition, variants: [] }; groups.push(group); byId.set(group.id, group);
  };
  const add = (groupId, variant) => {
    const create = variant.create;
    variant.create = () => {
      if (disposed) throw new Error('角色目录已关闭，请重新加载后创建模型。');
      const card = create(), dispose = card.dispose;
      let cardDisposed = false;
      card.dispose = () => { if (cardDisposed) return; cardDisposed = true; dispose?.(); activeCards.delete(card); };
      activeCards.add(card); return card;
    };
    byId.get(groupId).variants.push(variant);
  };
  try {
    const crowd = own(legacy.makeStreetCrowd({ seed: 2049 })), crowdTick = updater(crowd);
    const definitions = new Map(legacy.legacyPersonDefinitions.map(definition => [definition.name, definition]));
    for (const person of crowd.userData.people) {
      const definition = definitions.get(person.name);
      if (!definition) throw new Error(`找不到 ${person.name} 的原始人物定义。`);
      const groupId = definition.umbrella ? 'umbrella' : definition.prop === 'phone' ? 'phone' : definition.prop === 'tote' ? 'tote' : ['cup', 'vendor'].includes(definition.prop) ? 'tea' : 'pedestrian';
      const coat = person.group.getObjectByName('Raincoat').material.color.getHexString();
      const colorName = COLORS[`#${coat}`] || `#${coat}`;
      const role = definition.prop === 'vendor' ? '茶摊店主' : definition.walk ? '结伴步行' : definition.prop === 'phone' ? '查看手机' : definition.prop === 'tote' ? '手提帆布袋' : definition.prop === 'cup' ? '持杯交谈' : '撑伞等候';
      add(groupId, {
        id: `old-street-${person.name}`, label: `${colorName} · ${role}`, name: person.name, source: 'index.html / makeStreetCrowd', family: 'old-street',
        tags: ['老街', '精细模型', role, colorName], location: person.homePosition.toArray(),
        create: () => cloneCharacter(person.group, crowdTick),
      });
    }
    const details = own(legacy.makeStreetDetails({ seed: 2049 }));
    details.children.filter(node => node.name.startsWith('UmbrellaPedestrian-')).forEach((person, index) => add('umbrella', {
      id: `original-${person.name}`, label: `原始伞客 ${index + 1}`, name: person.name, source: 'index.html / makeStreetDetails', family: 'original',
      tags: ['老街', '原始模型', '十片伞面'], location: person.position.toArray(), create: () => cloneCharacter(person),
    }));

    const streets = own(makeDistrictStreets({ seed: 2049 })), streetTick = updater(streets);
    streets.userData.people.forEach((person, index) => {
      const region = sectorLabel(person._px, person._pz), role = person.walkAxis ? '步行' : person.crowd ? '结伴停留' : '站立';
      add(person.umbrella ? 'umbrella' : 'pedestrian', {
        id: `district-person-${index + 1}`, label: `${region} · ${role} ${String(index + 1).padStart(3, '0')}`, name: `DistrictPerson-${index + 1}`, source: 'district-streets.js / makeDistrictStreets', family: 'district',
        tags: ['外围', '精修行人', region, role], location: [person._px, .135, person._pz],
        create: () => extractInstances({ name: `DistrictPerson-${index + 1}`, tick: streetTick,
          parts: instanceParts(streets, index, 'DistrictPeople-').filter(({ mesh }) => person.umbrella || !mesh.name.includes('Umbrella')),
          frame: () => ({ x: person._px, y: .135, z: person._pz, yaw: person._yaw }),
        }),
      });
    });

    const centralRobots = rosters.streetRobots, outerRobots = own(makeStreetRobots({ seed: 2049, routes: rosters.ROBOT_LANES }));
    for (const [source, area] of [[centralRobots, '老街'], [outerRobots, '外围']]) {
      const tick = updater(source);
      source.userData.robots.forEach((robot, index) => add('service-robot', {
        id: `service-${area === '老街' ? 'central' : 'outer'}-${index + 1}`, label: `${area} · ${robot.static ? '固定哨兵' : '配送机器人'} ${index + 1}`, source: 'district-streetgear.js / makeStreetRobots', family: area,
        tags: [area, robot.static ? '传感器巡视' : '轮式配送', robot.neon],
        create: () => extractInstances({ name: `ServiceRobot-${index + 1}`, parts: instanceParts(source, index), tick, fade: () => robot.fade,
          frame: () => ({ x: robot.x, y: 0, z: robot.z, yaw: robot.yaw }),
        }),
      }));
    }

    const bipeds = own(makeDistrictBipeds({ seed: 2049, units: rosters.BIPED_UNITS })), bipedTick = updater(bipeds);
    bipeds.userData.robots.forEach((robot, index) => {
      const shape = bipeds.userData.shapes[robot.kind];
      add(robot.kind === 'crab' ? 'crab' : 'biped', {
        id: `biped-${index + 1}`, label: `${robot.kind === 'crab' ? '蟹式重机' : '双足巡逻'} ${index + 1}`, source: 'district-bipeds.js / makeDistrictBipeds', family: robot.neon,
        tags: ['外围', `${robot.scale} 倍原始缩放`, robot.neon, '双腿步态'],
        create: () => extractInstances({ name: `Biped-${index + 1}`, tick: bipedTick, fade: () => robot.fade,
          parts: [{ mesh: shape.bodyMesh, index: robot.index }, { mesh: shape.neonMesh, index: robot.index }, ...bipeds.userData.legMeshes.map(mesh => ({ mesh, index: robot.slot }))],
          frame: () => ({ x: robot.x, y: 0, z: robot.z, yaw: robot.yaw }),
        }),
      });
    });

    const centralRiders = rosters.streetRiders, outerRiders = own(makeNeonRiders({ seed: 2049, routes: rosters.RIDER_LANES }));
    for (const [source, area] of [[centralRiders, '老街'], [outerRiders, '外围']]) {
      const tick = updater(source);
      source.userData.riders.forEach((rider, index) => add('rider', {
        id: `rider-${area === '老街' ? 'central' : 'outer'}-${index + 1}`, label: `${area}骑手 ${index + 1}`, source: 'district-riders.js / makeNeonRiders', family: area,
        tags: [area, '摩托与骑手', rider.coat, rider.neon],
        create: () => extractInstances({ name: `Rider-${index + 1}`, parts: instanceParts(source, index), tick, fade: () => rider.fade,
          frame: () => ({ x: rider.x, y: 0, z: rider.z, yaw: rider.yaw }),
        }),
      }));
    }

    const flying = own(makeFlyingBikes({ seed: 2049, routes: rosters.BIKE_LANES })), flyingTick = updater(flying);
    flying.userData.bikes.forEach((bike, index) => add('flying-rider', {
      id: `flying-rider-${index + 1}`, label: `飞行骑手 ${index + 1}`, source: 'district-air.js / makeFlyingBikes', family: bike.neon,
      tags: ['空中', '骑手与车架', bike.neon, '原地悬浮'],
      create: () => extractInstances({ name: `FlyingRider-${index + 1}`, parts: instanceParts(flying, index), tick: flyingTick, fade: () => bike.fade,
        frame: () => ({ x: bike.x, y: bike.route.height, z: bike.z, yaw: bike.yaw }),
      }),
    }));

    // Real rooftop tracks need only the authored footprints/heights, not building meshes.
    const heightsMatch = architectureSource.match(/const FROZEN_HEIGHTS\s*=\s*(\[[\s\S]*?\]);/);
    if (!heightsMatch) throw new Error('楼顶信使的建筑高度名册已改变。');
    const heights = JSON.parse(heightsMatch[1]);
    if (heights.length !== DISTRICT_LAYOUT.length) throw new Error('楼顶信使的建筑高度名册不完整。');
    const buildings = DISTRICT_LAYOUT.map((footprint, index) => ({ ...footprint, height: heights[index] }));
    const leapers = own(makeDistrictLeapers({ seed: 2049, buildings, perSector: 1 })), leaperTick = updater(leapers);
    leapers.userData.runners.forEach((runner, index) => {
      const sector = DISTRICT_STYLES.find(style => style.id === runner.track.sector)?.name || runner.track.sector;
      const bodyMesh = leapers.getObjectByName('DistrictLeapers-Bodies'), yawMatrix = new THREE.Matrix4();
      add('courier', {
        id: `courier-${index + 1}`, label: `${sector} · 信使 ${index + 1}`, source: 'district-leapers.js / makeDistrictLeapers', family: runner.neon,
        tags: [sector, '奔跑与跳跃', runner.neon, '原地动作'],
        create: () => extractInstances({ name: `Courier-${index + 1}`, parts: instanceParts(leapers, index), tick: leaperTick,
          frame: () => { bodyMesh.getMatrixAt(index, yawMatrix); return { x: runner.x, y: runner.y, z: runner.z, yaw: Math.atan2(yawMatrix.elements[8], yawMatrix.elements[10]) }; },
        }),
      });
    });

    extendMotionCatalog({ own, add, addGroup, groups, legacy, rosters, streets, outerRobots, outerRiders });
    for (const group of groups) group.variants = weaveVariants(group.variants);
    return {
      groups: groups.filter(group => group.variants.length),
      dispose() { if (disposed) return; disposed = true; [...activeCards].forEach(card => card.dispose()); disposeSources(sources); },
    };
  } catch (error) { [...activeCards].forEach(card => card.dispose()); disposeSources(sources); throw error; }
}
