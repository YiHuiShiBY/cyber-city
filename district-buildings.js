import { addArchitectureDetails } from './architecture-details.js';
import * as THREE from 'three';
import { makeStyledDistrictArchitecture, HORIZON_FLOOR_HEIGHT, HORIZON_BAY_WIDTH } from './district-building-geometry.js';
import { applySurfaceDetail } from './surface-detail.js';
import { applyFacadeWallWash } from './facade-wall-wash.js';

function seeded(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function makeDistrictBuildings(options = {}) {
  return makeStyledDistrictArchitecture(options);
}

// A quiet, irregular skyline frames the developed streets without enclosing the foreground.
export function makeDistrictHorizon({ seed = 2049 } = {}) {
  const rng = seeded(seed + 93617);
  const group = new THREE.Group();
  group.name = 'DistrictHorizon';
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const paneGeometry = new THREE.PlaneGeometry(1, 1);
  const massMaterial = applySurfaceDetail(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .16, roughness: .88 }), { scale: .11, strength: 1.1 });
  applyFacadeWallWash(massMaterial, { intensity: 60, reach: .78, source: 'district-horizon' });
  const roofMaterial = applySurfaceDetail(new THREE.MeshStandardMaterial({ color: '#26384e', metalness: .32, roughness: .70 }), { scale: .21, strength: .9 });
  const windowMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  // Sub-pixel panes crawl while the camera turns. Estimate each pane's pixel
  // footprint from its instance scale against the screen-space derivative of
  // its world position, and dim panes below ~3px to unlit darkness -- the same
  // stability principle as the distance-city window fade, applied to real
  // instanced geometry instead of a procedural facade.
  windowMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vHorizonPane; varying vec2 vHorizonPaneSize;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 horizonPanePoint=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      horizonPanePoint=instanceMatrix*horizonPanePoint;
      vHorizonPaneSize=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      #else
      vHorizonPaneSize=vec2(1.,1.);
      #endif
      vHorizonPane=(modelMatrix*horizonPanePoint).xyz;`);
    shader.fragmentShader = 'varying vec3 vHorizonPane; varying vec2 vHorizonPaneSize;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 dx=dFdx(vHorizonPane),dy=dFdy(vHorizonPane);
        float worldPerPixel=max(max(max(abs(dx.x),abs(dx.y)),abs(dx.z)),max(max(abs(dy.x),abs(dy.y)),abs(dy.z)));
        float panePx=min(vHorizonPaneSize.x,vHorizonPaneSize.y)/max(worldPerPixel,1e-5);
        diffuseColor.rgb*=smoothstep(1.1,3.,panePx);
      }`);
  };
  windowMaterial.customProgramCacheKey = () => 'horizon-pane-stability';
  const buckets = [
    { name: 'HorizonMasses', geometry: boxGeometry, material: massMaterial, matrices: [], colors: [] },
    { name: 'HorizonRoofs', geometry: boxGeometry, material: roofMaterial, matrices: [], colors: [] },
    { name: 'HorizonWindows', geometry: paneGeometry, material: windowMaterial, matrices: [], colors: [] },
  ];
  const transform = new THREE.Object3D(), color = new THREE.Color();
  const palette = ['#16263a', '#1b2c40', '#182b3c', '#202b40', '#172235'];
  const windows = ['#6d85a0', '#6e8ca4', '#8391a5', '#a5aaa6'];
  const buildings = [];
  const bounds = { min: [Infinity, 0, Infinity], max: [-Infinity, 0, -Infinity] };
  let windowCount = 0;
  const detailPanes = [], detailMasses = [];

  function instance(bucketIndex, x, y, z, width, height, depth, tint = '#ffffff', rotationY = 0) {
    if (bucketIndex === 2 && depth === 1) detailPanes.push({ index: buildings.length, position: [x,y,z,rotationY], width, height });
    const bucket = buckets[bucketIndex];
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotationY, 0);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    bucket.matrices.push(...transform.matrix.elements);
    color.set(tint);
    bucket.colors.push(color.r, color.g, color.b);
  }

  function mass(x, z, width, depth, height, base, tint) {
    instance(0, x, base + height / 2, z, width, height, depth, tint);
    // The horizon sits on its own coarse grid (V-3). The old per-mass jitter `2.8 + rng() * .6`
    // re-rolled the skyline, so it is dropped outright rather than consumed and discarded: this
    // function's stream only feeds the horizon itself, never the districts.
    const floorPitch = HORIZON_FLOOR_HEIGHT;
    const firstFloor = 1.4 + rng();
    detailMasses.push({ index: buildings.length, x,z,width,depth,height,base,firstFloor,floorPitch,bayWidth:HORIZON_BAY_WIDTH });
    for (let y = base + firstFloor; y < base + height - .75; y += floorPitch) {
      for (let face = 0; face < 4; face++) {
        const span = face < 2 ? width : depth;
        const columns = Math.max(2, Math.round(span / HORIZON_BAY_WIDTH));
        for (let column = 0; column < columns; column++) {
          if (rng() > .32) continue;
          const along = (column - (columns - 1) / 2) * span / (columns + .6);
          const xOffset = face < 2 ? along : (face === 2 ? 1 : -1) * (width / 2 + .013);
          const zOffset = face < 2 ? (face === 0 ? 1 : -1) * (depth / 2 + .013) : along;
          const rotationY = face === 0 ? 0 : face === 1 ? Math.PI : face === 2 ? Math.PI / 2 : -Math.PI / 2;
          const tint = new THREE.Color(windows[Math.floor(rng() * windows.length)]).multiplyScalar(.95 + rng() * .6);
          instance(2, x + xOffset, y, z + zOffset, .45 + rng() * .46, .25 + rng() * .16, 1, tint, rotationY);
          windowCount++;
        }
      }
    }
  }

  for (const edge of ['back', 'west', 'east']) {
    const count = edge === 'back' ? 28 : 18;
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const jitter = (rng() - .5) * 3.2;
      const x = edge === 'back' ? -116 + progress * 232 + jitter : (edge === 'west' ? -1 : 1) * (98 + rng() * 22);
      const z = edge === 'back' ? -99 - rng() * 23 : -87 + progress * 148 + jitter;
      const width = 4.2 + rng() * 7.6, depth = 4.2 + rng() * 7.6;
      const height = edge === 'back' && (i === 5 || i === 21) ? 44 + rng() * 3 : 9 + rng() * 38;
      const tint = new THREE.Color(palette[Math.floor(rng() * palette.length)]).multiplyScalar(1.1 + rng() * .38);
      const style = Math.floor(rng() * 4);
      let roofWidth = width, roofDepth = depth;
      if (style === 1 || style === 2) {
        const lower = height * (style === 1 ? .70 : .85);
        mass(x, z, width, depth, lower, 0, tint);
        roofWidth = width * (style === 1 ? .72 : .54);
        roofDepth = depth * (style === 1 ? .79 : .62);
        mass(x, z, roofWidth, roofDepth, height - lower, lower, tint);
      } else {
        mass(x, z, width, depth, height, 0, tint);
      }
      instance(1, x, height + .12, z, roofWidth + .09, .24, roofDepth + .09);
      instance(1, x - roofWidth * .16, height + .49, z, roofWidth * .30, .73, roofDepth * .32);
      // Aircraft warning lights on the taller roofs read to the horizon.
      if (height > 30) instance(2, x, height + 1.4, z, .5, .5, .5, '#ff5c50');
      let top = height + .86;
      if (i % 4 === 1) {
        const mast = 1.3 + rng() * 1.3;
        instance(1, x + roofWidth * .20, height + mast / 2, z - roofDepth * .15, .07, mast, .07);
        top = height + mast;
      }
      const record = { x, z, width: width + .10, depth: depth + .10, height: top, edge };
      buildings.push(record);
      bounds.min[0] = Math.min(bounds.min[0], x - record.width / 2);
      bounds.min[2] = Math.min(bounds.min[2], z - record.depth / 2);
      bounds.max[0] = Math.max(bounds.max[0], x + record.width / 2);
      bounds.max[1] = Math.max(bounds.max[1], top);
      bounds.max[2] = Math.max(bounds.max[2], z + record.depth / 2);
    }
  }

  let instanceCount = 0;
  for (const bucket of buckets) {
    const count = bucket.matrices.length / 16;
    const batch = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
    batch.name = bucket.name;
    batch.instanceMatrix.array.set(bucket.matrices);
    batch.instanceMatrix.needsUpdate = true;
    batch.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bucket.colors), 3);
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    group.add(batch);
    instanceCount += count;
  }
  group.userData = { seed, buildings, buildingCount: buildings.length, bounds, batchCount: group.children.length, instanceCount, windowCount };
  addArchitectureDetails(group, buildings, detailPanes, detailMasses);
  return group;
}
