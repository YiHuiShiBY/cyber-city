import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vertexShader, fragmentShader, projectionAperture } from './district-hologram-art.js';

function seeded(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Hovering holographic billboards with their rooftop projectors.
 *
 * Every panel is one instance of a single unit quad, so the whole district's projection
 * network is one draw call, and the artwork is generated in the fragment shader and animated
 * from absolute seconds (panel, projection beam and projector all freeze together when the
 * scene clock pauses).
 *
 * 2026-09-15 evening: the panels used to be one artwork at one aspect, which read as the same
 * screen projected twenty times. Each panel now carries a `kind` (artwork) and a `form`
 * (silhouette) as instanced attributes and the shader branches on them:
 *
 *   kind 0  data screen    frame + scanlines + rolling bars + glyph grid
 *   kind 1  radar globe    concentric rings, a rotating sweep arm and a reticle
 *   kind 2  equaliser      beat-driven bars over a baseline
 *   kind 3  status board   rows of cells, a headline band and a travelling highlight
 *   kind 4  interference   standing waves with noise bursts
 *
 *   form 0  rectangle      landscape screen, or a wide ticker strip
 *   form 1  disc           round projection
 *   form 2  three-tile     portrait banner split by two seams
 *
 * Variety costs nothing: it is the same quad, the same draw call and the same instanced
 * buffer, and the presets are picked by rotation so no two panels in one sector repeat.
 */
export function makeDistrictHolograms({ seed = 2049, buildings = [], sectors = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'DistrictHolograms';
  const rng = seeded(Number(seed) + 9127);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const housings = [], projectors = [];
  const panels = [];
  const palette = ['#7de9ff', '#ff86dd', '#ffc98a', '#9dffc4'];
  // Each preset fixes the artwork, the silhouette and the aspect, so a panel cannot end up with
  // a radar pattern stretched over a ticker strip.
  const PRESETS = [
    { kind: 0, form: 0, width: [7.4, 11.6], height: [4.4, 6.6] },
    { kind: 1, form: 1, width: [6.6, 9.2], height: [6.6, 9.2] },
    { kind: 2, form: 0, width: [13.0, 16.0], height: [2.2, 3.0] },
    { kind: 3, form: 0, width: [7.0, 10.0], height: [4.6, 6.0] },
    { kind: 4, form: 0, width: [11.0, 14.0], height: [3.0, 4.0] },
    { kind: 3, form: 2, width: [4.6, 6.2], height: [8.4, 10.4] },
  ];
  const span = (range) => range[0] + rng() * (range[1] - range[0]);
  function housingPart(geometry, roof, color, lens = false) {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = new Float32Array(positions.count * 3);
    const base = new THREE.Color('#49616d'), cap = new THREE.Color('#9eb8c0'), dark = new THREE.Color('#293d49');
    const emitter = color.clone().lerp(new THREE.Color('#e6f5f3'), .60);
    for (let index = 0; index < positions.count; index++) {
      const tint = lens ? (positions.getY(index) > roof + 1.16 ? emitter : dark)
        : normals.getY(index) > .5 ? cap : base;
      colors.set([tint.r, tint.g, tint.b], index * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    housings.push(geometry);
  }
  const bySector = new Map();
  for (const building of buildings) {
    if (!bySector.has(building.sector)) bySector.set(building.sector, []);
    bySector.get(building.sector).push(building);
  }
  sectors.forEach((sector, sectorIndex) => {
    const list = bySector.get(sector.id) || [];
    if (!list.length) return;
    const count = sector.maxHeight >= 18 ? 4 : 3;
    for (let index = 0; index < count; index++) {
      const preset = PRESETS[(sectorIndex * 3 + index) % PRESETS.length];
      const side = index % 3 === 0 ? -1 : index % 3 === 1 ? 1 : -1;
      const host = [...list].sort((a, b) => b.height - a.height)[0];
      const width = span(preset.width), height = span(preset.height);
      const x = sector.cx + side * (5.2 + rng() * 2.6);
      const z = sector.cz + (rng() - .5) * 5;
      // Sized first, then floated: the lowest edge of any panel, portrait banners included,
      // stays above 11.6 so the "holograms hover clear of head height" gate keeps holding.
      const y = 11.6 + height / 2 + rng() * 7.2;
      const color = new THREE.Color(palette[panels.length % palette.length]);
      // The projector stands on the nearest roof edge and points at the panel.
      const roof = .15 + host.height;
      const housingX = host.x - Math.sign(host.x - sector.cx) * (host.width / 2 - .35);
      const housingZ = host.z + (rng() - .5) * host.depth * .4;
      housingPart(unit.clone().scale(.62, .40, .62).translate(housingX, roof + .22, housingZ).toNonIndexed(), roof, color);
      housingPart(unit.clone().scale(.20, .80, .20).translate(housingX, roof + .82, housingZ).toNonIndexed(), roof, color, true);
      projectors.push({ x: housingX, y: roof + 1.2, z: housingZ });
      panels.push({
        sector: sector.id, x, y, z, width, height, kind: preset.kind, form: preset.form,
        phase: rng() * Math.PI * 2, drift: .05 + rng() * .05, bob: .10 + rng() * .12, color,
      });
    }
  });

  const quad = new THREE.PlaneGeometry(1, 1);
  const panelGeometry = new THREE.InstancedBufferGeometry();
  panelGeometry.index = quad.index;
  panelGeometry.setAttribute('position', quad.getAttribute('position'));
  panelGeometry.setAttribute('uv', quad.getAttribute('uv'));
  const slots = Math.max(1, panels.length);
  panelGeometry.setAttribute('aSite', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  panelGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3));
  panelGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2));
  panelGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(slots), 1));
  panelGeometry.setAttribute('aYaw', new THREE.InstancedBufferAttribute(new Float32Array(slots), 1));
  panelGeometry.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(slots), 1));
  panelGeometry.setAttribute('aForm', new THREE.InstancedBufferAttribute(new Float32Array(slots), 1));
  panelGeometry.instanceCount = slots;
  const panelMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader, fragmentShader,
  });
  const mesh = new THREE.Mesh(panelGeometry, panelMaterial);
  mesh.name = 'DistrictHolograms-Panels';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  group.add(mesh);
  const sites = panelGeometry.getAttribute('aSite'), colors = panelGeometry.getAttribute('aColor');
  const sizes = panelGeometry.getAttribute('aSize'), seeds = panelGeometry.getAttribute('aSeed');
  const yaws = panelGeometry.getAttribute('aYaw'), kinds = panelGeometry.getAttribute('aKind');
  const forms = panelGeometry.getAttribute('aForm');
  panels.forEach((panel, index) => {
    sites.setXYZ(index, panel.x, panel.y, panel.z);
    colors.setXYZ(index, panel.color.r, panel.color.g, panel.color.b);
    sizes.setXY(index, panel.width, panel.height);
    seeds.setX(index, panel.phase);
    kinds.setX(index, panel.kind);
    forms.setX(index, panel.form);
    yaws.setX(index, panel.yaw = 0);
  });
  sites.needsUpdate = colors.needsUpdate = sizes.needsUpdate = seeds.needsUpdate = true;
  kinds.needsUpdate = forms.needsUpdate = true;

  // Six strips retain the former beam's twelve triangles. Shared screen
  // attributes keep the receiving edge attached throughout its bob and yaw.
  const beamGeometry = new THREE.InstancedBufferGeometry();
  const beamPositions = [], beamIndices = [];
  for (let row = 0; row <= 6; row++) beamPositions.push(-1, row / 6, 0, 1, row / 6, 0);
  for (let row = 0; row < 6; row++) {
    const left = row * 2;
    beamIndices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
  }
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(beamPositions, 3));
  beamGeometry.setIndex(beamIndices); beamGeometry.instanceCount = panels.length;
  beamGeometry.setAttribute('aSite', sites); beamGeometry.setAttribute('aYaw', yaws);
  beamGeometry.setAttribute('aSize', sizes); beamGeometry.setAttribute('aColor', colors);
  const origins = new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3);
  const apertures = new THREE.InstancedBufferAttribute(new Float32Array(slots * 2), 2);
  panels.forEach((panel, index) => {
    const origin = projectors[index], aperture = projectionAperture(panel.width, panel.height, panel.form);
    origins.setXYZ(index, origin.x, origin.y, origin.z);
    apertures.setXY(index, aperture.halfWidth, aperture.bottom);
  });
  beamGeometry.setAttribute('aOrigin', origins); beamGeometry.setAttribute('aAperture', apertures);
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uIntensity: { value: .085 } },
    vertexShader: `attribute vec3 aOrigin,aSite,aColor;attribute vec2 aAperture;attribute float aYaw;
      varying vec2 vBeam;varying vec3 vColor;
      void main(){
        float t=position.y;vec3 axis=vec3(cos(aYaw),0.,-sin(aYaw));
        vec3 origin=aOrigin+axis*position.x*.035;
        vec3 target=aSite+axis*position.x*aAperture.x+vec3(0.,aAperture.y,0.);
        vec3 world=mix(origin,target,t);vBeam=position.xy;vColor=aColor;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
      }`,
    fragmentShader: `uniform float uIntensity;varying vec2 vBeam;varying vec3 vColor;
      void main(){
        float lateral=pow(max(0.,1.-vBeam.x*vBeam.x),1.8);
        float start=smoothstep(0.,.035,vBeam.y);
        float end=1.-smoothstep(.78,1.,vBeam.y);
        float alpha=uIntensity*lateral*start*end*mix(1.,.35,vBeam.y);
        if(alpha<.001)discard;
        gl_FragColor=vec4(mix(vColor,vec3(.40,.76,.91),.23),alpha);
        #include <colorspace_fragment>
      }`,
  });

  function finish(list, material, name) {
    if (!list.length) return null;
    const merged = new THREE.Mesh(mergeGeometries(list), material);
    merged.name = name;
    group.add(merged);
    return merged;
  }
  const projectorMesh = finish(housings, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true,
    metalness: .68, roughness: .31, emissive: '#142832', emissiveIntensity: .12 }), 'DistrictHolograms-Projectors');
  const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
  beamMesh.name = 'DistrictHolograms-ProjectionBeams'; beamMesh.frustumCulled = false;
  beamMesh.renderOrder = 3; if (panels.length) group.add(beamMesh);

  function sampleProjection(index, seconds = panelMaterial.uniforms.uTime.value) {
    const panel = panels[index], origin = projectors[index]; if (!panel || !origin) return null;
    const time = Number.isFinite(seconds) ? seconds : 0;
    const yaw = Math.sin(time * panel.drift * 6 + panel.phase) * .10;
    const y = panel.y + Math.sin(time * .42 + panel.phase) * panel.bob;
    const aperture = projectionAperture(panel.width, panel.height, panel.form);
    const dx = Math.cos(yaw) * aperture.halfWidth, dz = -Math.sin(yaw) * aperture.halfWidth;
    return { origin: [origin.x, origin.y, origin.z], center: [panel.x, y + aperture.bottom, panel.z],
      left: [panel.x - dx, y + aperture.bottom, panel.z - dz],
      right: [panel.x + dx, y + aperture.bottom, panel.z + dz], yaw, aperture };
  }

  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    panels.forEach((panel, index) => {
      // A slow yaw sway plus a shallow bob keeps the screens feeling projected.
      sites.setY(index, panel.y + Math.sin(time * .42 + panel.phase) * panel.bob);
      yaws.setX(index, Math.sin(time * panel.drift * 6 + panel.phase) * .10);
    });
    sites.needsUpdate = true;
    yaws.needsUpdate = true;
    panelMaterial.uniforms.uTime.value = time;
  }
  update(0);
  const panelKinds = panels.reduce((counts, panel) => {
    counts[panel.kind] = (counts[panel.kind] || 0) + 1;
    return counts;
  }, {});
  const panelForms = panels.reduce((counts, panel) => {
    counts[panel.form] = (counts[panel.form] || 0) + 1;
    return counts;
  }, {});
  group.userData = { seed, panels, panelCount: panels.length, panelKinds, panelForms, mesh, panelMaterial,
    projectors, projectorMesh, beamMesh, beamGeometry, beamMaterial, sampleProjection, update };
  return group;
}
