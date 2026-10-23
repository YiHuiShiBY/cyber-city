// Analytic wall-washer irradiance on existing opaque, instanced unit-box masses.
// Coordinates stay in each mass's local frame, including mirrored architecture.
// No light objects, overlay planes, extra geometry, or animation clock are needed.
const VARYINGS = `
varying vec3 vFacadeWashPosition;
varying vec3 vFacadeWashNormal;
varying vec3 vFacadeWashSize;
varying float vFacadeWashSeed;
`;

const VERTEX = `#include <begin_vertex>
  vFacadeWashPosition=transformed;
  vFacadeWashNormal=normal;
  #ifdef USE_INSTANCING
    vFacadeWashSize=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
    vec2 washSite=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xz;
    float washXFace=step(.5,abs(normal.x));
    float washSide=mix(normal.z,normal.x,washXFace);
    // Hash once per face vertex. Hashing interpolated world coordinates in the
    // fragment stage would amplify tiny camera-dependent rounding into noise.
    vFacadeWashSeed=fract(sin(dot(washSite+vec2(washXFace*7.1,washSide*3.7),vec2(17.137,53.731)))*17331.57);
  #else
    // Shared legacy materials also shade loose pipes and merged decorations.
    // They have no unit-box instance frame and must not inherit facade lighting.
    vFacadeWashSize=vec3(0.);
    vFacadeWashSeed=0.;
  #endif
`;

const FRAGMENT = `
uniform float uFacadeWashIntensity;
uniform float uFacadeWashReach;
uniform float uFacadeWashMinHeight;
uniform float uFacadeWashMinSpan;

vec3 facadeWashIrradiance(){
  float facade=1.-step(.5,abs(vFacadeWashNormal.y));
  float eligible=step(uFacadeWashMinHeight,vFacadeWashSize.y)*step(uFacadeWashMinSpan,min(vFacadeWashSize.x,vFacadeWashSize.z));
  if(facade*eligible<.5||uFacadeWashIntensity<=0.)return vec3(0.);

  float xFace=step(.5,abs(vFacadeWashNormal.x));
  float span=mix(vFacadeWashSize.x,vFacadeWashSize.z,xFace);
  float along=mix(vFacadeWashPosition.x*vFacadeWashSize.x,vFacadeWashPosition.z*vFacadeWashSize.z,xFace);
  float height=(vFacadeWashPosition.y+.5)*vFacadeWashSize.y;
  float rise=height-.45;
  float upward=max(rise,0.);
  float footprint=max(fwidth(along),fwidth(height));
  float spread=max(.50+upward*.40,footprint*.8);
  float setback=clamp(span*.12,.65,1.3);
  float reach=clamp(vFacadeWashSize.y*uFacadeWashReach,5.,34.);
  float seed=vFacadeWashSeed;
  float riseMask=smoothstep(-.08,.65,rise);
  float distanceFalloff=1./(1.+pow(upward/reach,2.));
  // Keep the pools on their own wall; they soften before its corner or reveal.
  float edge=1.-smoothstep(span*.455,span*.505,abs(along));
  vec3 irradiance=vec3(0.);
  for(int lamp=0;lamp<2;lamp++){
    float lampSide=float(lamp)*2.-1.;
    float offset=along-lampSide*span*.235;
    float distanceToLamp=sqrt(offset*offset+rise*rise+setback*setback);
    // A wall-washer's asymmetric throw sends more energy up the facade than
    // a bare point source, while the lower wall remains its brightest region.
    float incidence=sqrt(setback/max(distanceToLamp,.001));
    float cone=exp(-1.45*pow(offset/spread,2.));
    float warm=step(.5,fract(seed+float(lamp)*.5));
    vec3 tint=mix(vec3(.32,.62,1.),vec3(1.,.57,.28),warm);
    irradiance+=tint*cone*incidence*distanceFalloff*riseMask*edge;
  }
  return irradiance*uFacadeWashIntensity*(.86+.22*seed);
}
`;

/** Also used by reflection hooks, which deliberately replace onBeforeCompile. */
export function injectFacadeWallWash(shader, settings) {
  if (!settings || !shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
  if (shader.vertexShader.includes('vFacadeWashPosition')) return;
  shader.uniforms.uFacadeWashIntensity = settings.intensity;
  shader.uniforms.uFacadeWashReach = settings.reach;
  shader.uniforms.uFacadeWashMinHeight = settings.minHeight;
  shader.uniforms.uFacadeWashMinSpan = settings.minSpan;
  shader.vertexShader = VARYINGS + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', VERTEX);
  shader.fragmentShader = VARYINGS + FRAGMENT + shader.fragmentShader;
  // Use the surface's real diffuse response (including paint, texture and
  // metalness), before AO, tone mapping and fog. The wall itself is not emissive.
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    reflectedLight.directDiffuse+=facadeWashIrradiance()*BRDF_Lambert(material.diffuseColor);`);
}

/** Settings remain JSON-safe when Three clones a material for its wet mirror. */
export function applyFacadeWallWash(material, {
  intensity = 32, reach = .82, minHeight = 3.5, minSpan = 1.9, source = 'district',
} = {}) {
  const settings = {
    source, intensity: { value: intensity }, reach: { value: reach },
    minHeight: { value: minHeight }, minSpan: { value: minSpan },
  };
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.userData.facadeWallWash = settings;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    injectFacadeWallWash(shader, settings);
  };
  material.customProgramCacheKey = () => `${previousKey}|facade-wall-wash-v1`;
  return material;
}
