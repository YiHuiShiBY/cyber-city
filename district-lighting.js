import * as THREE from 'three';
import { getDistrictStyle } from './district-styles.js';

// Soft local light uses two instanced layers, without adding scene-wide point lights.
export function makeDistrictLighting({ buildings, lightSites }) {
  const group = new THREE.Group(); group.name = 'DistrictLocalLight';
  const uniforms = { uTime: { value: 0 } };
  function layer(sites, billboard) {
    const quad = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position')); geometry.setAttribute('uv', quad.getAttribute('uv'));
    geometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(sites.flatMap(s => s.position)), 3));
    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sites.flatMap(s => s.size)), 2));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(sites.flatMap(s => new THREE.Color(s.color).toArray())), 3));
    geometry.instanceCount = sites.length;
    const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      // V-12: the ground pools are flat additive quads lying .028 above the road, so past a few
      // metres they collapse into a bright ellipse with no visible contact patch and read as a ball
      // floating over the street. Fading them by the angle between the view ray and the ground --
      // full when looked at steeply, gone at grazing -- removes the distant blobs and leaves the
      // foreground pools, which are the ones that land on something. The billboard halos keep their
      // constant alpha: they are vertical and are meant to stay legible edge-on.
      vertexShader: `attribute vec3 aSite,aColor;attribute vec2 aSize;varying vec2 vUv;varying vec3 vColor;varying vec3 vViewDir;void main(){vUv=uv;vColor=aColor;vViewDir=cameraPosition-(modelMatrix*vec4(aSite,1.)).xyz;${billboard ? 'vec4 p=modelViewMatrix*vec4(aSite,1.);p.xy+=position.xy*aSize;gl_Position=projectionMatrix*p;' : 'vec3 p=aSite+vec3(position.x*aSize.x,0.,position.y*aSize.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);'}}`,
      fragmentShader: `uniform float uTime;varying vec2 vUv;varying vec3 vColor;varying vec3 vViewDir;void main(){vec2 p=(vUv-.5)*2.;float glow=exp(-dot(p,p)*4.)*(1.-smoothstep(.45,1.,length(p)));${billboard ? 'float alpha=glow*.22;' : 'float ripple=.82+.18*sin(p.y*31.+sin(p.x*13.)+uTime*1.3);float grazing=smoothstep(.06,.38,abs(vViewDir.y)/max(length(vViewDir),.0001));float alpha=glow*ripple*.3*grazing;'}gl_FragColor=vec4(vColor,alpha);
      #include <colorspace_fragment>
      }`,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = billboard ? 'DistrictSignHalos' : 'DistrictPavementPools';
    mesh.frustumCulled = false; mesh.renderOrder = 3; group.add(mesh);
    return mesh;
  }
  const pools = [];
  for (const site of lightSites) {
    const style = getDistrictStyle(site.sector), side = Math.sign(site.x - style.cx);
    pools.push({ position: [style.cx + side * 4.3, .028, site.z], size: [3.0, site.height * 1.35], color: site.color });
    pools.push({ position: [style.cx + side * 5.60, .137, site.z], size: [1.6, site.height * 1.2], color: site.color });
  }
  // 2026-09-15 evening: the two pools above are derived from the avenue storefront sites, so
  // every pavement pool in the city sat on an avenue line -- the street-level census found the
  // cross streets carrying none of their own. The cross-street shopfronts get the mirrored pair.
  //
  // The offsets are not reused verbatim. Measured facades (_phase2/_geo-canyon.cjs): the cross
  // street is 4.11-4.20 out, the avenue 6.22-6.38, so the avenue pair sits 1.92 and 0.62
  // *inboard of its facade*; the raw 4.3 / 5.6 would land inside a mass on a canyon only 4.12
  // wide. Same clearances, measured facades, transposed axes -- the quad is 3.0 across the
  // street and depth-scaled along it, so the long axis runs with the street it lights.
  const CROSS_STREETS = [-48, -24, 0, 24, 48], CROSS_CLEARANCE = [1.92, .62];
  const crossPools = [];
  for (const building of buildings) {
    const bounds = building.actualBounds;
    if (!bounds) continue;
    for (const face of [bounds.min[2], bounds.max[2]]) {
      const street = CROSS_STREETS.find(value => Math.abs(face - value) < 6.2);
      if (street === undefined) continue;
      const side = Math.sign(face - street) || 1;
      // The viaduct crosses the z = 24 corridor, so its band stays off limits, as for the pylons.
      if (side > 0 && Math.abs(street - 24) < 4) continue;
      const style = getDistrictStyle(building.sector);
      if (!style) continue;
      const reach = Math.min(3.6, building.depth);
      CROSS_CLEARANCE.forEach((clearance, index) => {
        crossPools.push({
          position: [building.x, index ? .137 : .028, face - side * clearance],
          size: index ? [reach * 1.2, 1.6] : [reach * 1.35, 3.0],
          color: style.primary,
        });
      });
    }
  }
  pools.push(...crossPools);
  const halos = buildings.filter(b => b.anchor).map(b => ({ position: [b.x, b.height * .71, b.z + b.depth / 2 + .05], size: [b.width * 1.6, 6], color: new THREE.Color(getDistrictStyle(b.sector).primary).multiplyScalar(1.3) }));
  const pavement = layer(pools, false), signs = layer(halos, true);
  group.userData = { uniforms, pavement, signs, poolCount: pools.length, crossPoolCount: crossPools.length, haloCount: halos.length,
    // Published so the census and the QA can read where the pools actually are instead of
    // re-deriving them from the offsets, which is how the avenue-only layout stayed invisible.
    poolPoints: pools.map(pool => [pool.position[0], pool.position[2]]),
    update(seconds) { uniforms.uTime.value = Number.isFinite(seconds) ? seconds : 0; } };
  return group;
}
