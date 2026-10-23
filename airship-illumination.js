import * as THREE from 'three';

const TAU = Math.PI * 2;

// All coordinates use the same unit hull as district-air and the refined ship:
// half-length .5 on x, unit radius on y/z, with propulsion facing toward -x.
function hullPoint(x, angle) {
  const radius = Math.sqrt(Math.max(0, 1 - (x / .5) ** 2)) * 1.047;
  return [x * 1.008, Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function makeCircuitGeometry() {
  const vertices = [], circuits = [], indices = [];
  let band = 0;
  function ribbon(segments, point, kind) {
    const start = vertices.length / 3;
    for (let step = 0; step <= segments; step++) {
      const progress = step / segments;
      for (const edge of [-1, 1]) {
        vertices.push(...point(progress, edge));
        circuits.push(progress, band, kind);
      }
    }
    for (let step = 0; step < segments; step++) {
      const base = start + step * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    band++;
  }
  // Broad primary meridians remain readable in the default city panorama when an orbit points
  // the nose toward the viewer. They sit on the actual curved hull surface.
  for (const angle of [0, -.70, .70, -1.45, 1.45, -2.02, 2.02, Math.PI]) {
    ribbon(20, (p, edge) => {
      const latitude = (p - .5) * Math.PI * .88;
      return hullPoint(.5 * Math.sin(latitude), angle + edge * (Math.abs(angle) < 1.5 ? .044 : .036));
    }, 0);
  }
  // Separate transverse circuits give the hull several readable light layers,
  // while keeping the original equatorial band as its broad central anchor.
  for (const x of [-.35, -.16, .18, .35]) {
    ribbon(24, (p, edge) => hullPoint(x + edge * .0098, p * TAU), 1);
  }
  // These two continuous surfaces carry a procedural row of small warm portals.
  // There are no per-window boxes and the gaps are discarded in the material.
  for (const side of [-1, 1]) {
    ribbon(20, (p, edge) => hullPoint((p - .5) * .70, side * 2.20 + edge * .075), 2);
    ribbon(20, (p, edge) => {
      const radius = .087 + edge * .017;
      return [-.259, -.73 + Math.cos(p * TAU) * radius, side * .76 + Math.sin(p * TAU) * radius];
    }, 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('aCircuit', new THREE.Float32BufferAttribute(circuits, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function circuitMaterial(uniforms) {
  const material = new THREE.MeshBasicMaterial({color: '#ffffff', side: THREE.DoubleSide, toneMapped: false, fog: false});
  material.name = 'AirshipLayeredCircuitLights';
  material.onBeforeCompile = shader => {
    shader.uniforms.uAirshipLightTime = uniforms.uAirshipLightTime;
    shader.vertexShader = 'attribute vec3 aCircuit;attribute float aShipPhase;varying vec3 vCircuit;varying float vShipPhase,vCircuitDistance;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vCircuit=aCircuit;vShipPhase=aShipPhase;`);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vCircuitDistance=length(mvPosition.xyz);`);
    shader.fragmentShader = 'uniform float uAirshipLightTime;varying vec3 vCircuit;varying float vShipPhase,vCircuitDistance;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float flow=.5+.5*cos(6.28318530718*(vCircuit.x-uAirshipLightTime/26.+vCircuit.y*.113+vShipPhase));
      float level=.72+.28*pow(flow,5.);
      if(vCircuit.z>1.5&&vCircuit.z<2.5){
        float row=vCircuit.x*17.,f=fract(row),aa=min(fwidth(row),.23);
        float aperture=smoothstep(.15-aa,.15+aa,f)*(1.-smoothstep(.72-aa,.72+aa,f));
        if(aperture<.14)discard;
        float office=.83+.17*sin(floor(row)*2.2+vShipPhase*5.+uAirshipLightTime*.08055365778);
        diffuseColor.rgb=vec3(.84,.29,.055)*aperture*office;
      }else if(vCircuit.z>2.5){
        diffuseColor.rgb=vec3(.025,.69,1.)*(.89+.11*sin(uAirshipLightTime*.12083048668+vShipPhase));
      }else{
        // Distinct circuit colors survive the panorama; the port windows below
        // stay a subdued amber. Each ship rotates the dominant palette once.
        float role=0.;
        if(vCircuit.z<.5){
          if(vCircuit.y<.5||vCircuit.y>6.5)role=2.;
          else if(vCircuit.y>4.5)role=1.;
        }else{
          if(vCircuit.y<8.5)role=1.;
          else if(vCircuit.y>10.5)role=2.;
        }
        role=mod(role+floor(vShipPhase/.237+.5),3.);
        vec3 circuit=role<.5?vec3(.006,.72,1.):role<1.5?vec3(.88,.018,.43):vec3(.94,.44,.015);
        diffuseColor.rgb=circuit*level;
      }
      // Emitted light loses energy with distance without washing its hue into
      // the dark scene fog. This also avoids making the distant hull a white cage.
      diffuseColor.rgb*=exp(-max(0.,vCircuitDistance-55.)*.00135);`);
  };
  material.customProgramCacheKey = () => 'airship-layered-circuits-v2';
  return material;
}

function glowGeometry() {
  const positions = [], uvs = [], centres = [], radii = [], facing = [], indices = [];
  const emitters = [
    {site: [-.267, -.73, -.76], radius: .36, direction: -1},
    {site: [-.267, -.73, .76], radius: .36, direction: -1},
    {site: [.513, 0, 0], radius: .17, direction: 1},
  ];
  for (const emitter of emitters) {
    const start = positions.length / 3;
    for (const [x, y] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) {
      positions.push(x, y, 0);uvs.push(x + .5, y + .5);
      centres.push(...emitter.site);radii.push(emitter.radius);facing.push(emitter.direction);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aEmitter', new THREE.Float32BufferAttribute(centres, 3));
  geometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
  geometry.setAttribute('aFacing', new THREE.Float32BufferAttribute(facing, 1));
  geometry.setIndex(indices);
  return geometry;
}

/** Lighting independent of hull LOD. The caller supplies the exact hull matrix. */
export function makeAirshipIllumination({ships = []} = {}) {
  const group = new THREE.Group();group.name = 'AirshipIllumination';
  const uniforms = {uAirshipLightTime: {value: 0}};
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(ships.map((_, index) => index * .237)), 1);
  const tints = new Float32Array(ships.length * 3);
  const glowPalette = ['#1bd9ff', '#f54bba', '#ffc44e'];
  ships.forEach((ship, index) => new THREE.Color(glowPalette[index % glowPalette.length]).toArray(tints, index * 3));
  const tint = new THREE.InstancedBufferAttribute(tints, 3);
  const core = makeCircuitGeometry();core.setAttribute('aShipPhase', phase);
  const halo = new THREE.SphereGeometry(1, 14, 9).scale(.524, 1.055, 1.055);
  halo.setAttribute('aShipTint', tint);
  const flares = glowGeometry();flares.setAttribute('aShipTint', tint);flares.setAttribute('aShipPhase', phase);

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute vec3 aShipTint;varying vec3 vShipTint,vHullNormal,vToEye;
      void main(){
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);
        mat3 basis=mat3(instanceMatrix);
        vec3 correctedNormal=normal/vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2]));
        vHullNormal=normalize(normalMatrix*basis*correctedNormal);vToEye=-mvPosition.xyz;vShipTint=aShipTint;
        gl_Position=projectionMatrix*mvPosition;
      }`,
    fragmentShader: `uniform float uAirshipLightTime;varying vec3 vShipTint,vHullNormal,vToEye;
      void main(){
        float rim=pow(1.-abs(dot(normalize(vHullNormal),normalize(vToEye))),3.2);
        float breath=.96+.04*sin(uAirshipLightTime*.16110731557);
        float haze=exp(-length(vToEye)*.0018);
        gl_FragColor=vec4(vShipTint*.78,rim*.095*breath*haze);
        #include <colorspace_fragment>
      }`,
  });
  haloMaterial.name = 'AirshipSoftHullOutline';
  const flareMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute vec3 aEmitter,aShipTint;attribute float aRadius,aFacing,aShipPhase;varying vec2 vFlareUv;varying vec3 vShipTint;varying float vFacing,vPhase,vDistance;
      void main(){
        vec4 centre=modelViewMatrix*instanceMatrix*vec4(aEmitter,1.);
        vec3 normal=normalize(mat3(modelViewMatrix)*mat3(instanceMatrix)*vec3(aFacing,0.,0.));
        vFacing=.24+.76*max(0.,dot(normal,normalize(-centre.xyz)));
        vFlareUv=uv;vShipTint=aShipTint;vPhase=aShipPhase;vDistance=length(centre.xyz);
        centre.xy+=position.xy*aRadius*length(instanceMatrix[1].xyz)*2.;
        gl_Position=projectionMatrix*centre;
      }`,
    fragmentShader: `uniform float uAirshipLightTime;varying vec2 vFlareUv;varying vec3 vShipTint;varying float vFacing,vPhase,vDistance;
      void main(){
        float radius=length(vFlareUv*2.-1.);float core=exp(-radius*radius*12.);
        float spill=pow(max(0.,1.-radius),2.);float breath=.94+.06*sin(uAirshipLightTime*.16110731557+vPhase*6.);
        float alpha=(core*.33+spill*.34)*vFacing*breath*exp(-vDistance*.0018);
        gl_FragColor=vec4(mix(vShipTint,vec3(.36,.75,1.),.12),alpha);
        #include <colorspace_fragment>
      }`,
  });
  flareMaterial.name = 'AirshipEngineAndNavigationHalos';

  const definitions = [
    ['Airships-LayeredCircuits', core, circuitMaterial(uniforms)],
    ['Airships-SoftHullOutline', halo, haloMaterial],
    ['Airships-EngineHalos', flares, flareMaterial],
  ];
  const meshes = definitions.map(([name, geometry, material]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, ships.length);
    mesh.name = name;mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (name === 'Airships-LayeredCircuits') {
      ships.forEach((ship, index) => mesh.setColorAt(index, ship.accent));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);return mesh;
  });
  group.userData = {
    meshCount: meshes.length, uniforms,
    setMatrixAt(index, matrix) {
      for (const mesh of meshes) mesh.setMatrixAt(index, matrix);
    },
    update(seconds) {
      const time = Number.isFinite(seconds) ? ((seconds % 156) + 156) % 156 : 0;
      uniforms.uAirshipLightTime.value = time;
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    },
  };
  return group;
}
