import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colorGroundGeometry, makeSkywayPodDetails, makeGroundVehicleDetailView } from './ground-vehicle-details.js';

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

/** A narrow, inhabited viaduct in the clear strip between the districts and horizon. */
export function makeMegacitySkyway({ buildings = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'MegacitySkyway';
  const occupied = buildings.filter(b => [b.x, b.z, b.width, b.depth].every(Number.isFinite));
  const reachX = Math.max(0, ...occupied.map(b => Math.abs(b.x) + b.width / 2));
  const reachZ = Math.max(0, ...occupied.map(b => Math.abs(b.z) + b.depth / 2));
  const halfX = Math.max(79, reachX + 18), halfZ = Math.max(86, reachZ + 18);
  const radius = 21, halfWidth = 3.5, laneOffset = 1.55;
  const frontHeight = 22, rearHeight = 34, heightSlope = (rearHeight - frontHeight) / (halfZ * 2);
  const a = halfX - radius, b = halfZ - radius;
  const parts = [
    { kind: 'line', x: -a, z: halfZ, tx: 1, tz: 0, length: a * 2 },
    { kind: 'arc', x: a, z: b, angle: 0, length: radius * Math.PI / 2 },
    { kind: 'line', x: halfX, z: b, tx: 0, tz: -1, length: b * 2 },
    { kind: 'arc', x: a, z: -b, angle: Math.PI / 2, length: radius * Math.PI / 2 },
    { kind: 'line', x: a, z: -halfZ, tx: -1, tz: 0, length: a * 2 },
    { kind: 'arc', x: -a, z: -b, angle: Math.PI, length: radius * Math.PI / 2 },
    { kind: 'line', x: -halfX, z: -b, tx: 0, tz: 1, length: b * 2 },
    { kind: 'arc', x: -a, z: b, angle: Math.PI * 1.5, length: radius * Math.PI / 2 },
  ];
  let length = 0;
  for (const part of parts) { part.start = length; length += part.length; }

  function sample(distance, lateral = 0) {
    const wrapped = mod(distance, length);
    const part = parts.find(segment => wrapped < segment.start + segment.length) || parts[0];
    const along = wrapped - part.start;
    let x, z, tx, tz;
    if (part.kind === 'arc') {
      const angle = part.angle + along / radius;
      x = part.x + Math.sin(angle) * radius;
      z = part.z + Math.cos(angle) * radius;
      tx = Math.cos(angle); tz = -Math.sin(angle);
    } else {
      x = part.x + part.tx * along; z = part.z + part.tz * along;
      tx = part.tx; tz = part.tz;
    }
    const nx = -tz, nz = tx;
    // The cross-section stays level across its width. Its long slope is continuous
    // through all eight joins, including the wrap from the last corner to the front.
    const y = frontHeight + (halfZ - z) * heightSlope;
    const laneFactor = part.kind === 'arc' ? 1 + lateral / radius : 1;
    const ty = -heightSlope * tz;
    return {
      x: x + nx * lateral, y, z: z + nz * lateral,
      tx: tx * laneFactor, ty, tz: tz * laneFactor, nx, nz,
      yaw: Math.atan2(tx, tz), distance: wrapped, lateral,
    };
  }

  // Straight spans need few subdivisions; the 24 steps in every quarter circle
  // preserve a smooth silhouette without spending triangles on long flat spans.
  const distances = [];
  for (const part of parts) {
    const count = part.kind === 'arc' ? 24 : 8;
    for (let i = 0; i < count; i++) distances.push(part.start + part.length * i / count);
  }
  // Explicit stations let the south access throat lower only the outer parapet.
  for (const x of [-41, -38, -35, 28, 31, 34]) distances.push(x + a);
  distances.push(length); distances.sort((x, y) => x - y);
  const samples = distances.map(distance => ({ ...sample(distance), distance }));

  const rampHalfWidth = 3.25;
  const rampCurves = [
    [[-38, halfZ], [-10, halfZ], [34, halfZ + 1], [34, halfZ + 19]],
    [[34, halfZ + 19], [34, halfZ + 39], [-32, halfZ + 25], [-32, halfZ + 45]],
    [[-32, halfZ + 45], [-32, halfZ + 59], [0, halfZ + 49], [0, halfZ + 63]],
  ];
  function bezier(curve, t) {
    const [a, b, c, d] = curve, u = 1 - t;
    const x = u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0];
    const z = u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1];
    const dx = 3*u*u*(b[0]-a[0]) + 6*u*t*(c[0]-b[0]) + 3*t*t*(d[0]-c[0]);
    const dz = 3*u*u*(b[1]-a[1]) + 6*u*t*(c[1]-b[1]) + 3*t*t*(d[1]-c[1]);
    const ddx = 6*u*(c[0]-2*b[0]+a[0]) + 6*t*(d[0]-2*c[0]+b[0]);
    const ddz = 6*u*(c[1]-2*b[1]+a[1]) + 6*t*(d[1]-2*c[1]+b[1]);
    const speed = Math.hypot(dx, dz);
    return { x, z, tx: dx/speed, tz: dz/speed, curvature: (dx*ddz-dz*ddx)/(speed*speed*speed) };
  }
  const rampLut = [];
  let rampLength = 0, prior = null;
  for (let curve = 0; curve < rampCurves.length; curve++) for (let step = 0; step <= 240; step++) {
    const t = step/240, point = bezier(rampCurves[curve], t);
    if (prior) rampLength += Math.hypot(point.x-prior.x, point.z-prior.z);
    rampLut.push({ distance: rampLength, curve, t, ...point }); prior = point;
  }
  // Both road beds remain level until the full branch has cleared the old edge.
  // A long S descent then reaches the ground without a steep single drop.
  const gradeStart = rampLut.find(p => p.z-rampHalfWidth*p.tx > halfZ+halfWidth+.6).distance + 2;
  const groundHeight = .12, descentLength = rampLength-gradeStart;
  function gradeProfile(progress) {
    const u = THREE.MathUtils.clamp(progress, 0, 1), easing = .12, scale = 1/(1-easing);
    if (u < easing) return { value: u*u/(2*easing)*scale, derivative: u/easing*scale };
    if (u > 1-easing) return { value: 1-(1-u)*(1-u)/(2*easing)*scale, derivative: (1-u)/easing*scale };
    return { value: (u-easing/2)*scale, derivative: scale };
  }
  function sampleRamp(distance, lateral = 0) {
    const s = THREE.MathUtils.clamp(distance, 0, rampLength);
    let lo = 0, hi = rampLut.length-1;
    while (hi-lo > 1) { const middle = (lo+hi)>>1; if (rampLut[middle].distance < s) lo=middle; else hi=middle; }
    const first = rampLut[lo], last = rampLut[hi];
    const blend = last.distance > first.distance ? (s-first.distance)/(last.distance-first.distance) : 0;
    const curve = first.curve === last.curve ? first.curve : last.curve;
    const t = first.curve === last.curve ? first.t+(last.t-first.t)*blend : last.t*blend;
    const p = bezier(rampCurves[curve], t), grade = gradeProfile((s-gradeStart)/descentLength);
    const factor = 1-p.curvature*lateral, nx = -p.tz, nz = p.tx;
    return { x:p.x+nx*lateral, y:frontHeight-(frontHeight-groundHeight)*grade.value, z:p.z+nz*lateral,
      tx:p.tx*factor, ty:s<=gradeStart?0:-(frontHeight-groundHeight)*grade.derivative/descentLength,
      tz:p.tz*factor, nx,nz,yaw:Math.atan2(p.tx,p.tz), distance:s,lateral,curvature:p.curvature };
  }
  const rampSamples = [];
  for (let curve=0;curve<rampCurves.length;curve++) for (let step=0;step<24;step++) {
    const lutPoint = rampLut[curve*241+step*10]; rampSamples.push(sampleRamp(lutPoint.distance));
  }
  rampSamples.push(sampleRamp(rampLength));
  const rampSupports = [];
  const southRamp = { id:'south-ground-access',kind:'two-way',width:rampHalfWidth*2,length:rampLength,
    entry:sampleRamp(0),exit:sampleRamp(rampLength),gradeStart,laneOffsets:[-laneOffset,laneOffset],
    samples:rampSamples,supports:rampSupports,sample:sampleRamp,
    maxGrade:Math.max(...rampSamples.map(p=>Math.abs(p.ty))) };

  function strip(profile, close = false, path = samples, skippedEdges = []) {
    const positions = [], uv = [], indices = [];
    const edgeCount = close ? profile.length : profile.length - 1;
    // Separate profile edges retain architectural creases; vertices along each
    // individual edge are shared so the rounded plan remains smoothly shaded.
    for (let edge = 0; edge < edgeCount; edge++) {
      if (skippedEdges.includes(edge)) continue;
      const next = (edge + 1) % profile.length, start = positions.length / 3;
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        for (const index of [edge, next]) {
          const [offset, authoredHeight] = profile[index];
          const opening = path === samples && p.z > halfZ-.001 && offset > 3 && authoredHeight > .4
            ? THREE.MathUtils.clamp((p.x+41)/6,0,1)*THREE.MathUtils.clamp((34-p.x)/6,0,1) : 0;
          const height = authoredHeight*(1-opening);
          positions.push(p.x + p.nx * offset, p.y + height, p.z + p.nz * offset);
          uv.push(p.distance, offset);
        }
      }
      for (let i = 0; i < path.length - 1; i++) {
        const q = start + i * 2;
        indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }

  function mergeAndDispose(geometries) {
    const plain = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
    const merged = mergeGeometries(plain);
    for (const geometry of new Set([...geometries,...plain])) geometry.dispose();
    return merged;
  }
  // Only the part outside the main deck is built at the merging throat. Clipping
  // all material layers at one plane avoids coplanar decks or a rail across lanes.
  function outsideThroat(geometry) {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    const output = Object.fromEntries(Object.keys(plain.attributes).map(name => [name, []]));
    const attributes = plain.attributes, plane = halfZ+halfWidth;
    function vertex(index) {
      const result = {};
      for (const [name,attribute] of Object.entries(attributes)) result[name]=Array.from(attribute.array.slice(index*attribute.itemSize,(index+1)*attribute.itemSize));
      return result;
    }
    function lerp(a,b,t) { return Object.fromEntries(Object.keys(attributes).map(name=>[name,a[name].map((value,index)=>value+(b[name][index]-value)*t)])); }
    for (let i=0;i<attributes.position.count;i+=3) {
      const polygon=[vertex(i),vertex(i+1),vertex(i+2)], clipped=[];
      for(let j=0;j<3;j++) {
        const a=polygon[j],b=polygon[(j+1)%3],aIn=a.position[2]>=plane,bIn=b.position[2]>=plane;
        if(aIn)clipped.push(a);
        if(aIn!==bIn)clipped.push(lerp(a,b,(plane-a.position[2])/(b.position[2]-a.position[2])));
      }
      for(let j=1;j<clipped.length-1;j++)for(const vertex of [clipped[0],clipped[j],clipped[j+1]])for(const name of Object.keys(attributes))output[name].push(...vertex[name]);
    }
    const clipped=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(attributes))clipped.setAttribute(name,new THREE.Float32BufferAttribute(output[name],attribute.itemSize));
    geometry.dispose();if(plain!==geometry)plain.dispose();return clipped;
  }

  const structureMaterial = new THREE.MeshStandardMaterial({ color: '#4a626a', metalness: .54, roughness: .54 });
  const roadMaterial = new THREE.MeshStandardMaterial({ color: '#213740', metalness: .30, roughness: .67 });
  roadMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vSkywayUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkywayUv = uv;');
    shader.fragmentShader = 'varying vec2 vSkywayUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float guide = 1.0 - smoothstep(.025, .07, abs(abs(vSkywayUv.y) - 1.55));
      float median = (1.0 - smoothstep(.025, .055, abs(vSkywayUv.y))) * step(.38, fract(vSkywayUv.x / 6.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.29, .43, .45), guide * .8);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.43, .43, .34), median * .85);
    `);
  };
  roadMaterial.customProgramCacheKey = () => 'megacity-skyway-road-v1';
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#73999f', metalness: .68, roughness: .31 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: '#27777e', toneMapped: false, side: THREE.DoubleSide });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .48, roughness: .32, emissive: '#132530', emissiveIntensity: .12 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, emissive: '#1c6878', emissiveIntensity: .38, metalness: .67, roughness: .16 });
  const undercarriageMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .65, roughness: .39 });
  const lightMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });

  const shellProfile = [
    [-halfWidth, .66], [-3.14, .66], [-3.14, 0], [3.14, 0], [3.14, .66],
    [halfWidth, .66], [halfWidth, -.50], [2.73, -.96], [-2.73, -.96], [-halfWidth, -.50],
  ];
  // The road and parapet caps own the top surfaces. Keeping the structural
  // tops underneath them causes near-coplanar depth competition at a distance.
  const shellTopEdges = [0, 2, 4];
  const shell = strip(shellProfile, true, samples, shellTopEdges);
  const rampProfile = shellProfile.map(([offset,height])=>[offset*rampHalfWidth/halfWidth,height]);
  const structuralParts = [shell.toNonIndexed(),outsideThroat(strip(rampProfile,true,rampSamples,shellTopEdges))]; shell.dispose();
  const up = new THREE.Vector3(0, 1, 0), matrix = new THREE.Matrix4();
  function box(width, height, depth, x, y, z, yaw = 0) {
    return new THREE.BoxGeometry(width, height, depth).rotateY(yaw).translate(x, y, z).toNonIndexed();
  }
  function beam(from, to, width, depth) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), delta = end.clone().sub(start);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
    matrix.compose(start.add(end).multiplyScalar(.5), rotation, new THREE.Vector3(width, delta.length(), depth));
    return new THREE.BoxGeometry(1, 1, 1).applyMatrix4(matrix).toNonIndexed();
  }
  const supports = [];
  function addSupport(p, distance, collection) {
    const columnTop = p.y - 2.6;
    structuralParts.push(box(2.45, .55, 3.0, p.x, .275, p.z, p.yaw));
    structuralParts.push(box(.88, columnTop - .5, 1.48, p.x, (columnTop + .5) / 2, p.z, p.yaw));
    structuralParts.push(box(5.98, .37, 1.45, p.x, p.y - 1.20, p.z, p.yaw));
    for (const side of [-1, 1]) structuralParts.push(beam(
      [p.x, columnTop - .75, p.z],
      [p.x + p.nx * side * 2.70, p.y - 1.28, p.z + p.nz * side * 2.70], .30, .82,
    ));
    collection.push({ x: p.x, z: p.z, deckY: p.y, distance, width: 2.45, depth: 3 });
  }
  for (let i = 0; i < 16; i++) {
    const distance = length * (i + .35) / 16; addSupport(sample(distance), distance, supports);
  }
  for (const progress of [.34,.49,.64,.78,.88]) {
    const distance=rampLength*progress,p=sampleRamp(distance);
    if(p.y>3.8)addSupport(p,distance,rampSupports);
  }
  const structuralGeometry = mergeGeometries(structuralParts);
  for (const geometry of structuralParts) geometry.dispose();
  const structure = new THREE.Mesh(structuralGeometry, structureMaterial);
  structure.name = 'SkywayDeckAndPiers'; group.add(structure);

  const rampRoadHalf=3.14*rampHalfWidth/halfWidth;
  const roadGeometry=mergeAndDispose([
    strip([[-3.14,.012],[3.14,.012]]),
    outsideThroat(strip([[-rampRoadHalf,.012],[rampRoadHalf,.012]],false,rampSamples)),
  ]);
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.name = 'SkywayTwoLaneSurface'; group.add(road);
  const caps = mergeAndDispose([
    strip([[-3.50,.677],[-3.14,.677]]),strip([[3.14,.677],[3.50,.677]]),
    outsideThroat(strip([[-rampHalfWidth,.677],[-rampRoadHalf,.677]],false,rampSamples)),
    outsideThroat(strip([[rampRoadHalf,.677],[rampHalfWidth,.677]],false,rampSamples)),
  ]);
  const rails = new THREE.Mesh(caps, railMaterial);
  rails.name = 'SkywayParapetCaps'; group.add(rails);
  const glowGeometry = mergeAndDispose([
    strip([[-3.505,-.26],[-3.505,-.17]]),strip([[3.505,-.17],[3.505,-.26]]),
    outsideThroat(strip([[-rampHalfWidth-.005,-.26],[-rampHalfWidth-.005,-.17]],false,rampSamples)),
    outsideThroat(strip([[rampHalfWidth+.005,-.17],[rampHalfWidth+.005,-.26]],false,rampSamples)),
  ]);
  const underglow = new THREE.Mesh(glowGeometry, glowMaterial);
  underglow.name = 'SkywayRecessedEdgeLights'; group.add(underglow);

  function loft(stations, beveled = true) {
    const positions = [], indices = [];
    const count = beveled ? 8 : 4;
    for (const [z, width, low, high] of stations) {
      const bevel = Math.min(.12, (high - low) * .28);
      const section = beveled ? [
        [-width, low + bevel], [-width + bevel, low], [width - bevel, low], [width, low + bevel],
        [width, high - bevel], [width - bevel, high], [-width + bevel, high], [-width, high - bevel],
      ] : [[-width, low], [width, low], [width, high], [-width, high]];
      for (const [x, y] of section) positions.push(x, y, z);
    }
    for (let j = 0; j < stations.length - 1; j++) for (let i = 0; i < count; i++) {
      const a = j * count + i, b = j * count + (i + 1) % count;
      indices.push(a, b, a + count, b, b + count, a + count);
    }
    for (let end = 0; end < 2; end++) {
      const start = end ? (stations.length - 1) * count : 0;
      for (let i = 1; i < count - 1; i++) {
        if (end) indices.push(start, start + i, start + i + 1);
        else indices.push(start, start + i + 1, start + i);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  // Geometry is authored nose-first in +Z. All four batches share one matrix per
  // vehicle, including its small pitch on the sloping side spans.
  const bodyGeometry = loft([
    [-2.50, .38, .20, .61], [-1.90, .84, .12, .82], [1.78, .84, .12, .84], [2.52, .42, .26, .59],
  ]);
  const glassGeometry = loft([
    [-1.63, .62, .73, .84], [-1.22, .66, .75, 1.24], [1.02, .66, .76, 1.24], [1.67, .57, .76, .87],
  ], false);
  const undercarriageGeometry = new THREE.BoxGeometry(1.18, .18, 3.70).translate(0, .15, -.02);
  const lightPositions = [], lightColors = [];
  function lamp(x, y, z, w, h, color) {
    const tint = new THREE.Color(color);
    const vertices = [[x-w/2,y-h/2,z], [x+w/2,y-h/2,z], [x+w/2,y+h/2,z], [x-w/2,y-h/2,z], [x+w/2,y+h/2,z], [x-w/2,y+h/2,z]];
    for (const vertex of vertices) { lightPositions.push(...vertex); lightColors.push(tint.r, tint.g, tint.b); }
  }
  for (const side of [-1, 1]) {
    lamp(side * .265, .42, 2.529, .23, .12, '#c4f9f3');
    lamp(side * .245, .40, -2.508, .18, .075, '#e88c59');
  }
  const lightGeometry = new THREE.BufferGeometry();
  lightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lightPositions, 3));
  lightGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lightColors, 3));
  lightGeometry.computeVertexNormals();
  const podDetail = makeSkywayPodDetails({ body: bodyGeometry, glass: glassGeometry, undercarriage: undercarriageGeometry, lights: lightGeometry });
  const lowBodyGeometry = colorGroundGeometry(bodyGeometry), lowGlassGeometry = colorGroundGeometry(glassGeometry, '#244657'), lowUndercarriageGeometry = colorGroundGeometry(undercarriageGeometry, '#213a47');
  bodyGeometry.dispose(); glassGeometry.dispose(); undercarriageGeometry.dispose();

  const vehicles = Array.from({ length: 24 }, (_, index) => {
    const lane = index < 12 ? 1 : -1;
    const speed = lane > 0 ? 9.6 : 10.4;
    return {
      id: `skyway-${String(index + 1).padStart(2, '0')}`, index, lane: lane * laneOffset,
      direction: lane, speed, phaseDistance: length * ((index % 12) + (lane > 0 ? .15 : .62)) / 12,
      period: length / speed, width: 1.68, length: 5.02, height: 1.24,
    };
  });
  const layers = [
    ['SkywayPodBodies', podDetail.body, lowBodyGeometry, bodyMaterial], ['SkywayPodCabins', podDetail.glass, lowGlassGeometry, glassMaterial],
    ['SkywayPodUndercarriages', podDetail.undercarriage, lowUndercarriageGeometry, undercarriageMaterial], ['SkywayPodLights', podDetail.lights, lightGeometry, lightMaterial],
  ].map(([name, geometry, lowGeometry, material]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, vehicles.length);
    mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.detailGeometries = [geometry, lowGeometry];
    // The vehicles cover the whole closed route; a static route bound avoids
    // recomputing 24 transformed geometry bounds every animation frame.
    mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-halfX - halfWidth, 21, -halfZ - halfWidth), new THREE.Vector3(halfX + halfWidth, 36, halfZ + halfWidth));
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    group.add(mesh); return mesh;
  });
  for (const vehicle of vehicles) layers[0].setColorAt(vehicle.index, new THREE.Color(
    vehicle.index % 6 === 0 ? '#e4c49b' : vehicle.direction > 0 ? '#c1d7dc' : '#aabfcd',
  ));
  layers[0].instanceColor.needsUpdate = true;

  function sampleVehicle(index, seconds = 0) {
    const vehicle = vehicles[mod(Math.trunc(Number.isFinite(index) ? index : 0), vehicles.length)];
    const time = Number.isFinite(seconds) ? seconds : 0;
    const distance = vehicle.phaseDistance + mod(time, vehicle.period) * vehicle.speed * vehicle.direction;
    const p = sample(distance, vehicle.lane), direction = vehicle.direction;
    return {
      x: p.x, y: p.y + .10, z: p.z,
      yaw: Math.atan2(p.tx * direction, p.tz * direction),
      pitch: -Math.atan2(p.ty * direction, Math.hypot(p.tx, p.tz)),
      deckY: p.y + .012, roadClearance: .148, distance: p.distance,
      lane: vehicle.lane, direction, speed: vehicle.speed, period: vehicle.period,
      id: vehicle.id, index: vehicle.index,
    };
  }
  const transform = new THREE.Object3D(); transform.rotation.order = 'YXZ';
  let vehicleSeconds = 0;
  function update(seconds) {
    vehicleSeconds = Number.isFinite(seconds) ? seconds : 0;
    for (const vehicle of vehicles) {
      const p = sampleVehicle(vehicle.index, seconds);
      transform.position.set(p.x, p.y, p.z); transform.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      transform.updateMatrix();
      for (const mesh of layers) mesh.setMatrixAt(vehicle.index, transform.matrix);
    }
    for (const mesh of layers) mesh.instanceMatrix.needsUpdate = true;
  }

  let minBuildingClearance = Infinity;
  for (const building of occupied) for (let i = 0; i < 768; i++) {
    const p = sample(length * i / 768);
    const dx = Math.max(0, Math.abs(p.x - building.x) - building.width / 2);
    const dz = Math.max(0, Math.abs(p.z - building.z) - building.depth / 2);
    minBuildingClearance = Math.min(minBuildingClearance, Math.hypot(dx, dz) - halfWidth);
  }
  const route = {
    closed: true, length, width: halfWidth * 2, halfX, halfZ, radius,
    frontHeight, rearHeight, thickness: .96, laneOffsets: [-laneOffset, laneOffset],
    segments: parts, samples, supports, sample, ramps:[southRamp],
    testedBuildingCount: occupied.length, minBuildingClearance: occupied.length ? minBuildingClearance : null,
  };
  const prepareView = makeGroundVehicleDetailView(group, layers, () => vehicles.map(vehicle => sampleVehicle(vehicle.index, vehicleSeconds)), 22);
  group.userData = {
    update, prepareView, detailLevel: 'high', sampleVehicle, vehicles, route, ramps:[southRamp], vehicleCount: vehicles.length, batchCount: group.children.length,
    bounds: { min: [-halfX - halfWidth - .01, groundHeight-.96, -halfZ - halfWidth - .01], max: [halfX + halfWidth + .01, rearHeight + 1.6, halfZ + 63.01] },
    view: { camera: [116, 48, 131], target: [43, 24, 59] },
  };
  update(0);
  return group;
}
