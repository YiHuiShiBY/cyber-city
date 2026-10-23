// Procedural triplanar surface detail (V-2).
//
// Every flat surface in the district is one MeshStandardMaterial with no maps, so the walls read
// as untextured planes once the camera gets close. This injects two octaves of value noise,
// projected on the world axes of the surface normal, into roughness and -- more subtly -- into
// albedo. Nothing is uploaded: no texture, no geometry, and no extra draw call.
//
// The whole point of `customProgramCacheKey` below is that the injected source is byte-identical
// for every material, so shell / detail / glass / mass / roof / the block's four metals all share
// ONE compiled program and differ only in the two uniform values, which three uploads per material
// switch. Returning anything material-dependent here would multiply the program count instead.
//
// Deliberately NOT applied to the wet-reflection clones in index.html: those overwrite
// `onBeforeCompile` with the ripple hook, and the rippled mirror is already attenuated to .62 by
// the time it reaches the camera.

const DETAIL_PARS = `
varying vec3 vDetailWorld;
varying vec3 vDetailNormal;
float detailHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float detailNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(detailHash(i),detailHash(i+vec2(1.,0.)),f.x),mix(detailHash(i+vec2(0.,1.)),detailHash(i+vec2(1.,1.)),f.x),f.y);}
// Pick the axis pair the normal is least aligned with, so a wall is never projected along itself.
vec2 detailProject(vec3 world,vec3 surfaceNormal){vec3 a=abs(surfaceNormal);
 if(a.y>=a.x&&a.y>=a.z)return world.xz;
 if(a.x>=a.z)return world.zy;
 return world.xy;}
`;

const DETAIL_BEGIN_VERTEX = `#include <begin_vertex>
 vec4 detailPoint=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 detailPoint=instanceMatrix*detailPoint;
 #endif
 vDetailWorld=(modelMatrix*detailPoint).xyz;
 vDetailNormal=normalize(mat3(modelMatrix)*objectNormal);
 `;

const DETAIL_MAP = `#include <map_fragment>
 vec2 detailUv=detailProject(vDetailWorld,vDetailNormal)*uDetailScale;
 float detailCoarse=detailNoise(detailUv);
 float detailFine=detailNoise(detailUv*5.3+7.1);
 diffuseColor.rgb*=.94+.12*detailCoarse;
 `;

const DETAIL_ROUGHNESS = `#include <roughnessmap_fragment>
 roughnessFactor=clamp(roughnessFactor+(detailCoarse*.68+detailFine*.32-.5)*.34*uDetailStrength,.05,1.);
 `;

/**
 * @param {THREE.Material} material  any standard/physical material
 * @param {{scale?: number, strength?: number}} options  noise density and perturbation amount
 */
export function applySurfaceDetail(material, { scale = .22, strength = 1 } = {}) {
  const uDetailScale = { value: scale }, uDetailStrength = { value: strength };
  material.onBeforeCompile = shader => {
    shader.uniforms.uDetailScale = uDetailScale;
    shader.uniforms.uDetailStrength = uDetailStrength;
    shader.vertexShader = 'varying vec3 vDetailWorld;\nvarying vec3 vDetailNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', DETAIL_BEGIN_VERTEX);
    shader.fragmentShader = 'uniform float uDetailScale;\nuniform float uDetailStrength;\n' + DETAIL_PARS + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', DETAIL_MAP);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', DETAIL_ROUGHNESS);
  };
  material.customProgramCacheKey = () => 'surface-detail-v1';
  material.userData.surfaceDetail = { uDetailScale, uDetailStrength };
  return material;
}
