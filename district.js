import * as THREE from 'three';
import { injectFacadeWallWash } from './facade-wall-wash.js';
import { makeDistrictBuildings, makeDistrictHorizon } from './district-buildings.js';
import { makeDistrictLandmarks } from './district-landmarks.js';
import { makeDistrictStreets, makeDistrictWeather } from './district-streets.js';
import { DISTRICT_STYLES } from './district-styles.js';
import { makeDistrictAccents } from './district-accents.js';
import { makeDistrictLighting } from './district-lighting.js';
import { makeNeonRiders } from './district-riders.js';
import { makeDistrictEquipment } from './district-equipment.js';
import { makeDistrictLinks } from './district-links.js';
import { makeDistrictHolograms } from './district-holograms.js';
import { makeDistrictKiosks, makeStreetRobots, makeCyberBuses } from './district-streetgear.js';
import { makeDistrictBipeds } from './district-bipeds.js';
import { makeDistrictLeapers } from './district-leapers.js';
import { makeFlyingBikes, makeAirships } from './district-air.js';
import { makeDistrictStreetGlow } from './district-streetglow.js';
import { makeDistrictShops } from './district-shops.js';
import { makeDistrictAlleys } from './district-alleys.js';
import { makeDistrictClutter } from './district-clutter.js';
import { injectWindowBlink } from './district-window-blink.js';
import { makeDistrictLife } from './district-life.js';
import { makeMegacityHeadquarters } from './megacity-headquarters.js';
import { makeMegacitySkyway } from './megacity-skyway.js';
import { makeMegacityDistance } from './megacity-distance.js';
import { installReflectionDistanceLOD } from './megacity-reflection-lod.js';
import { makeCitySearchlights } from './city-searchlights.js';
import { makeSkyTraffic } from './sky-traffic.js';

// Neon motorcycles ride the outer lane of every main avenue: 3.6 units off the
// centreline, clear of the 2-unit car lanes and of the pedestrian sidewalks at
// 5.4 and beyond. The central avenue splits around the original crossing, so its
// lanes run as two segments and fade out before the老街.
const RIDER_LANES = [-42, 42].flatMap(cx => [-3.6, 3.6].map(offset => ({
  axis: 'z', offset: cx + offset, direction: offset < 0 ? 1 : -1,
  low: -78, length: 156, fade: 4.5, speed: 2.2, count: 3, spacing: 52,
})));
for (const offset of [-3.6, 3.6]) for (const low of [-78, 36]) {
  RIDER_LANES.push({
    axis: 'z', offset, direction: offset < 0 ? 1 : -1,
    low, length: 42, fade: 5, speed: 2, count: 2, spacing: 21,
  });
}

// Delivery robots roll in the gutter lane at 4.25: outboard of the riders at 3.6
// and inboard of the curb lamps at 4.78, so the three lanes never touch.
const ROBOT_LANES = [-42, 42].flatMap(cx => [-4.25, 4.25].map(offset => ({
  axis: 'z', offset: cx + offset, direction: offset < 0 ? 1 : -1,
  low: -78, length: 156, fade: 4, speed: 1.5, count: 3, spacing: 52,
})));
for (const offset of [-4.25, 4.25]) for (const low of [-78, 36]) {
  ROBOT_LANES.push({ axis: 'z', offset, direction: offset < 0 ? 1 : -1, low, length: 42, fade: 4.5, speed: 1.4, count: 1 });
}

// Opposite bus directions use separate centre lanes, with 0.10 between their
// full 1.30-wide envelopes. Cars remain at +/-2 and riders at +/-3.6.
const BUS_LANES = [-42, 0, 42].flatMap(cx => [-1, 1].map(flank => ({
  axis: 'z', offset: cx + flank * .70, direction: flank < 0 ? 1 : -1,
  low: cx === 0 ? 34 : -78, length: cx === 0 ? 44 : 156, fade: 6,
  speed: cx === 0 ? 1.1 : 1.22, count: cx === 0 ? 1 : 2, spacing: cx === 0 ? 22 : 78,
  phase: flank < 0 ? 0 : 30,
})));

// Two-legged units walk the cross streets, which carry no wheeled traffic at all:
// the heavy 2.5x walkers in the outer band and the human-sized units inboard.
// 2026-09-15 evening: one crab and two bots per lane left a 160-unit street with a
// machine every ~30 units, which is why the cross streets read as empty. Doubling the
// counts keeps every lane single-direction (constant spacing, no head-on passes) and
// stays inside the lane-containment gate (|offset| + .52 <= 4). All instances ride the
// same merged batches, so the fleet costs +0 draw calls.
const BIPED_UNITS = [];
for (const cz of [-48, 0, 48]) {
  for (const half of [-1, 1]) {
    BIPED_UNITS.push({
      kind: 'crab',
      route: { axis: 'x', offset: cz + half * 3.1, direction: half, low: half < 0 ? -34 : 12, length: 22, fade: 4, speed: 1.5 },
      scale: 2.2, count: 2, spacing: 11, phase: 4,
    });
    BIPED_UNITS.push({
      route: { axis: 'x', offset: cz - half * 2.5, direction: -half, low: half < 0 ? -34 : 12, length: 22, fade: 4, speed: 1.25 },
      scale: .68, count: 4, spacing: 5.5, phase: 2,
    });
  }
}

// Single-rider bikes own the band between the traffic and the skyline.
const BIKE_LANES = [-42, 0, 42].flatMap(cx => [-1, 1].flatMap(flank => [
  { axis: 'z', offset: cx + flank * 4.4, height: 8.2 + (cx === 0 ? 0 : 1.4), direction: -flank, low: cx === 0 ? 36 : -78, length: cx === 0 ? 42 : 156, fade: 6, speed: 4.6, count: cx === 0 ? 1 : 2, spacing: 78, phase: 12 },
]));
BIKE_LANES.push(
  { axis: 'z', offset: -18, height: 12.6, direction: 1, low: -80, length: 160, fade: 7, speed: 5.2, count: 2, spacing: 80, phase: 30 },
  { axis: 'z', offset: 18, height: 11.2, direction: -1, low: -80, length: 160, fade: 7, speed: 5.0, count: 2, spacing: 80, phase: 60 },
);

export function createDistrict({ block, seed = 2049, gpuCrowd = true }) {
  const district = new THREE.Group(); district.name = 'GreaterKowloon';
  // The original factory remains independently reusable with its compact skyline and rain.
  block.getObjectByName('DistantSkyline').visible = false;
  block.userData.road.material.uniforms.uDistrict.value = 1;
  block.userData.road.scale.setScalar(2);
  DISTRICT_STYLES.forEach((style, index) => {
    block.userData.road.material.uniforms.uDistrictPrimary.value[index].set(style.primary);
    block.userData.road.material.uniforms.uDistrictSecondary.value[index].set(style.secondary);
  });
  const architecture = makeDistrictBuildings({ seed }), landmarks = makeDistrictLandmarks({ seed });
  const streets = makeDistrictStreets({ seed, gpuCrowd }), weather = makeDistrictWeather({ seed });
  const accents = makeDistrictAccents({ seed }), lighting = makeDistrictLighting(architecture.userData);
  const riders = makeNeonRiders({ seed, routes: RIDER_LANES });
  // Equipment, links, holograms, kiosks and robots all hang off the finished
  // masses, so they are built after the architecture and stay out of its group.
  const massData = architecture.userData.buildings;
  const equipment = makeDistrictEquipment({ seed, buildings: massData });
  const links = makeDistrictLinks({ seed, buildings: massData, sectors: DISTRICT_STYLES });
  const holograms = makeDistrictHolograms({ seed, buildings: massData, sectors: DISTRICT_STYLES });
  const kiosks = makeDistrictKiosks({ seed, buildings: massData, sectors: DISTRICT_STYLES });
  const robots = makeStreetRobots({ seed, routes: ROBOT_LANES });
  const buses = makeCyberBuses({ seed, routes: BUS_LANES });
  const bipeds = makeDistrictBipeds({ seed, units: BIPED_UNITS });
  const leapers = makeDistrictLeapers({ seed, buildings: massData, perSector: 1 });
  const bikes = makeFlyingBikes({ seed, routes: BIKE_LANES });
  const airships = makeAirships({ seed, count: 3 });
  const streetGlow = makeDistrictStreetGlow({ seed, buildings: massData, sectors: DISTRICT_STYLES, reserved: kiosks.userData.kiosks });
  const shops = makeDistrictShops({ seed, buildings: massData });
  const alleys = makeDistrictAlleys({ seed, buildings: massData, sectors: DISTRICT_STYLES, reserved: [...kiosks.userData.kiosks, ...streetGlow.userData.trees, ...streetGlow.userData.signs] });
  const clutter = makeDistrictClutter({ seed, buildings: massData, sectors: DISTRICT_STYLES });
  district.add(architecture, landmarks, streets, accents, lighting, weather, makeDistrictHorizon({ seed }), riders,
    equipment, links, holograms, kiosks, robots, buses, bipeds, leapers, bikes, airships, streetGlow, shops, alleys, clutter);

  const life = makeDistrictLife({ streets, landmarks, riders, robots, buses, buildings: massData,
    reserved: [...kiosks.userData.kiosks, ...streetGlow.userData.trees, ...streetGlow.userData.posts, ...streetGlow.userData.signs, ...alleys.userData.alleyLamps, ...clutter.userData.items] });
  district.add(life);
  const headquarters=makeMegacityHeadquarters(),skyway=makeMegacitySkyway({buildings:massData}),distanceCity=makeMegacityDistance({seed});
  district.add(headquarters,skyway,distanceCity);
  const searchlights=makeCitySearchlights({buildings:[...massData,...district.getObjectByName('DistrictHorizon').userData.buildings]});
  district.add(searchlights);
  const skyTraffic=makeSkyTraffic({buildings:massData,obstacles:[
    ...district.getObjectByName('DistrictHorizon').userData.buildings,...distanceCity.userData.buildings,
    ...block.userData.buildings.map(b=>({x:b.position.x,z:b.position.z,width:b.userData.width+.4,depth:4.6,height:b.userData.height+3.2})),
    {x:32,z:-60,width:9,depth:11,height:54},{x:52,z:-60,width:9,depth:11,height:64},headquarters.userData.bounds,
  ]});
  district.add(skyTraffic);

  const reflection = new THREE.Group(); reflection.name = 'DistrictWetReflection';
  reflection.scale.y = -1; reflection.position.y = -.075;
  // The mirrored architecture shares the building geometry -- and therefore the window-rhythm
  // attribute -- so the same injection has to go on the mirrored materials too. Without it the
  // reflection keeps the baked colours and a window that has just gone dark still reflects lit.
  const windowBlinkUniforms = architecture.userData.windowBlinkUniforms;
  // Fresnel fade: a wet mirror reads at grazing incidence (street level) and
  // vanishes from steep views -- from the skyway the stacked mirrored blocks
  // otherwise fill every gap between roads as a bright grey carpet.
  const reflectionStrength = { value: 1 };
  const materials = new Map(), reflected = architecture.clone(true);
  reflected.traverse(object => {
    if (!object.material) return;
    if (!materials.has(object.material)) {
      const material = object.material.clone();
      if (material.color) material.color.multiplyScalar(.36);
      material.onBeforeCompile = shader => {
        injectWindowBlink(shader, windowBlinkUniforms);
        injectFacadeWallWash(shader, material.userData.facadeWallWash);
        shader.uniforms.uReflectionStrength = reflectionStrength;
        shader.vertexShader = 'varying vec3 vDistrictReflection;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 reflectedPoint=vec4(transformed,1.);
          #ifdef USE_INSTANCING
          reflectedPoint=instanceMatrix*reflectedPoint;
          #endif
          vDistrictReflection=(modelMatrix*reflectedPoint).xyz;`);
        shader.fragmentShader = 'varying vec3 vDistrictReflection;uniform float uReflectionStrength;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
          gl_FragColor.rgb*=exp(-abs(vDistrictReflection.y)*.16)*(.78+.22*sin(vDistrictReflection.y*29.+vDistrictReflection.x*3.))*uReflectionStrength;`);
      };
      material.customProgramCacheKey = () => 'district-wet-reflection-window-blink'+(material.userData.facadeWallWash?'|facade-wall-wash-v1':'');
      materials.set(object.material, material);
    }
    object.material = materials.get(object.material);
  });
  reflection.add(reflected); installReflectionDistanceLOD(reflection,reflected); district.add(reflection);
  const reflectionEye = new THREE.Vector3();
  // Chain with the distance LOD's prepareView (it swaps full/distant detail);
  // the Fresnel fade must replace it, not shadow it.
  const lodPrepareView = reflection.userData.prepareView;
  reflection.userData.prepareView = camera => {
    lodPrepareView(camera);
    camera.getWorldPosition(reflectionEye);
    // Full mirror below ~30 units of eye height, gone by ~110 (skyway deck).
    reflectionStrength.value = 1 - THREE.MathUtils.smoothstep(reflectionEye.y, 30, 110);
  };
  const viewPoints = [];
  const framingBuildings = [
    ...architecture.userData.buildings,
    ...block.userData.buildings.map(b => ({ x: b.position.x, z: b.position.z, width: b.userData.width + .4, depth: 4.6, height: b.userData.height + 3.2 })),
    { x: 32, z: -60, width: 9, depth: 11, height: 54 },
    { x: 52, z: -60, width: 9, depth: 11, height: 64 },
  ];
  for (const b of framingBuildings) for (const x of [-1, 1]) for (const y of [0, b.height]) for (const z of [-1, 1]) {
    viewPoints.push(new THREE.Vector3(b.x + x * b.width / 2, y, b.z + z * b.depth / 2));
  }
  const sectors = DISTRICT_STYLES.map(style => {
    const buildings = style.id === 'center' ? framingBuildings.slice(architecture.userData.buildings.length, -2) : architecture.userData.buildings.filter(b => b.sector === style.id);
    const localBuildings = style.id === 'northeast' ? [...buildings, ...framingBuildings.slice(-2)] : buildings;
    const points = [];
    for (const b of localBuildings) for (const x of [-1, 1]) for (const y of [0, b.height]) for (const z of [-1, 1]) points.push(new THREE.Vector3(b.x + x * b.width / 2, y, b.z + z * b.depth / 2));
    return { ...style, buildingCount: localBuildings.length, maxHeight: Math.max(...localBuildings.map(b => b.height)), viewPoints: points };
  });
  district.userData = {
    sectorCount: 9, buildingCount: block.userData.buildingCount + architecture.userData.buildingCount + 2,
    architecture, landmarks, streets, accents, lighting, weather, riders, equipment, links, holograms, kiosks, robots,
    buses, bipeds, leapers, bikes, airships, streetGlow, shops, alleys, clutter,
    reflection, viewPoints, sectors, life, headquarters, skyway, distanceCity, searchlights, skyTraffic,
    update(seconds) {
      landmarks.userData.update?.(seconds); life.userData.update(seconds); streets.userData.update(seconds); weather.userData.update(seconds);
      lighting.userData.update(seconds); riders.userData.update(seconds); equipment.userData.update(seconds);
      holograms.userData.update(seconds); robots.userData.update(seconds); buses.userData.update(seconds);
      bipeds.userData.update(seconds); leapers.userData.update(seconds); bikes.userData.update(seconds);
      airships.userData.update(seconds); streetGlow.userData.update(seconds);
      // The window rhythm is a shader uniform, so this is the whole per-frame cost of it.
      architecture.userData.update?.(seconds);
      headquarters.userData.update?.(seconds); skyway.userData.update?.(seconds); distanceCity.userData.update?.(seconds); searchlights.userData.update(seconds); skyTraffic.userData.update(seconds);
    },
  };
  return district;
}
