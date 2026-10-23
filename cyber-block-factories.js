// 老街（Neon Crossing legacy street）资产工厂。
//
// 2026-09-28 由 index.html 的 ASSET_FACTORIES 块原样抽成独立 ES 模块。
// 抽出来的原因：块内引用了 sampleWalkingGait / makeDetailedFlyer / installDetailModel
// 三个定义在块外（index.html L15–L17）的符号，"切出来单独 import 即可使用"的复用契约
// 实际是失效的。成为真模块后这些依赖变成合法 import，契约自然成立。
// 详见 _audit/gates/KNOWN-ISSUES.md 的 KI-1。
//
// 纯工厂，不接触渲染器、动画循环、UI 与页面状态 —— 这是它一直以来的设计约束，
// 由 _audit/gates/check-boundary.cjs 的 R1.b 持续守卫。
// 下方 900 余行工厂代码自原块逐字节迁移，未作任何修改。
import * as THREE from 'three';
import { sampleWalkingGait } from './pedestrian-gait.js';
import { makeDetailedFlyer } from './transport-model-details.js';
import { prepareLegacyFlyerLow } from './aircraft-lighting.js';
import { installDetailModel } from './city-detail-geometry.js';
import { DISTANT_GROUND_GLSL, DISTRICT_ASPHALT_GLSL } from './city-ground-footprint.js';
import { applyFacadeWallWash, injectFacadeWallWash } from './facade-wall-wash.js';

function seeded(seed){let a=Number(seed)>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function box(parent,w,h,d,x,y,z,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m}
function neon(color){return new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.55,toneMapped:false})}
function pipe(parent,points,r,material){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*4),r,6,false),material);parent.add(mesh);return mesh}
function labelTexture(text,color,vertical=false){const c=document.createElement('canvas');c.width=vertical?256:text.length===1?256:768;c.height=vertical?1024:text.length===1?256:192;const ctx=c.getContext('2d');ctx.fillStyle='#071426';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(10,10,c.width-20,c.height-20);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.textAlign='center';ctx.textBaseline='middle';if(vertical){ctx.font='bold 144px "Microsoft YaHei",sans-serif';Array.from(text).forEach((s,i)=>ctx.fillText(s,128,150+i*207));ctx.font='24px monospace';ctx.fillText('24 H / OPEN',128,940)}else{ctx.font=(text.length===1?'bold 144px':'bold 94px')+' "Microsoft YaHei",sans-serif';ctx.fillText(text,c.width/2,text.length===1?116:92);ctx.font='19px monospace';ctx.fillText(text.length===1?'24 / OPEN':'NIGHT MARKET  /  九龍',c.width/2,text.length===1?227:163)}ctx.shadowBlur=0;ctx.fillStyle='#00000026';for(let y=0;y<c.height;y+=6)ctx.fillRect(0,y,c.width,2);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapT=THREE.RepeatWrapping;return tex}
function haloTexture(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,0.48)');g.addColorStop(.22,'rgba(255,255,255,0.15)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)}
// Procedural triplanar surface detail (V-2). The same noise and the same least-aligned-axis
// projection as cyber-city/surface-detail.js, inlined here because the factory block boundary in
// this file forbids any import other than THREE (see _phase2/check-12.cjs: it slices the block out
// between its two marker comments and runs it in a Blob). Do not write those two marker strings
// literally in this region -- the slicer splits on the first occurrence and would cut the block
// short. The injected source is identical for every material and the cache key is constant, so the
// four metals below share ONE compiled program and differ only in the two uniform values.
function applySurfaceDetail(material,scale=.22,strength=1){
 const uDetailScale={value:scale},uDetailStrength={value:strength};
 material.onBeforeCompile=shader=>{
  shader.uniforms.uDetailScale=uDetailScale;shader.uniforms.uDetailStrength=uDetailStrength;
  shader.vertexShader='varying vec3 vDetailWorld;varying vec3 vDetailNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec4 detailPoint=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 detailPoint=instanceMatrix*detailPoint;
 #endif
 vDetailWorld=(modelMatrix*detailPoint).xyz;
 vDetailNormal=normalize(mat3(modelMatrix)*objectNormal);`);
  shader.fragmentShader='uniform float uDetailScale;uniform float uDetailStrength;\nvarying vec3 vDetailWorld;varying vec3 vDetailNormal;\nfloat detailHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat detailNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(detailHash(i),detailHash(i+vec2(1.,0.)),f.x),mix(detailHash(i+vec2(0.,1.)),detailHash(i+vec2(1.,1.)),f.x),f.y);}\nvec2 detailProject(vec3 pos,vec3 nrm){vec3 a=abs(nrm);if(a.y>=a.x&&a.y>=a.z)return pos.xz;if(a.x>=a.z)return pos.zy;return pos.xy;}\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 vec2 detailUv=detailProject(vDetailWorld,vDetailNormal)*uDetailScale;
 float detailCoarse=detailNoise(detailUv);
 float detailFine=detailNoise(detailUv*5.3+7.1);
 diffuseColor.rgb*=.94+.12*detailCoarse;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
 roughnessFactor=clamp(roughnessFactor+(detailCoarse*.68+detailFine*.32-.5)*.34*uDetailStrength,.05,1.);`);
 };
 material.customProgramCacheKey=()=>'surface-detail-v1';
 material.userData.surfaceDetail={uDetailScale,uDetailStrength};
 return material;
}
// Shared boxes are instanced before reflection to keep the detailed city affordable.
function batchBoxes(root) {
 const buckets=new Map();root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert();
 root.traverse(o=>{
  if(!o.isMesh||o.isInstancedMesh||o.geometry.type!=='BoxGeometry'||Array.isArray(o.material))return;
  if(!buckets.has(o.material))buckets.set(o.material,[]);
  buckets.get(o.material).push(o);
 });
 const unit=new THREE.BoxGeometry(1,1,1);
 for(const [material,items] of buckets){
  if(items.length<3)continue;
  const batch=new THREE.InstancedMesh(unit,material,items.length);batch.name='BatchedDetails';
  items.forEach((o,i)=>{const p=o.geometry.parameters,m=inverse.clone().multiply(o.matrixWorld);m.scale(new THREE.Vector3(p.width,p.height,p.depth));batch.setMatrixAt(i,m);o.removeFromParent();o.geometry.dispose();});
  batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();root.add(batch);
 }
}
// Second pass: fold the loose meshes that batchBoxes() cannot instance into one merged
// mesh per material. batchBoxes() only takes BoxGeometry, so every tube, pipe, cylinder,
// ring and awning used to survive as its own draw call; this collapses them without
// touching the material list, so the look is unchanged. Objects whose material is animated
// per-object (roof beacons) or that must keep their own blend order (transparent and
// depthWrite:false surfaces) opt out, because merging would reorder or alias them.
// The concatenation is hand-rolled rather than delegated to mergeGeometries() from the
// addons, because everything between ASSET_FACTORIES_START and ASSET_FACTORIES_END has to
// stay importable with nothing but THREE (see check-12.cjs). Only position/normal/uv are
// carried over, which is all makeCyberBlock() ever emits.
function batchDetails(root){
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),byMaterial=new Map();
 root.traverse(o=>{
  if(!o.isMesh||o.isInstancedMesh||o.isSprite||Array.isArray(o.material))return;
  const g=o.geometry;if(!g||!g.attributes||!g.attributes.position)return;
  if(o.userData.keepSeparate)return;
  if(o.material.transparent||o.material.depthWrite===false)return;
  const signature=Object.keys(g.attributes).sort().join(',');
  if(!byMaterial.has(o.material))byMaterial.set(o.material,new Map());
  const bySignature=byMaterial.get(o.material);
  if(!bySignature.has(signature))bySignature.set(signature,[]);
  bySignature.get(signature).push(o);
 });
 let removed=0,merged=0;
 for(const [,bySignature] of byMaterial)for(const items of bySignature.values()){
  if(items.length<2)continue;
  const pieces=[];let vertices=0;
  for(const o of items){
   // Non-indexed, in root space, with a zeroed normal/uv when absent: that puts every
   // piece on the same footing, which is what lets the arrays below be concatenated.
   const source=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
   const count=source.getAttribute('position').count;
   if(!source.getAttribute('normal'))source.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(count*3),3));
   if(!source.getAttribute('uv'))source.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
   for(const name of Object.keys(source.attributes))if(name!=='position'&&name!=='normal'&&name!=='uv')source.deleteAttribute(name);
   source.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
   pieces.push(source);vertices+=count;
  }
  const position=new Float32Array(vertices*3),normal=new Float32Array(vertices*3),uv=new Float32Array(vertices*2);
  let vertex=0;
  for(const piece of pieces){
   const count=piece.getAttribute('position').count;
   position.set(piece.getAttribute('position').array,vertex*3);
   normal.set(piece.getAttribute('normal').array,vertex*3);
   uv.set(piece.getAttribute('uv').array,vertex*2);
   vertex+=count;
  }
  pieces.forEach(piece=>piece.dispose());
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,items[0].material);mesh.name='MergedDetails';root.add(mesh);
  items.forEach(o=>o.removeFromParent());
  removed+=items.length-1;merged++;
 }
 return {merged,removed};
}

function makeWetSurface() {
 const uniforms={uTime:{value:0},uWet:{value:1},uDistrict:{value:0},uFog:{value:new THREE.Color('#101c2b')},
  uDistrictPrimary:{value:Array.from({length:9},()=>new THREE.Color('#43e7ed'))},
  uDistrictSecondary:{value:Array.from({length:9},()=>new THREE.Color('#fb48b2'))}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
 vertexShader:`varying vec3 vWorld;void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
 fragmentShader:`
  uniform float uTime,uWet,uDistrict;uniform vec3 uFog;varying vec3 vWorld;
  uniform vec3 uDistrictPrimary[9],uDistrictSecondary[9];
  ${DISTANT_GROUND_GLSL}
  ${DISTRICT_ASPHALT_GLSL}
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  void main(){
   vec2 p=vWorld.xz;
   // Opaque distant ground and street slabs own their footprints; avoid
   // near-coplanar depth competition. Standalone blocks keep the full wet surface.
   if(uDistrict>.5&&(isDistantCityGround(p)||isDistrictAsphaltGround(p)))discard;
   float patches=noise(p*.36)*.65+noise(p*1.17)*.35;
   // Two extra octaves at 32 and 76 world units. Their periods are deliberately incommensurate
   // with the 42 x 48 tile below, so the wet surface stops reading as wallpaper beyond the
   // district -- a tile-indexed offset (the obvious alternative) would step at every tile edge
   // and drop a hard line across the avenue, because a per-tile constant cannot be continuous.
   patches+=(noise(p*.031)*.6+noise(p*.0131)*.4)*.20;
   float puddle=smoothstep(.31,.68,patches);
   float detail=1.-smoothstep(.06,.24,length(fwidth(p)));
   float grain=mix(.5,noise(p*24.),detail);
   float wave=sin(p.y*22.+sin(p.x*5.+uTime)*1.8+uTime*1.8)*.5+.5;
   float waterline=pow(wave,18.)*.009*puddle*detail;
   vec3 asphalt=vec3(.011,.017,.027)*(0.92+grain*.16);
   vec2 street=mix(p,mod(p+vec2(21.,24.),vec2(42.,48.))-vec2(21.,24.),uDistrict);
   float left=exp(-pow((street.x+4.8)*.6,2.));
   float right=exp(-pow((street.x-4.8)*.6,2.));
   // Nine whole cycles across the 48-unit tile (2*pi*9/48 = 1.1781 rad/unit). The old 1.19 gave
   // 9.09 cycles, so the reflection stripes stepped by a fifth of a cycle at every tile seam --
   // that mismatch is V-7.
   float signPattern=.28+.72*pow(.5+.5*sin(street.y*(6.28318531*9./48.)+.8),4.);
   vec3 spill=left*vec3(.007,.052,.058)+right*vec3(.07,.007,.04);
   vec2 grid=clamp((p+vec2(42.,48.))/vec2(42.,48.),0.,2.);
   grid=floor(grid)+smoothstep(.30,.70,fract(grid));
   vec3 primary=vec3(0.),secondary=vec3(0.);
   for(int row=0;row<3;row++)for(int col=0;col<3;col++){
    float weight=max(0.,1.-abs(grid.x-float(col)))*max(0.,1.-abs(grid.y-float(row)));
    primary+=uDistrictPrimary[row*3+col]*weight;secondary+=uDistrictSecondary[row*3+col]*weight;
   }
   float themeMix=uDistrict*smoothstep(13.,23.,max(abs(p.x),abs(p.y)*.65));
   spill=mix(spill,left*primary*.13+right*secondary*.095,themeMix);
   spill*=signPattern;
   float lateral=exp(-pow(street.y*.2,2.));
   spill+=lateral*vec3(.02,.033,.046);
   spill*=mix(1.,(1.-smoothstep(56.,78.,abs(p.x)))*(1.-smoothstep(68.,90.,abs(p.y))),uDistrict);
   vec3 color=asphalt+spill*(.32+patches*.75)+waterline*vec3(.28,.46,.58)*uWet;
   float distanceFade=smoothstep(mix(25.,112.,uDistrict),mix(90.,235.,uDistrict),length(p));
   float alpha=mix(.92,.4,puddle)*mix(1.,.96,uWet);
   float districtMask=1.-smoothstep(mix(17.,90.,uDistrict),mix(28.,114.,uDistrict),length(p*vec2(1.,.65)));
   gl_FragColor=vec4(color,mix(1.,alpha,districtMask*(1.-distanceFade)));
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   vec3 horizonColor=vec3(.082,.134,.198)+mix(vec3(.052,.096,.118),vec3(.10,.052,.092),smoothstep(-1.,1.,normalize(vWorld-cameraPosition).x*1.35));
   // 远处地面混向"接近熄灭"的暗目标：湿地表在全景/高架视角里不再摊成
   // 亮毯，只保留一线地平霓虹的色相记忆。
   gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(vec3(.024,.038,.054),horizonColor*.5,uDistrict),distanceFade);
  }`});
 const road=new THREE.Mesh(new THREE.PlaneGeometry(700,700),material);
 road.name='RainPolishedAsphalt';road.rotation.x=-Math.PI/2;road.position.y=-.025;road.renderOrder=2;
 road.userData.update=seconds=>{uniforms.uTime.value=seconds;};return road;
}

function makeRainAtmosphere({seed=2049,count=3000}={}) {
 const group=new THREE.Group();group.name='RainAtmosphere';const rng=seeded(seed+8301);
 const uniforms={uTime:{value:0},uIntensity:{value:.65}};
 const positions=new Float32Array(count*6),data=new Float32Array(count*6);
 for(let i=0;i<count;i++){
  const x=(rng()-.5)*66,y=rng()*30,z=(rng()-.5)*80,speed=10+rng()*11,length=.2+rng()*.4,phase=rng();
  for(let v=0;v<2;v++){const n=i*6+v*3;positions.set([x,y,z],n);data.set([speed,length*v,phase],n);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aRain',new THREE.BufferAttribute(data,3));
 const mat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`uniform float uTime,uIntensity;attribute vec3 aRain;varying float vAlpha;void main(){vec3 p=position;p.y=mod(p.y-uTime*aRain.x,30.)+.18+aRain.y;p.x+=sin(uTime*.16+position.y*.04)*1.5+aRain.y*.17;vec4 mv=modelViewMatrix*vec4(p,1.);vAlpha=(.15+aRain.z*.24)*smoothstep(0.,3.,p.y)*(1.-smoothstep(38.,88.,-mv.z))*step(aRain.z,uIntensity);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`varying float vAlpha;void main(){gl_FragColor=vec4(.48,.69,.85,vAlpha);}`});
 const rain=new THREE.LineSegments(geometry,mat);rain.name='LayeredRain';rain.frustumCulled=false;group.add(rain);
 const n=150,rippleGeo=new THREE.InstancedBufferGeometry();rippleGeo.index=new THREE.PlaneGeometry(1,1).index;
 const quad=new THREE.PlaneGeometry(1,1);rippleGeo.setAttribute('position',quad.getAttribute('position'));rippleGeo.setAttribute('uv',quad.getAttribute('uv'));
 const sites=new Float32Array(n*3),phases=new Float32Array(n*2);
 for(let i=0;i<n;i++){let x=(rng()-.5)*32,z=(rng()-.5)*47;if(Math.abs(x)>4.65&&Math.abs(z)>2.8)x=(rng()-.5)*8.7;sites.set([x,.04,z],i*3);phases.set([rng(),.65+rng()*.6],i*2);}
 rippleGeo.setAttribute('aSite',new THREE.InstancedBufferAttribute(sites,3));rippleGeo.setAttribute('aPhase',new THREE.InstancedBufferAttribute(phases,2));rippleGeo.instanceCount=n;
 const rippleMat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 aSite;attribute vec2 aPhase;uniform float uTime,uIntensity;varying vec2 vUv;varying float vLife,vActive;void main(){vUv=uv;vLife=fract(uTime*.72*aPhase.y+aPhase.x);vActive=step(aPhase.x,uIntensity);float size=.09+vLife*.64;vec3 p=aSite+vec3(position.x*size,0.,position.y*size);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`varying vec2 vUv;varying float vLife,vActive;void main(){float r=length(vUv-.5);float ring=1.-smoothstep(0.,.028,abs(r-.4));float inner=(1.-smoothstep(0.,.014,abs(r-.24)))*.36;float fade=pow(1.-vLife,1.7)*smoothstep(0.,.08,vLife);gl_FragColor=vec4(.27,.60,.68,(ring+inner)*fade*.32*vActive);}`});
 const splashes=new THREE.Mesh(rippleGeo,rippleMat);splashes.name='PuddleRipples';splashes.frustumCulled=false;splashes.renderOrder=3;group.add(splashes);
 const mistMap=haloTexture(),mist=[];
 for(let i=0;i<7;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:mistMap,color:i%2?'#667b9b':'#477e90',opacity:.085,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));const x=(i%2?1:-1)*4.2,z=-21+i*6.2;sprite.position.set(x,.7,z);sprite.scale.set(7,2.1,1);group.add(sprite);mist.push({sprite,x,z,phase:rng()*6.28});}
 group.userData={rain,splashes,uniforms,setIntensity(value){uniforms.uIntensity.value=THREE.MathUtils.clamp(value,0,1);},update(seconds){uniforms.uTime.value=seconds;mist.forEach(({sprite,x,z,phase})=>{sprite.position.set(x+Math.sin(seconds*.16+phase)*.5,.65+Math.sin(seconds*.25+phase)*.13,z);sprite.material.opacity=.065+Math.sin(seconds*.21+phase)*.012;});}};
 group.userData.update(0);return group;
}

// Standalone street furniture factory. Coordinates share makeCyberBlock's ground plane.
function makeStreetDetails({seed=2049}={}){
 const group=new THREE.Group();group.name='StreetDetails';
 const rng=seeded(seed+714),ground=.135;
 const materials={
  graphite:new THREE.MeshStandardMaterial({color:'#152733',metalness:.68,roughness:.39}),
  steel:new THREE.MeshStandardMaterial({color:'#687986',metalness:.82,roughness:.33}),
  rubber:new THREE.MeshStandardMaterial({color:'#111b23',roughness:.88}),
  enamel:new THREE.MeshStandardMaterial({color:'#344b50',metalness:.36,roughness:.53}),
  wood:new THREE.MeshStandardMaterial({color:'#685441',roughness:.82}),
  paper:new THREE.MeshStandardMaterial({color:'#ccb28b',roughness:.82}),
  amber:neon('#ffbe73'),cyan:neon('#6dccbf'),red:neon('#ed594d'),
  dullRed:new THREE.MeshStandardMaterial({color:'#552d2d',emissive:'#5b211b',emissiveIntensity:.14}),
  dullAmber:new THREE.MeshStandardMaterial({color:'#57472a',emissive:'#665024',emissiveIntensity:.12}),
  dullGreen:new THREE.MeshStandardMaterial({color:'#254c43',emissive:'#154535',emissiveIntensity:.12})
 };
 // Unit geometry is reused throughout; individual objects retain clear editing handles.
 const geometries={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,12),
  sphere:new THREE.SphereGeometry(1,10,7),disc:new THREE.CylinderGeometry(1,1,1,18),
  plane:new THREE.PlaneGeometry(1,1)};
 function mesh(parent,name,geo,material,x,y,z,sx=1,sy=sx,sz=sx){
  const item=new THREE.Mesh(geo,material);item.name=name;item.position.set(x,y,z);item.scale.set(sx,sy,sz);parent.add(item);return item;
 }
 function rect(parent,name,w,h,d,x,y,z,material){return mesh(parent,name,geometries.box,material,x,y,z,w,h,d)}
 function cylinder(parent,name,r,h,x,y,z,material){return mesh(parent,name,geometries.cylinder,material,x,y,z,r,h,r)}
 function subgroup(name,x=0,z=0,y=ground){const item=new THREE.Group();item.name=name;item.position.set(x,y,z);group.add(item);return item}
 function canvasMap(width,height,draw){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;draw(canvas.getContext('2d'),width,height);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;return texture}

 // Signals stand behind the curb, leaving both driving lanes and zebra crossings clear.
 const signalGroup=subgroup('IntersectionSignals');
 const pedestrianMaps=[false,true].map(walk=>canvasMap(96,144,(ctx,w,h)=>{
  ctx.fillStyle='#0c171b';ctx.fillRect(0,0,w,h);ctx.strokeStyle=ctx.fillStyle=walk?'#7cdec2':'#ed7964';
  ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.arc(48,31,8,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(48,46);ctx.lineTo(48,76);
  if(walk){ctx.moveTo(48,50);ctx.lineTo(30,69);ctx.moveTo(48,50);ctx.lineTo(65,58);ctx.moveTo(48,74);ctx.lineTo(32,103);ctx.moveTo(48,74);ctx.lineTo(68,99)}
  else{ctx.moveTo(31,51);ctx.lineTo(65,51);ctx.moveTo(48,74);ctx.lineTo(37,102);ctx.moveTo(48,74);ctx.lineTo(59,102)}
  ctx.stroke();ctx.font='bold 13px monospace';ctx.textAlign='center';ctx.fillText(walk?'CROSS':'WAIT',48,129);
 }));
 const pedestrianMats=pedestrianMaps.map(map=>new THREE.MeshBasicMaterial({map,toneMapped:false}));
 const hoodGeometry=new THREE.CylinderGeometry(1,1,1,16,1,true,0,Math.PI);
 for(const side of [-1,1])for(const approach of [-1,1]){
  const signal=new THREE.Group();signal.name='Signal-'+(side<0?'West':'East')+'-'+(approach<0?'North':'South');signal.position.set(side*5.24,0,approach*3.20);signalGroup.add(signal);
  rect(signal,'AnchorFoot',.26,.07,.26,0,.035,0,materials.graphite);
  cylinder(signal,'Pole',.046,2.91,0,1.49,0,materials.steel);
  cylinder(signal,'BaseCollar',.073,.35,0,.245,0,materials.graphite);
  rect(signal,'SignalBracket',.44,.044,.052,-side*.18,2.56,0,materials.steel);
  const head=new THREE.Group();head.name='VehicleSignal';head.position.set(-side*.29,2.61,0);head.rotation.y=approach<0?Math.PI:0;signal.add(head);
  rect(head,'Housing',.255,.765,.19,0,0,0,materials.graphite);
  rect(head,'RainCap',.30,.035,.24,0,.404,.021,materials.graphite);
  for(let index=0;index<3;index++){
   const y=.245-index*.245;
   const bezel=mesh(head,'LensRim-'+index,geometries.disc,materials.rubber,0,y,.104,.084,.024,.084);bezel.rotation.x=Math.PI/2;
   // Main-road traffic flows while crosswalk pedestrians wait.
   const active=index===2;
   const lensMaterial=active?(index===0?materials.red:materials.cyan):[materials.dullRed,materials.dullAmber,materials.dullGreen][index];
   const lens=mesh(head,'Lens-'+index,geometries.disc,lensMaterial,0,y,.122,.063,.008,.063);lens.rotation.x=Math.PI/2;
   const hood=mesh(head,'LensRainHood-'+index,hoodGeometry,materials.graphite,0,y,.155,.093,.13,.093);hood.rotation.x=Math.PI/2;hood.rotation.z=Math.PI/2;
  }
  const pedestrian=new THREE.Group();pedestrian.name='PedestrianSignal';pedestrian.position.set(side*.10,1.97,0);pedestrian.rotation.y=-side*Math.PI/2;signal.add(pedestrian);
  rect(pedestrian,'Housing',.225,.34,.15,0,0,0,materials.graphite);
  mesh(pedestrian,'CrossingIcon',geometries.plane,pedestrianMats[0],0,0,.079,.185,.285,1);
  rect(signal,'PushButtonBox',.10,.15,.10,0,1.03,approach*.07,materials.graphite);
  rect(signal,'PushButton',.041,.043,.016,0,1.05,approach*.129,materials.amber);
 }

 // Narrow late-night tea counter, tucked beyond the last building's z = 18.1 face.
 const stall=subgroup('LastTrainTeaCounter',7.65,18.57);
 const creamCanvas=new THREE.MeshStandardMaterial({color:'#b5a486',roughness:.9,side:THREE.DoubleSide});
 const stripeMap=canvasMap(512,128,(ctx,w,h)=>{
  ctx.fillStyle='#7f6a4a';ctx.fillRect(0,0,w,h);for(let x=0;x<w;x+=64){ctx.fillStyle='#c2ad7d';ctx.fillRect(x,0,28,h)}
  ctx.fillStyle='rgba(18,28,30,.16)';for(let i=0;i<900;i++)ctx.fillRect(rng()*w,rng()*h,1,1);
 });
 const canopyMat=new THREE.MeshStandardMaterial({map:stripeMap,color:'#d5c8a4',roughness:.9,side:THREE.DoubleSide});
 const menuMap=canvasMap(512,256,(ctx,w,h)=>{
  ctx.fillStyle='#202e2c';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#8d9070';ctx.lineWidth=3;ctx.strokeRect(12,12,w-24,h-24);
  ctx.textAlign='center';ctx.fillStyle='#efd6a7';ctx.font='bold 67px "Microsoft YaHei",sans-serif';ctx.fillText('夜 茶',w/2,104);
  ctx.font='20px monospace';ctx.fillText('LAST TRAIN TEA',w/2,149);ctx.fillStyle='#94b6a9';ctx.font='18px monospace';ctx.fillText('HOT TEA  08   /   BROTH  12',w/2,211);
 });
 const menuMat=new THREE.MeshBasicMaterial({map:menuMap,toneMapped:false});
 rect(stall,'CounterCabinet',2.12,.79,.62,0,.415,.025,materials.enamel);
 rect(stall,'KickPlate',2.18,.09,.65,0,.08,.03,materials.graphite);
 rect(stall,'SteelCounterTop',2.29,.064,.76,0,.842,.01,materials.steel);
 rect(stall,'FrontTimberInset',1.92,.48,.022,0,.45,.349,materials.wood);
 for(const x of [-.96,.96]){
  cylinder(stall,'CanopyUpright',.027,1.97,x,1.015,-.31,materials.steel);
  rect(stall,'CabinetPanelEdge',.022,.66,.02,x,.44,.365,materials.steel);
 }
 rect(stall,'CanopyRidge',2.36,.045,.048,0,1.993,-.16,materials.steel);
 const roof=rect(stall,'StripedCanvasAwning',2.42,.035,.82,0,1.974,-.015,canopyMat);roof.rotation.x=.095;
 rect(stall,'AwningValance',2.42,.165,.033,0,1.863,.402,canopyMat);
 rect(stall,'CeilingWarmTube',1.82,.027,.043,0,1.869,-.13,materials.amber);
 rect(stall,'MenuFrame',.81,.45,.045,.41,1.465,-.285,materials.graphite);
 mesh(stall,'TeaMenu',geometries.plane,menuMat,.41,1.465,-.259,.765,.402,1);
 rect(stall,'LinenCurtain',.52,.66,.023,-.63,1.423,-.288,creamCanvas);
 for(const x of [-.78,-.65,-.52])rect(stall,'CurtainPleat',.014,.63,.016,x,1.42,-.27,materials.paper);
 cylinder(stall,'BrothKettle',.145,.25,-.57,1.01,.065,materials.steel);
 cylinder(stall,'KettleLid',.16,.025,-.57,1.147,.065,materials.graphite);
 cylinder(stall,'KettleKnob',.034,.04,-.57,1.18,.065,materials.wood);
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.12,.012,5,14,Math.PI),materials.graphite);handle.name='KettleHandle';handle.position.set(-.57,1.155,.065);stall.add(handle);
 rect(stall,'ServingTray',.44,.025,.24,.52,.891,.09,materials.wood);
 const cupGeometry=new THREE.CylinderGeometry(.046,.034,.112,12,1,true);
 for(let i=0;i<4;i++){const cup=new THREE.Mesh(cupGeometry,materials.paper);cup.name='TeaCup-'+i;cup.position.set(.36+(i%2)*.15,.953,.01+Math.floor(i/2)*.12);stall.add(cup)}
 cylinder(stall,'CondimentJar',.053,.145,-.10,.945,-.10,materials.enamel);
 cylinder(stall,'JarLid',.057,.023,-.10,1.03,-.10,materials.graphite);
 const lamp=new THREE.PointLight('#ffc28c',6.5,5.5,2);lamp.name='TeaCounterWarmLight';lamp.position.set(0,1.65,.37);stall.add(lamp);
 // A soft, local pool gives the counter a grounded warm reflection.
 const pool=new THREE.Mesh(new THREE.PlaneGeometry(3.0,.90),new THREE.MeshBasicMaterial({map:haloTexture(),color:'#edb279',transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending}));pool.name='TeaCounterLightPool';pool.rotation.x=-Math.PI/2;pool.position.set(0,.007,.05);stall.add(pool);
 function stool(x,z){const item=subgroup('MarketStool',x,z);cylinder(item,'RoundWoodSeat',.205,.065,0,.43,0,materials.wood);for(const angle of [0,Math.PI*2/3,Math.PI*4/3])cylinder(item,'StoolLeg',.021,.398,Math.cos(angle)*.137,.205,Math.sin(angle)*.137,materials.graphite);return item}
 stool(6.03,18.58);stool(9.14,18.48);
 function crate(x,z,angle=0){const item=subgroup('DeliveryCrate',x,z);item.rotation.y=angle;rect(item,'CrateBody',.47,.30,.38,0,.16,0,materials.wood);for(const h of [.06,.18,.285]){rect(item,'CrateFrontSlat',.5,.033,.03,0,h,.205,materials.paper);rect(item,'CrateSideSlat',.03,.033,.38,.245,h,0,materials.paper)}return item}
 crate(9.65,18.52,.08);const upperCrate=crate(9.67,18.52,-.06);upperCrate.position.y+=.33;

 // Curb grates use one instanced set of bars rather than dozens of draw calls.
 const grates=subgroup('StormDrains');
 const gratePositions=[[-5.18,-18.55],[-5.18,-13.25],[-5.18,-8.05],[-5.18,8.05],[-5.18,13.25],[5.18,-13.25],[5.18,-8.05],[5.18,8.05],[5.18,13.25]];
 const grateBars=new THREE.InstancedMesh(geometries.box,materials.steel,gratePositions.length*7);grateBars.name='DrainGrateBars';
 const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();let bar=0;
 gratePositions.forEach(([x,z],index)=>{
  rect(grates,'DrainRecess-'+index,.29,.014,.60,x,.008,z,materials.rubber);
  for(let j=0;j<7;j++){matrix.compose(new THREE.Vector3(x,.019,z+(j-3)*.077),quaternion,new THREE.Vector3(.27,.01,.027));grateBars.setMatrixAt(bar++,matrix)}
 });grates.add(grateBars);grateBars.instanceMatrix.needsUpdate=true;
 const bollards=subgroup('CurbBollards');
 for(const side of [-1,1])for(const z of [-18.8,-13.25,-8.05,8.05,13.25]){
  const x=side*5.31;cylinder(bollards,'BollardBody',.064,.54,x,.275,z,materials.graphite);
  cylinder(bollards,'BollardReflector',.067,.052,x,.436,z,materials.paper);
  cylinder(bollards,'BollardCap',.07,.032,x,.561,z,materials.steel);
 }
 function utilityCabinet(x,z){const item=subgroup('StreetUtilityCabinet',x,z);rect(item,'Enclosure',.42,.71,.48,0,.37,0,materials.enamel);rect(item,'ServiceDoor',.017,.62,.4,-Math.sign(x)*.22,.36,0,materials.steel);rect(item,'RainLip',.48,.035,.54,0,.745,0,materials.graphite);for(let i=0;i<4;i++)rect(item,'VentSlot',.018,.022,.24,-Math.sign(x)*.235,.24+i*.068,0,materials.graphite);return item}
 utilityCabinet(-5.89,-8.0);utilityCabinet(5.84,13.29);
 const refuse=subgroup('TiedRefuseBags');
 const bagsMat=new THREE.MeshStandardMaterial({color:'#233332',metalness:.07,roughness:.59});
 for(const [x,z] of [[-6.13,13.30],[-6.49,13.34],[6.17,-13.27]]){
  mesh(refuse,'RefuseBag',geometries.sphere,bagsMat,x,.235,z,.19,.235,.17);
  const knot=mesh(refuse,'BagKnot',geometries.sphere,bagsMat,x+.025,.452,z,.041,.06,.029);knot.rotation.z=.23;
 }

 // Umbrella silhouettes provide human scale without miniature faces or bright costumes.
 const canopyGeometry=new THREE.BufferGeometry(),vertices=[],colors=[];
 const canopyPalette=[new THREE.Color('#557275'),new THREE.Color('#668588')];
 const segments=10;
 for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
  const points=[[0,.205,0],[Math.cos(a)*.35,.10,Math.sin(a)*.35],[Math.cos(b)*.35,.10,Math.sin(b)*.35],
   [Math.cos(a)*.35,.10,Math.sin(a)*.35],[Math.cos(a)*.44,0,Math.sin(a)*.44],[Math.cos(b)*.44,0,Math.sin(b)*.44],
   [Math.cos(a)*.35,.10,Math.sin(a)*.35],[Math.cos(b)*.44,0,Math.sin(b)*.44],[Math.cos(b)*.35,.10,Math.sin(b)*.35]];
  const color=canopyPalette[i%2];for(const p of points){vertices.push(...p);colors.push(color.r,color.g,color.b)}
 }
 canopyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));canopyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));canopyGeometry.computeVertexNormals();
 const umbrellaMaterials=['#7c9290','#77666a','#9c997c','#6a7b88'].map(color=>new THREE.MeshStandardMaterial({color,vertexColors:true,metalness:.13,roughness:.36,side:THREE.DoubleSide}));
 const coatMaterials=['#29444a','#3b3845','#514940','#263c4d'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.8}));
 const ribVertices=[];for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2;ribVertices.push(0,.212,0,Math.cos(a)*.44,.006,Math.sin(a)*.44)}
 const ribGeometry=new THREE.BufferGeometry();ribGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ribVertices,3));const ribMat=new THREE.LineBasicMaterial({color:'#839b9a',transparent:true,opacity:.32});
 const people=[[-5.90,7.94,-.16,0],[5.96,-8.0,Math.PI+.2,1],[-5.8,18.65,.45,2],[6.14,-18.66,2.3,3]];
 for(const [x,z,angle,index] of people){
  const person=subgroup('UmbrellaPedestrian-'+(index+1),x,z);person.rotation.y=angle;person.scale.setScalar(.65);
  mesh(person,'Raincoat',geometries.cylinder,coatMaterials[index],0,.85,0,.15,.59,.12);
  mesh(person,'Shoulders',geometries.sphere,coatMaterials[index],0,1.15,0,.19,.12,.13);
  mesh(person,'HeadSilhouette',geometries.sphere,materials.graphite,0,1.34,0,.095,.12,.09);
  for(const side of [-1,1]){
   const leg=cylinder(person,'TrouserLeg',.052,.48,side*.077,.37,side*.046,materials.graphite);leg.rotation.x=side*.17;
   mesh(person,'Boot',geometries.sphere,materials.rubber,side*.077,.107,.067+side*.08,.065,.06,.12);
  }
  const arm=cylinder(person,'RaisedSleeve',.047,.39,.155,1.018,.04,coatMaterials[index]);arm.rotation.z=.29;
  cylinder(person,'UmbrellaShaft',.011,.70,.19,1.376,.04,materials.steel);
  const canopy=new THREE.Mesh(canopyGeometry,umbrellaMaterials[index]);canopy.name='PanelledUmbrella';canopy.position.set(.19,1.695,.04);person.add(canopy);
  const ribs=new THREE.LineSegments(ribGeometry,ribMat);ribs.name='UmbrellaRibs';ribs.position.copy(canopy.position);person.add(ribs);
  cylinder(person,'UmbrellaTip',.017,.075,.19,1.924,.04,materials.graphite);
 }
 // Keep the tea counter, seats and crates at the same miniature scale as its guests.
 for(const fixture of group.children){if(['LastTrainTeaCounter','MarketStool','DeliveryCrate'].includes(fixture.name)){
  fixture.scale.setScalar(.65);fixture.position.x=7.65+(fixture.position.x-7.65)*.65;fixture.position.z=18.57+(fixture.position.z-18.57)*.65;fixture.position.y=ground+(fixture.position.y-ground)*.65;
 }}
 let meshCount=0;group.traverse(item=>{if(item.isMesh)meshCount++});
 group.userData={seed,meshCount,pedestrianCount:people.length,signalCount:4,stallPosition:[7.65,ground,18.57]};
 return group;
}

// 老街人物定义表 —— 纯数据，不含 THREE / 不含函数，makeStreetCrowd 内只读。
// 提升到模块作用域是为了让角色管理台能直接 import，替代从源码切字符串的脆弱做法。
export const legacyPersonDefinitions = [
 {name:'WestPair-A',role:'walking together',x:-4.52,z:15.00,ground:0,coat:2,umbrella:.49,walk:.27,phase:.25},
 {name:'WestPair-B',role:'walking together',x:-4.57,z:16.35,ground:0,coat:0,umbrella:.49,walk:.27,phase:.25},
 {name:'EastPair-A',role:'walking together',x:4.56,z:10.20,ground:0,coat:1,umbrella:.49,walk:.23,phase:1.6},
 {name:'EastPair-B',role:'walking together',x:4.56,z:11.55,ground:0,coat:3,umbrella:.49,walk:.23,phase:1.6},
 {name:'WestTeaQueue',role:'waiting outside a shop',x:-5.80,z:-13.30,ground:.135,coat:1,umbrella:.43,heading:Math.PI/2},
 {name:'WestArcadePhone',role:'checking a phone',x:-6.78,z:8.00,ground:.135,coat:2,heading:Math.PI/2,prop:'phone'},
 {name:'EastArcadeUmbrella',role:'waiting outside a shop',x:6.70,z:8.00,ground:.135,coat:4,umbrella:.43,heading:-Math.PI/2},
 {name:'EastDeliveryWait',role:'waiting with a tote',x:7.15,z:-13.30,ground:.135,coat:0,heading:-Math.PI/2,prop:'tote'},
 {name:'WestRepairCustomer',role:'waiting outside a shop',x:-6.83,z:-8.00,ground:.135,coat:3,heading:Math.PI/2,prop:'phone'},
 {name:'EastShopCompanion',role:'waiting with a tote',x:7.35,z:13.30,ground:.135,coat:5,heading:-Math.PI/2,prop:'tote'},
 {name:'TeaCounterVendor',role:'serving tea beside the counter',x:9.07,z:18.86,ground:.135,coat:4,heading:-Math.PI/2,prop:'vendor'},
 {name:'TeaCustomer-Cup',role:'drinking hot tea',x:7.21,z:19.43,ground:0,coat:1,heading:Math.PI,prop:'cup'},
 {name:'TeaCustomer-Umbrella',role:'waiting for tea',x:8.22,z:19.59,ground:0,coat:2,umbrella:.47,heading:0},
 {name:'TeaCustomer-Companion',role:'talking beside the counter',x:5.84,z:19.48,ground:0,coat:0,heading:Math.PI*.66,prop:'cup'},
 {name:'NorthPair-A',role:'walking together',x:-4.58,z:-15.90,ground:0,coat:5,umbrella:.49,walk:.25,phase:3.4},
 {name:'NorthPair-B',role:'walking together',x:-4.60,z:-17.30,ground:0,coat:4,umbrella:.49,walk:.25,phase:3.4},
 {name:'WestNightWalker-A',role:'walking together',x:-4.54,z:-9.50,ground:0,coat:1,umbrella:.49,walk:.27,phase:5.1},
 {name:'WestNightWalker-B',role:'walking together',x:-4.58,z:-10.80,ground:0,coat:5,umbrella:.49,walk:.27,phase:5.1},
 {name:'EastArcadeWalker-A',role:'walking together',x:4.55,z:-2.60,ground:0,coat:3,umbrella:.49,walk:.23,phase:2.7},
 {name:'EastArcadeWalker-B',role:'walking together',x:4.58,z:-3.90,ground:0,coat:4,umbrella:.49,walk:.23,phase:2.7},
 {name:'SouthLanternWaiter',role:'waiting outside a shop',x:-5.72,z:20.40,ground:.135,coat:2,umbrella:.43,heading:Math.PI/2},
 {name:'SouthToteLinger',role:'waiting with a tote',x:5.66,z:19.90,ground:.135,coat:0,heading:-Math.PI/2,prop:'tote'},
 {name:'WestCrossingPhone',role:'checking a phone',x:-6.05,z:1.80,ground:.135,coat:4,heading:Math.PI/2,prop:'phone'},
 {name:'EastNoodleQueue',role:'waiting outside a shop',x:6.02,z:-7.30,ground:.135,coat:5,umbrella:.43,heading:-Math.PI/2},
 {name:'SouthGateWalker-A',role:'walking together',x:-4.56,z:20.60,ground:0,coat:0,umbrella:.49,walk:.25,phase:4.2},
 {name:'SouthGateWalker-B',role:'walking together',x:-4.60,z:21.90,ground:0,coat:2,umbrella:.49,walk:.25,phase:4.2},
 // 2026-09-15 evening: a fuller late-night queue around the LastTrainTeaCounter stall.
 // Names carry the TeaCustomer- prefix on purpose: the builder pulls those homes 65% toward
 // the stall at (7.65,18.57), so the coordinates below are pre-compression spreads and the
 // people land in a tight, plausible crowd ring south and east of the counter, clear of the
 // counter box (x 6.5-8.9 / z 18.2-19.0) and of the four original Tea* figures.
 // Naming note: the boundary scan in _phase2/check-12.cjs forbids some DOM identifiers as
 // bare words anywhere in this block (comments included), so roles say "browsing a shopfront".
 {name:'TeaCustomer-StallQueue-A',role:'queuing for tea',x:6.57,z:20.92,ground:0,coat:3,prop:'cup',heading:Math.PI},
 {name:'TeaCustomer-StallQueue-B',role:'waiting for tea',x:7.80,z:21.38,ground:0,coat:5,umbrella:.45,heading:Math.PI},
 {name:'TeaCustomer-StallTakeaway',role:'waiting with a tote',x:9.19,z:21.00,ground:0,coat:0,prop:'tote',heading:Math.PI*.9},
 {name:'TeaCustomer-StallUmbrella',role:'waiting for tea',x:10.57,z:21.46,ground:0,coat:2,umbrella:.47,heading:-Math.PI*.35},
 {name:'TeaCustomer-StallPhone',role:'checking a phone',x:11.49,z:18.77,ground:0,coat:4,prop:'phone',heading:-Math.PI/2},
 {name:'TeaCustomer-StallLinger',role:'waiting for tea',x:11.34,z:20.08,ground:0,coat:1,umbrella:.43,heading:-Math.PI*.6},
 {name:'TeaCustomer-StallWest',role:'drinking hot tea',x:5.65,z:20.08,ground:0,coat:0,prop:'cup',heading:Math.PI*.8},
 {name:'TeaCustomer-StallChat-A',role:'talking beside the counter',x:7.34,z:21.20,ground:0,coat:4,prop:'tote',heading:Math.PI},
 {name:'TeaCustomer-StallChat-B',role:'talking beside the counter',x:9.03,z:21.14,ground:0,coat:2,umbrella:.49,heading:Math.PI*.95},
 {name:'TeaCustomer-StallNightcap',role:'checking a phone',x:11.96,z:21.16,ground:0,coat:5,prop:'phone',heading:-Math.PI*.75},
 {name:'ArcadeBrowse',role:'browsing a shopfront',x:6.90,z:15.40,ground:.135,coat:3,umbrella:.43,heading:Math.PI/2},
 {name:'ArcadeLateWait',role:'waiting outside a shop',x:7.20,z:16.45,ground:.135,coat:5,prop:'phone',heading:-Math.PI/2},
 // 2026-09-15 evening, second pass: fill the empty stretches of both arcades and add two
 // more walking pairs. The street previously had people only in three z clusters per side,
 // which read as isolated groups rather than a busy night market. Coordinates sit at least
 // .8 apart in z from every existing figure and clear of the walking band at |x| ~4.55.
 {name:'WestLanternBrowse',role:'browsing a shopfront',x:-6.42,z:-5.10,ground:.135,coat:1,heading:Math.PI/2,prop:'tote'},
 // Kept 2.1 units up the pavement from the idle sentry at (-5.9, 4.2): the features gate
 // requires static robots to stay more than .12 clear of every block pedestrian.
 {name:'WestNoodleWait',role:'waiting outside a shop',x:-6.15,z:6.30,ground:.135,coat:3,umbrella:.43,heading:Math.PI/2},
 {name:'WestNightPhone',role:'checking a phone',x:-6.60,z:11.20,ground:.135,coat:0,heading:Math.PI/2,prop:'phone'},
 {name:'WestStroller-A',role:'walking together',x:-4.53,z:5.40,ground:0,coat:4,umbrella:.49,walk:.26,phase:2.1},
 {name:'WestStroller-B',role:'walking together',x:-4.58,z:6.70,ground:0,coat:2,umbrella:.49,walk:.26,phase:2.1},
 {name:'WestCornerChat',role:'talking beside the counter',x:-5.95,z:-1.60,ground:.135,coat:5,heading:Math.PI/2,prop:'cup'},
 {name:'EastLateQueue',role:'waiting outside a shop',x:6.28,z:-16.20,ground:.135,coat:1,umbrella:.43,heading:-Math.PI/2},
 {name:'EastKioskPhone',role:'checking a phone',x:6.85,z:4.20,ground:.135,coat:4,heading:-Math.PI/2,prop:'phone'},
 {name:'EastNoodleWaiter',role:'waiting with a tote',x:6.05,z:6.60,ground:.135,coat:2,heading:-Math.PI/2,prop:'tote'},
 {name:'EastLateWalker-A',role:'walking together',x:4.52,z:-6.10,ground:0,coat:0,umbrella:.49,walk:.24,phase:.9},
 {name:'EastLateWalker-B',role:'walking together',x:4.57,z:-7.45,ground:0,coat:5,umbrella:.49,walk:.24,phase:.9},
 {name:'ArcadeNightBrowse',role:'browsing a shopfront',x:6.80,z:12.10,ground:.135,coat:1,umbrella:.45,heading:-Math.PI/2}
];

function makeStreetCrowd({seed=2049}={}){
 const group=new THREE.Group();group.name='AfterHoursStreetCrowd';
 const rng=seeded(seed+18417),layoutRng=seeded(seed),buildingBounds=[];
 // Reproduce the architecture's seeded footprint sequence, including facade sampling.
 for(const side of [-1,1])for(let index=0;index<6;index++){
  const z=[-16,-10.6,-5.4,5.4,10.6,16][index];
  const x=side*(8+layoutRng()*.6),width=4.4+layoutRng()*1.1,height=6+layoutRng()*10+(index===0?3:0);
  buildingBounds.push({name:'Building-'+((side+1)*3+index+1),side,index,min:[x-width/2,.15,z-2.1],max:[x+width/2,.15+height,z+2.1],inner:Math.abs(x)-width/2});
  const samples=Math.floor((height-2)/.78)*Math.floor(width/.48)*4;
  for(let sample=0;sample<samples;sample++)if(layoutRng()>.48){layoutRng();layoutRng()}
 }
 const geometry={
  cylinder:new THREE.CylinderGeometry(1,1,1,10),
  coat:new THREE.CylinderGeometry(.78,1,1,10),
  sphere:new THREE.SphereGeometry(1,10,8),
  cup:new THREE.CylinderGeometry(1,.78,1,12),
  cap:new THREE.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI*.53)
 };
 const fabrics=['#688f93','#a57568','#b5aa8c','#687c9a','#7a897a','#8b7487'];
 const coatMaterials=fabrics.map(color=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.03}));
 const trousers=new THREE.MeshStandardMaterial({color:'#283945',roughness:.8});
 const shoes=new THREE.MeshStandardMaterial({color:'#202b31',metalness:.03,roughness:.6});
 const skin=new THREE.MeshStandardMaterial({color:'#ad8974',roughness:.91});
 const hair=new THREE.MeshStandardMaterial({color:'#293437',roughness:.88});
 const handleMaterial=new THREE.MeshStandardMaterial({color:'#7c939c',metalness:.76,roughness:.36});
 const canvasMaterial=new THREE.MeshStandardMaterial({color:'#c9b795',roughness:.83});
 const trimMaterial=new THREE.MeshStandardMaterial({color:'#a6c2ba',metalness:.11,roughness:.54});
 const phoneMaterial=new THREE.MeshStandardMaterial({color:'#a6d0cd',emissive:'#8cc4c7',emissiveIntensity:.23,roughness:.45});
 function item(parent,name,shape,material,position,scale){
  const mesh=new THREE.Mesh(shape,material);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);return mesh;
 }
 function smallBox(parent,name,width,height,depth,x,y,z,material){const mesh=box(parent,width,height,depth,x,y,z,material);mesh.name=name;return mesh}
 function limbGeometry(points,radius=.049){const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));return new THREE.TubeGeometry(curve,12,radius,7,false)}
 const arms={
  relaxedLeft:limbGeometry([[-.20,1.36,0],[-.245,1.15,.01],[-.235,.955,.035]]),
  relaxedRight:limbGeometry([[.20,1.36,0],[.245,1.15,.01],[.235,.955,.035]]),
  cupLeft:limbGeometry([[-.20,1.36,0],[-.23,1.10,.035],[-.14,1.25,.205]]),
  umbrellaRight:limbGeometry([[.20,1.36,0],[.23,1.11,.035],[0,1.285,.17]]),
  servingRight:limbGeometry([[.20,1.36,0],[.245,1.13,.12],[.14,1.20,.31]])
 };
 // A low polygon canopy retains alternating fabric panels and slender radial seams.
 const umbrellaGeometry=new THREE.BufferGeometry(),positions=[],panelColors=[],ribPositions=[];
 const panelA=new THREE.Color('#e4e8e5'),panelB=new THREE.Color('#aabbb9'),segments=12;
 for(let index=0;index<segments;index++){
  const a=index/segments*Math.PI*2,b=(index+1)/segments*Math.PI*2;
  const ring=(angle,radius,height)=>[Math.cos(angle)*radius,height,Math.sin(angle)*radius];
  const innerA=ring(a,.7,.18),innerB=ring(b,.7,.18),outerA=ring(a,1,0),outerB=ring(b,1,0);
  const color=index%2?panelA:panelB;
  for(const vertex of [[0,.36,0],innerA,innerB,innerA,outerA,outerB,innerA,outerB,innerB]){positions.push(...vertex);panelColors.push(color.r,color.g,color.b)}
  ribPositions.push(0,.365,0,...ring(a,.7,.187),...ring(a,.7,.187),...ring(a,1,.005));
 }
 umbrellaGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 umbrellaGeometry.setAttribute('color',new THREE.Float32BufferAttribute(panelColors,3));umbrellaGeometry.computeVertexNormals();
 const ribGeometry=new THREE.BufferGeometry();ribGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ribPositions,3));
 const ribMaterial=new THREE.LineBasicMaterial({color:'#b0c7c5',transparent:true,opacity:.44});
 const umbrellaMaterials=['#749b9e','#bd8c7d','#bfb591','#7895b6','#77958b','#a489a1'].map(color=>new THREE.MeshStandardMaterial({color,vertexColors:true,metalness:.12,roughness:.35,side:THREE.DoubleSide}));
 const people=[];
 for(const [index,definition] of legacyPersonDefinitions.entries()){
  const person=new THREE.Group();person.name=definition.name;
  const homeX=definition.walk?Math.sign(definition.x)*Math.min(Math.abs(definition.x),...buildingBounds.filter(bound=>bound.side===Math.sign(definition.x)&&Math.abs((bound.min[2]+2.1)-definition.z)<3).map(bound=>bound.inner-.79)):definition.x;
  const home=new THREE.Vector3(homeX,definition.ground,definition.z);if(definition.name.startsWith('TeaCounter')||definition.name.startsWith('TeaCustomer')){home.x=7.65+(home.x-7.65)*.65;home.z=18.57+(home.z-18.57)*.65;}
  person.position.copy(home);person.rotation.y=definition.heading||0;person.scale.setScalar(.65);group.add(person);
  const body=new THREE.Group();body.name='UpperBody';person.add(body);
  const cloth=coatMaterials[definition.coat];
  item(body,'Raincoat',geometry.coat,cloth,[0,1.115,0],[.205,.60,.165]);
  item(body,'Shoulders',geometry.sphere,cloth,[0,1.38,0],[.223,.102,.162]);
  item(body,'Neck',geometry.cylinder,skin,[0,1.455,0],[.049,.066,.049]);
  item(body,'Head',geometry.sphere,skin,[0,1.573,.004],[.109,.128,.104]);
  item(body,'HairOrRainHood',geometry.cap,definition.umbrella?hair:cloth,[0,1.597,-.009],[.121,.126,.116]);
  smallBox(body,'CoatPocket-L',.092,.13,.023,-.112,1.12,.144,cloth);
  smallBox(body,'CoatPocket-R',.092,.13,.023,.112,1.12,.144,cloth);
  smallBox(body,'Collar',.145,.058,.045,0,1.432,.077,cloth);
  if(index%3===0){
   smallBox(body,'ReflectiveHem',.325,.024,.018,0,.918,.145,trimMaterial);
   smallBox(body,'ShoulderTrim-L',.077,.015,.1,-.158,1.458,.027,trimMaterial);
   smallBox(body,'ShoulderTrim-R',.077,.015,.1,.158,1.458,.027,trimMaterial);
  }
  const legPivots=[];
  for(const side of [-1,1]){
   const leg=new THREE.Group();leg.name=side<0?'LeftLeg':'RightLeg';leg.position.set(side*.087,.86,0);person.add(leg);legPivots.push(leg);
   item(leg,'TrouserLeg',geometry.cylinder,trousers,[0,-.356,0],[.058,.73,.061]);
   item(leg,'Shoe',geometry.sphere,shoes,[0,-.79,.037],[.069,.065,.13]);
  }
  const holding=definition.prop==='cup'||definition.prop==='phone'||definition.prop==='vendor';
  item(body,'LeftSleeve',holding?arms.cupLeft:arms.relaxedLeft,cloth,[0,0,0],[1,1,1]);
  item(body,'LeftHand',geometry.sphere,skin,holding?[-.14,1.25,.205]:[-.235,.949,.035],[.04,.056,.038]);
  item(body,'RightSleeve',definition.umbrella?arms.umbrellaRight:definition.prop==='vendor'?arms.servingRight:arms.relaxedRight,cloth,[0,0,0],[1,1,1]);
  item(body,'RightHand',geometry.sphere,skin,definition.umbrella?[0,1.285,.17]:definition.prop==='vendor'?[.14,1.20,.31]:[.235,.949,.035],[.04,.056,.038]);
  if(definition.prop==='cup'||definition.prop==='vendor')item(body,'PaperTeaCup',geometry.cup,canvasMaterial,[-.14,1.31,.205],[.039,.088,.039]);
  if(definition.prop==='phone'){
   const phone=smallBox(body,'Phone',.068,.115,.014,-.14,1.315,.219,shoes);phone.rotation.x=-.13;
   smallBox(body,'PhoneDisplay',.053,.089,.007,-.14,1.319,.229,phoneMaterial);
  }
  if(definition.prop==='vendor'){
   smallBox(body,'TeaApron',.298,.49,.025,0,1.076,.164,canvasMaterial);
   smallBox(body,'ApronNeckStrap',.057,.162,.019,0,1.391,.131,canvasMaterial);
   smallBox(body,'TeaServingTray',.34,.023,.28,.11,1.201,.36,canvasMaterial);
  }
  if(definition.prop==='tote'){
   smallBox(body,'CanvasTote',.225,.31,.13,.26,.744,.046,canvasMaterial);
   const handle=pipe(body,[[.18,.884,.046],[.18,1.005,.046],[.32,1.005,.046],[.32,.884,.046]],.011,canvasMaterial);handle.name='ToteHandle';
  }
  batchBoxes(body);
  const armPivots=[];
  for(const side of [-1,1]){
   const free=side<0?!holding:!definition.umbrella&&definition.prop!=='vendor'&&definition.prop!=='tote';
   if(!free)continue;
   const pivot=new THREE.Group();pivot.name=side<0?'LeftArmPivot':'RightArmPivot';pivot.position.set(side*.20,1.36,0);
   const nodes=[body.getObjectByName(side<0?'LeftSleeve':'RightSleeve'),body.getObjectByName(side<0?'LeftHand':'RightHand')];
   body.add(pivot);for(const node of nodes){if(node){pivot.add(node);node.position.sub(pivot.position);}}
   armPivots.push({pivot,side});
  }
  let umbrella=null;
  if(definition.umbrella){
   umbrella=new THREE.Group();umbrella.name='OpenUmbrella';umbrella.position.set(0,1.285,.17);person.add(umbrella);
   const radius=definition.umbrella,edge=.625;
   item(umbrella,'Shaft',geometry.cylinder,handleMaterial,[0,.354,0],[.011,.708,.011]);
   item(umbrella,'HandleGrip',geometry.cylinder,shoes,[0,-.015,0],[.022,.12,.022]);
   item(umbrella,'FabricCanopy',umbrellaGeometry,umbrellaMaterials[definition.coat],[0,edge,0],[radius,radius,radius]);
   const ribs=new THREE.LineSegments(ribGeometry,ribMaterial);ribs.name='CanopySeams';ribs.position.y=edge;ribs.scale.setScalar(radius);umbrella.add(ribs);
   item(umbrella,'CanopyFinial',geometry.cylinder,handleMaterial,[0,edge+radius*.36+.027,0],[.014,.054,.014]);
  }
  const phase=definition.phase===undefined?rng()*Math.PI*2:definition.phase;
  const entry={name:definition.name,role:definition.role,group:person,body,legs:legPivots,arms:armPivots,umbrella,homePosition:home.clone(),walkAmplitude:definition.walk||0,heading:definition.heading||0,phase,umbrellaRadius:(definition.umbrella||0)*.65,height:1.72*.65,visualScale:.65,gait:{}};
  person.userData={role:entry.role,homePosition:home.toArray(),height:entry.height,umbrellaRadius:entry.umbrellaRadius};people.push(entry);
 }
 function update(seconds){
  const time=Number.isFinite(Number(seconds))?Number(seconds):0;
  for(const person of people){
   const t=time*.75+person.phase,velocity=person.walkAmplitude*.75*Math.cos(t);
   person.group.position.copy(person.homePosition);
   if(person.walkAmplitude){
    person.group.position.z+=Math.sin(t)*person.walkAmplitude;
    const blend=THREE.MathUtils.smoothstep(velocity,-.024,.024);
    person.group.rotation.y=Math.PI*(1-blend);
   }else person.group.rotation.y=person.heading+Math.sin(time*.24+person.phase)*.026;
   const gait=sampleWalkingGait(time,.75,person.walkAmplitude,person.phase,person.gait),stride=gait.stride;
   person.legs[0].rotation.x=-stride;person.legs[1].rotation.x=stride;
   for(const [i,leg] of person.legs.entries()){
    const angle=leg.rotation.x,s=Math.sin(angle),c=Math.cos(angle);
    // Ellipsoid shoe support, including its forward toe offset.
    const bottom=-.79*c-.037*s-Math.hypot(.065*c,.13*s);
    leg.position.y=-bottom+(i===0?gait.liftLeft:gait.liftRight)/.65;
   }
   for(const {pivot,side} of person.arms)pivot.rotation.x=-side*stride*.72;
   person.body.position.y=person.walkAmplitude?gait.bob/.65:Math.sin(time*.82+person.phase)*.004;
   person.body.rotation.y=gait.twist;
   if(person.umbrella){person.umbrella.rotation.x=Math.sin(time*.71+person.phase)*.012;person.umbrella.rotation.z=Math.sin(time*.53+person.phase)*.014;}
  }
 }
 let meshCount=0;group.traverse(object=>{if(object.isMesh)meshCount++});
 group.userData={seed,people,pedestrianCount:people.length,visualScale:.65,walkingCount:people.filter(person=>person.walkAmplitude).length,buildingBounds,meshCount,update};
 update(0);return group;
}

// Six human-scale vehicles, with two independently sampled main-road lanes.
function makeGroundTraffic({seed=2049}={}) {
 const group=new THREE.Group();group.name='GroundTraffic';
 const rng=seeded(seed+4927),vehicles=[],geometryCache=new Map();
 const axleGeometry=new THREE.CylinderGeometry(.275,.275,.15,16);
 const hubGeometry=new THREE.CylinderGeometry(.157,.157,.157,10);
 const poolMap=haloTexture();
 function roundedBody(width,height,length,bevel=.055) {
  const key=[width,height,length,bevel].join('/');
  if(!geometryCache.has(key)) {
   const x=width/2-bevel,y=height/2-bevel,shape=new THREE.Shape();
   shape.moveTo(-x,-y);shape.lineTo(x,-y);shape.lineTo(x,y);shape.lineTo(-x,y);shape.closePath();
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:length-bevel*2,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1});
   geometry.translate(0,0,-length/2+bevel);geometryCache.set(key,geometry);
  }
  return geometryCache.get(key);
 }
 function cabinGeometry({width,topWidth,base,top,front,topFront,rear,topRear}) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
   -width/2,base,front,width/2,base,front,-topWidth/2,top,topFront,topWidth/2,top,topFront,
   -width/2,base,rear,width/2,base,rear,-topWidth/2,top,topRear,topWidth/2,top,topRear
  ],3));
  geometry.setIndex([0,1,3,0,3,2,4,6,7,4,7,5,0,2,6,0,6,4,1,5,7,1,7,3,2,3,7,2,7,6,0,4,5,0,5,1]);
  geometry.computeVertexNormals();return geometry;
 }
 const sedanCabin=cabinGeometry({width:1.51,topWidth:1.30,base:.81,top:1.375,front:.93,topFront:.43,rear:-1.10,topRear:-.82});
 const vanCabin=cabinGeometry({width:1.53,topWidth:1.42,base:.81,top:1.69,front:1.55,topFront:1.06,rear:.31,topRear:.34});
 function inkMap(text,background,foreground,width=256,height=64) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  ctx.fillStyle=foreground;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold '+Math.floor(height*.60)+'px Consolas, monospace';ctx.fillText(text,width/2,height*.54,width*.90);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
 }
 const taxiMap=inkMap('TAXI','#d7b475','#24312e');
 const deliveryMap=inkMap('NIGHT / 12','#536b69','#bacbc0',256,128);
 const laneShift=[(rng()-.5)*1.2,(rng()-.5)*1.2];
 const specs=[
  {kind:'sedan',paint:'#c1bfab',lane:-1,phase:-22+laneShift[0],speed:1.12},
  {kind:'taxi',paint:'#be8e45',lane:-1,phase:12+laneShift[0],speed:1.12},
  {kind:'delivery',paint:'#89978d',lane:1,phase:-13+laneShift[1],speed:1.02},
  {kind:'sedan',paint:'#42665a',lane:1,phase:21+laneShift[1],speed:1.02},
  {kind:'sedan',paint:'#687f78',lane:-1,parked:true,x:-3.95,z:-6.2},
  {kind:'taxi',paint:'#b9ac89',lane:1,parked:true,x:3.95,z:-14.5}
 ];
 function addMesh(parent,name,geometry,material,x=0,y=0,z=0) {
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 function pool(parent,name,width,length,x,z,color,opacity) {
  const material=new THREE.MeshBasicMaterial({map:poolMap,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
  const mesh=addMesh(parent,name,new THREE.PlaneGeometry(width,length),material,x,.045,z);
  mesh.rotation.x=-Math.PI/2;mesh.renderOrder=3;return mesh;
 }
 specs.forEach((spec,index)=>{
  const car=new THREE.Group();car.name='RoadVehicle-'+(index+1)+'-'+spec.kind;car.scale.setScalar(.65);group.add(car);
  const van=spec.kind==='delivery',width=van?1.82:1.78,length=van?4.14:4.02,height=van?1.84:1.443;
  const materials={
   paint:new THREE.MeshStandardMaterial({color:spec.paint,metalness:.46,roughness:.27,transparent:true}),
   trim:new THREE.MeshStandardMaterial({color:'#263335',metalness:.64,roughness:.38,transparent:true}),
   glass:new THREE.MeshStandardMaterial({color:'#153339',metalness:.72,roughness:.14,emissive:'#1b3a40',emissiveIntensity:.07,flatShading:true,transparent:true}),
   tire:new THREE.MeshStandardMaterial({color:'#0b151a',roughness:.89,transparent:true}),
   hub:new THREE.MeshStandardMaterial({color:'#8c9a99',metalness:.88,roughness:.29,transparent:true}),
   head:new THREE.MeshBasicMaterial({color:'#ffe6bd',toneMapped:false,transparent:true}),
   tail:new THREE.MeshBasicMaterial({color:'#ee6253',toneMapped:false,transparent:true}),
   plate:new THREE.MeshBasicMaterial({map:inkMap('KL '+String(47+index*13)+'49','#b6b79e','#283537'),transparent:true,toneMapped:false})
  };
  addMesh(car,'BevelledLowerBody',roundedBody(width,.52,length,.07),materials.paint,0,.58,0);
  addMesh(car,'SlopedGlazing',van?vanCabin:sedanCabin,materials.glass);
  if(van) {
   addMesh(car,'DeliveryCargoShell',roundedBody(1.77,1.02,2.20,.055),materials.paint,0,1.315,-.80);
   addMesh(car,'CabRoof',roundedBody(1.46,.085,.77,.026),materials.paint,0,1.735,.70);
   for(const side of [-1,1]) {
    box(car,.018,.75,.026,side*.89,1.31,-1.17,materials.trim);
    box(car,.018,.035,.21,side*.90,1.24,-.35,materials.hub);
    const branding=addMesh(car,'DeliveryDoorMark',new THREE.PlaneGeometry(1.05,.38),new THREE.MeshBasicMaterial({map:deliveryMap,transparent:true}),side*.89,1.38,-.83);
    branding.rotation.y=side*Math.PI/2;
   }
  } else {
   addMesh(car,'ThinPaintedRoof',roundedBody(1.33,.065,1.32,.024),materials.paint,0,1.41,-.195);
   for(const side of [-1,1]) {
    box(car,.033,.54,.055,side*.713,1.09,-.13,materials.paint);
    box(car,.028,.045,1.97,side*.762,.833,-.08,materials.paint);
    box(car,.031,.032,.19,side*.895,.79,-.36,materials.hub);
    box(car,.031,.032,.19,side*.895,.79,.65,materials.hub);
    box(car,.028,.35,.018,side*.897,.615,-.03,materials.trim);
   }
  }
  const nose=length/2,rear=-length/2;
  box(car,1.56,.115,length-.20,0,.316,0,materials.trim);
  box(car,width-.08,.105,.10,0,.424,nose+.008,materials.hub);
  box(car,width-.08,.105,.10,0,.424,rear-.008,materials.hub);
  box(car,.68,.19,.021,0,.64,nose+.004,materials.trim);
  for(let slit=0;slit<3;slit++)box(car,.61,.019,.018,0,.578+slit*.057,nose+.02,materials.hub);
  for(const side of [-1,1]) {
   box(car,.30,.16,.025,side*.602,.686,nose+.015,materials.head);
   box(car,.28,.14,.025,side*.627,.703,rear-.015,materials.tail);
   box(car,.14,.075,.105,side*(width/2-.065),.975,van?1.04:.50,materials.paint);
   box(car,.12,.045,.082,side*(width/2-.057),.993,van?1.045:.505,materials.glass);
  }
  box(car,.22,.034,.018,0,.859,rear-.025,materials.tail);
  box(car,.23,.025,.04,0,.516,rear-.054,materials.head);
  box(car,.46,.137,.026,0,.424,rear-.066,materials.trim);
  const plate=addMesh(car,'RegistrationPlate',new THREE.PlaneGeometry(.398,.099),materials.plate,0,.431,rear-.081);plate.rotation.y=Math.PI;
  const wheelSet=[];
  for(const side of [-1,1])for(const end of [-1,1]) {
   const wheel=new THREE.Group();wheel.name='Wheel';wheel.position.set(side*(width/2-.080),.276,end*(van?1.37:1.28));car.add(wheel);wheelSet.push(wheel);
   const tire=addMesh(wheel,'Tread',axleGeometry,materials.tire);tire.rotation.z=Math.PI/2;
   const hub=addMesh(wheel,'TenSpokeHub',hubGeometry,materials.hub,side*.006);hub.rotation.z=Math.PI/2;
  }
  if(spec.kind==='taxi') {
   const signMat=new THREE.MeshBasicMaterial({map:taxiMap,transparent:true,toneMapped:false});
   box(car,.52,.14,.21,0,1.512,-.20,materials.head);
   for(const direction of [-1,1]) {
    const sign=addMesh(car,'TaxiRoofLettering',new THREE.PlaneGeometry(.465,.105),signMat,0,1.523,-.20+direction*.111);
    sign.rotation.y=direction<0?Math.PI:0;
   }
  }
  batchBoxes(car);
  const shadowMaterial=new THREE.MeshBasicMaterial({map:poolMap,color:'#000309',transparent:true,opacity:.68,depthWrite:false});
  const shadow=addMesh(car,'ContactShadow',new THREE.PlaneGeometry(width*1.6,length*1.20),shadowMaterial,0,.038,0);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=3;
  for(const side of [-1,1])pool(car,'HeadlampWetPool',1.35,3.6,side*.61,nose+1.21,'#e4c79f',.125);
  pool(car,'TailLightWetPool',1.65,1.20,0,rear-.49,'#bf4135',.12);
  const fadeMaterials=new Map();car.traverse(node=>{if(node.material)for(const material of Array.isArray(node.material)?node.material:[node.material])if(!fadeMaterials.has(material))fadeMaterials.set(material,material.opacity);});
  const direction=spec.lane<0?1:-1,x=spec.parked?spec.x:spec.lane*2;
  const samplePosition=seconds=>{
   const t=Number.isFinite(seconds)?seconds:0;
   const z=spec.parked?spec.z:((spec.phase+direction*spec.speed*t+34)%68+68)%68-34;
   return new THREE.Vector3(x,0,z);
  };
  const record={group:car,kind:spec.kind,moving:!spec.parked,lane:spec.lane,direction,speed:spec.speed||0,width:width*.65,length:length*.65,height:(spec.kind==='taxi'?1.59:height)*.65,radius:Math.hypot(width,length)*.65/2,visualScale:.65,x,z:0,xz:[x,0],samplePosition};
  car.rotation.y=direction<0?Math.PI:0;
  car.userData={kind:spec.kind,moving:!spec.parked,samplePosition,update(seconds){
   const t=Number.isFinite(seconds)?seconds:0,p=samplePosition(t);car.position.copy(p);record.x=p.x;record.z=p.z;record.xz[0]=p.x;record.xz[1]=p.z;
   const edge=spec.parked?1:THREE.MathUtils.clamp((34-Math.abs(p.z))/6,0,1),fade=edge*edge*(3-2*edge);
   car.visible=fade>.002;for(const [material,opacity] of fadeMaterials)material.opacity=opacity*fade;
   if(!spec.parked)wheelSet.forEach(wheel=>{wheel.rotation.x=t*spec.speed/(.275*.65);});
  }};
  vehicles.push(record);
 });
 group.userData={seed,vehicleCount:vehicles.length,visualScale:.65,movingCount:vehicles.filter(vehicle=>vehicle.moving).length,vehicles,update(seconds){vehicles.forEach(vehicle=>vehicle.group.userData.update(seconds));}};
 group.userData.update(0);return group;
}

function makeCyberBlock({seed=2049,reflectionDetail='mass'}={}){
 const group=new THREE.Group();group.name='CyberBlock';const rng=seeded(seed),city=new THREE.Group();city.name='Architecture';group.add(city);
 const steel=applySurfaceDetail(new THREE.MeshStandardMaterial({color:'#344557',metalness:.5,roughness:.5}),.28,.9),dark=applySurfaceDetail(new THREE.MeshStandardMaterial({color:'#24313d',metalness:.42,roughness:.62}),.34,.9),concrete=applySurfaceDetail(new THREE.MeshStandardMaterial({color:'#3e4c58',roughness:.86}),.22,1.05),metal=applySurfaceDetail(new THREE.MeshStandardMaterial({color:'#68829d',metalness:.8,roughness:.38}),.60,.7);
 applyFacadeWallWash(steel,{intensity:32,source:'old-street'});applyFacadeWallWash(dark,{intensity:32,source:'old-street'});
 const colors=['#43e7ed','#fb48b2','#8b71ff','#ffb775'],lights=colors.map(neon),textures=[],beacons=[],buildings=[],glowMap=haloTexture();
 // Signage rosters. Twelve words per screening wall and twelve per shop sign, so no word repeats
 // along either side of the avenue; nine single glyphs for the projecting boards, which hang in
 // pairs and used to show only three different characters.
 const adScreenWords=['龍城茶室','深夜食堂','機械修理','雲端旅宿','極速網咖','電子市場','港式茶樓','義體維修','舊書倉庫','天台酒館','電子零件','夜班藥房'];
 const shopSignWords=['面 館','茶 舍','電 器','旅 宿','網 咖','夜 市','藥 行','書 坊','鐵 匠','湯 屋','酒 窖','雜 貨'];
 const hangerWords=['茶','宿','面','電','藥','酒','書','鐵','湯'];
// A board's colour follows its word rather than the lot's structural accent, and its canvas is
// built once per (word, colour) pair instead of once per occurrence. batchDetails() folds meshes
// by material identity, so a pair that is built once is also one draw call however many lots hang
// it. Before this cache the twelve walls, twelve shop boards and twenty-four projecting faces each
// built their own canvas and their own MeshBasicMaterial: forty-eight canvases and forty-eight
// draw calls, even though the boards showed only three different glyphs. The cache lives in the
// factory body on purpose: two makeCyberBlock() instances must never share a texture (check-12.cjs).
 const palette=index=>colors[index%colors.length];
 const labelCache=new Map();
 const labelFor=(text,color,vertical)=>{
  const key=text+'|'+color+'|'+(vertical?1:0),hit=labelCache.get(key);
  if(hit)return hit;
  const texture=labelTexture(text,color,vertical);
  const entry={texture,material:new THREE.MeshBasicMaterial({map:texture,toneMapped:false})};
  labelCache.set(key,entry);
  if(vertical)textures.push({texture,speed:.045+textures.length*.004,scroll:textures.length%2===0});
  return entry;
 };
 const sidewalk=new THREE.Group();sidewalk.name='Sidewalks';group.add(sidewalk);
 for(const side of [-1,1])for(const half of [-1,1]){box(sidewalk,8,.22,16,side*9,.02,half*11,concrete);box(sidewalk,.055,.06,15.8,side*4.95,.16,half*11,lights[0])}
 const windowsGeometry=new THREE.BoxGeometry(.23,.45,.027);
 for(let side=-1;side<=1;side+=2)for(let k=0;k<6;k++){
  const i=(side+1)*3+k,z=[-16,-10.6,-5.4,5.4,10.6,16][k],x=side*(8+ rng()*.6),w=4.4+rng()*1.1,d=4.2,h=6+rng()*10+(k===0?3:0),accent=i%4;
  const b=new THREE.Group();b.name='Building-'+(i+1);b.position.set(x,.15,z);b.userData={height:h,width:w};city.add(b);buildings.push(b);
  box(b,w,h,d,0,h/2,0,i%2?steel:dark);box(b,w+.18,.23,d+.18,0,h,0,metal);box(b,w+.08,.36,d+.08,0,1.4,0,concrete);
  for(let floor=2;floor<h;floor+=2)box(b,w+.1,.085,d+.08,0,floor,0,concrete);
  for(const sx of [-1,1])box(b,.045,h,.045,sx*(w/2+.02),h/2,2.14,lights[accent]);
  const rows=Math.floor((h-2)/.78),cols=Math.floor(w/.48),count=rows*cols*4,win=new THREE.InstancedMesh(windowsGeometry,new THREE.MeshBasicMaterial({toneMapped:false}),count),mat=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);let id=0;
  for(let face=0;face<4;face++)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const t=(c-(cols-1)/2)*.48;const pos=new THREE.Vector3(face<2?t:(face===2?w/2+.017:-w/2-.017),2.1+r*.78,face<2?(face===0?2.117:-2.117):t*.75);q.setFromAxisAngle(new THREE.Vector3(0,1,0),face<2?0:Math.PI/2);mat.compose(pos,q,scale);win.setMatrixAt(id,mat);const lit=rng()>.48;win.setColorAt(id++,new THREE.Color(lit?(rng()>.20?colors[accent]:'#ffcd8f'):'#16293e').multiplyScalar(lit?.26+rng()*.52:.6))}b.add(win);
  const inward=new THREE.Group();inward.position.x=-side*(w/2+.05);inward.rotation.y=-side*Math.PI/2;b.add(inward);
  // Both the wall and the shop board take their word from the shared roster, indexed by the slot
  // rather than by the lot's accent, and their colour from that same word index. Twelve distinct
  // words therefore give twelve distinct (word, colour) pairs on each side, which is the floor
  // for two rows of twelve different boards -- but each pair is now built once instead of once
  // per lot, so the canvases drop from twenty-four to twelve here. labelFor() also pushes the
  // texture into `textures`, which is the list the scroll animation walks.
  const word=(side>0?6:0)+k;
  const screen=labelFor(adScreenWords[word],palette(word),true);
  box(inward,1.03,Math.min(h-2,6.4),.16,0,h*.57,.03,dark);const ad=new THREE.Mesh(new THREE.PlaneGeometry(.92,Math.min(h-2.2,6.18)),screen.material);ad.position.set(0,h*.57,.12);inward.add(ad);
  const shopSign=labelFor(shopSignWords[word],palette(word+1));box(inward,3.7,.93,.26,0,2.70,.16,steel);const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.5,.82),shopSign.material);sign.position.set(0,2.70,.30);inward.add(sign);
  // A projecting two-sided sign, with visible support brackets.
  const hanger=new THREE.Group();hanger.position.set(1.5,4.75,.7);hanger.rotation.y=Math.PI/2;inward.add(hanger);  // The two faces of a projecting board are the same board, so they share one material. The glyph
  // and its colour are both keyed off the word index, which keeps nine glyphs at nine materials
  // even though the loop runs twelve times -- the second pass over glyphs 0..2 reuses the
  // material the first pass built.
  box(hanger,1.25,1.5,.16,0,0,0,metal);const glyph=i%hangerWords.length,hangerLabel=labelFor(hangerWords[glyph],palette(glyph));for(const s of [-1,1]){const face=new THREE.Mesh(new THREE.PlaneGeometry(1.14,1.38),hangerLabel.material);face.position.z=s*.085;face.rotation.y=s<0?Math.PI:0;hanger.add(face)}box(inward,.065,.065,1.2,1.5,5.55,.5,metal);
  for(const a of [-1,1]){box(inward,.72,.62,.35,a*1.43,3.55,.2,metal);const fan=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.035,16),dark);fan.rotation.x=Math.PI/2;fan.position.set(a*1.43,3.55,.39);inward.add(fan);for(let j=-2;j<=2;j++)box(inward,.59,.025,.025,a*1.43,3.55+j*.09,.425,concrete);pipe(inward,[[a*1.7,.2,.14],[a*1.7,3.35,.14],[a*1.8,3.45,.14],[a*1.8,h-.5,.14]],.035,metal)}
  // Roof machinery, rails, antenna and warning beacon.
  box(b,1.7,.7,1.05,-.6,h+.46,-.4,metal);for(let j=0;j<7;j++)box(b,1.5,.027,.04,-.6,h+.83,-.83+j*.14,dark);box(b,.12,2.1,.12,w*.3,h+1.1,-1.1,metal);box(b,1.1,.04,.05,w*.3,h+1.6,-1.1,metal);const beacon=new THREE.Mesh(new THREE.SphereGeometry(.10,8,6),neon('#ff4059'));beacon.position.set(w*.3,h+2.2,-1.1);beacon.userData.keepSeparate=true;b.add(beacon);beacons.push(beacon);for(const rz of [-1.8,1.8]){box(b,w,.045,.04,0,h+.45,rz,metal);for(let j=-2;j<=2;j++)box(b,.035,.45,.035,j*w/5,h+.22,rz,metal)}pipe(b,[[-1,h+.1,1],[-1,h+.6,1],[.5,h+.6,1],[.5,h+.1,1]],.11,metal);
  // Recessed shop glazing, slim door frames and striped rain awnings.
  const shopGlass=new THREE.MeshStandardMaterial({color:'#142d34',metalness:.65,roughness:.18,emissive:colors[(accent+1)%4],emissiveIntensity:.055});
  for(const sx of [-1,1]){box(inward,1.24,1.98,.035,sx*.98,1.08,.18,shopGlass);for(const edge of [-1,1])box(inward,.025,2.04,.08,sx*.98+edge*.63,1.10,.205,metal);box(inward,1.27,.035,.08,sx*.98,.11,.205,metal);box(inward,.12,.025,.07,sx*.55,1.10,.25,metal);}
  box(inward,.032,2.08,.065,0,1.10,.2,metal);box(inward,.035,.13,.07,.1,1.08,.25,metal);
  const awning=box(inward,3.8,.075,.78,0,2.23,.58,dark);awning.rotation.x=.1;
  for(let stripe=0;stripe<9;stripe++)box(inward,.14,.017,.77,-1.7+stripe*.42,2.274,.58,accent===1?lights[3]:metal);
  box(inward,3.75,.12,.045,0,2.175,.97,dark);box(inward,3.35,.027,.027,0,2.12,.90,lights[(accent+1)%4]);
  // Setback penthouses and roof silhouettes distinguish the blocks.
  if(i%3===0){box(b,w*.68,1.04,2.1,.2,h+.65,.25,dark);box(b,w*.7,.09,2.14,.2,h+1.2,.25,metal);}
  if(i%3===1){const tank=new THREE.Mesh(new THREE.CylinderGeometry(.53,.53,1.0,14),metal);tank.position.set(.65,h+.72,.65);b.add(tank);for(const leg of [-1,1])box(b,.07,.28,.07,.65+leg*.32,h+.14,.65,metal);}
  for(let level=4;level<h-1;level+=3.6){box(inward,.32,.38,.16,-1.35,level,.08,metal);for(let slit=0;slit<3;slit++)box(inward,.24,.018,.02,-1.35,level-.1+slit*.09,.175,dark);}
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:colors[accent],transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));glow.position.set(-side*(w/2+.5),h*.57,0);glow.scale.set(5.4,9.2,1);b.add(glow);
 }
 batchBoxes(city);
 // Everything batchBoxes() left behind (tubes, pipes, cylinders, awnings) is folded by
 // material here, so it is mirrored as a handful of meshes instead of 148.
 const detailBatches=batchDetails(city);
 const reflectionTime={value:0};
 // Mirror the real geometry below the wet surface. Materials are isolated from the originals.
 const mirror=city.clone(true);mirror.name='WetReflection';mirror.scale.y=-1;mirror.position.y=-.08;
 if(reflectionDetail!=='full'){
  // The wet surface multiplies the mirrored colour down to .62 and attenuates it with depth,
  // so the massing and the glow sprites carry the effect. Loose detail meshes cost a draw call
  // each while staying nearly invisible under that attenuation, so they are dropped here.
  // Pass reflectionDetail:'full' to mirror every mesh again (the pre-2026-09-15 behaviour).
  const reflectionLoose=[];mirror.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)reflectionLoose.push(o)});reflectionLoose.forEach(o=>o.removeFromParent());mirror.userData.droppedFromReflection=reflectionLoose.length;
 }
 const clonedMats=new Map();mirror.traverse(o=>{if(o.material){if(!clonedMats.has(o.material)){const m=o.material.clone();if(m.color)m.color.multiplyScalar(.62);if(m.isSpriteMaterial)m.opacity*=.24;
 if(!m.isSpriteMaterial){m.onBeforeCompile=shader=>{
 injectFacadeWallWash(shader,m.userData.facadeWallWash);
 shader.uniforms.uReflectionTime=reflectionTime;
 shader.vertexShader='varying vec3 vReflectionWorld;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec4 reflectionPoint=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 reflectionPoint=instanceMatrix*reflectionPoint;
 #endif
 vReflectionWorld=(modelMatrix*reflectionPoint).xyz;
 transformed.x+=sin(vReflectionWorld.y*13.+vReflectionWorld.z*3.+uReflectionTime)*.018;`);
 shader.vertexShader='uniform float uReflectionTime;\n'+shader.vertexShader;
 shader.fragmentShader='varying vec3 vReflectionWorld;uniform float uReflectionTime;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
 float rippleShade=.8+.2*sin(vReflectionWorld.y*32.+sin(vReflectionWorld.z*7.)*2.+uReflectionTime*1.7);
 gl_FragColor.rgb*=rippleShade*exp(-abs(vReflectionWorld.y)*.085);`);
 };m.customProgramCacheKey=()=> 'wet-reflection-v2'+(m.userData.facadeWallWash?'|facade-wall-wash-v1':'');}
 clonedMats.set(o.material,m)}o.material=clonedMats.get(o.material)}});group.add(mirror);
 const road=makeWetSurface();group.add(road);
 const markings=new THREE.MeshBasicMaterial({color:'#a4adb3',transparent:true,opacity:.48,depthWrite:false});for(let z=-25;z<=25;z+=2.5)if(Math.abs(z)>4)box(group,.1,.009,1.0,0,.005,z,markings);for(let x=-20;x<=20;x+=2.4)if(Math.abs(x)>5)box(group,1,.009,.1,x,.005,0,markings);for(const z of [-3.3,3.3])for(let x=-3.6;x<=3.6;x+=.85)box(group,.5,.01,1.2,x,.01,z,markings);
 // Fine puddle streaks break up the mirror without obscuring the street.
 const streakMat=new THREE.MeshBasicMaterial({color:'#355b79',transparent:true,opacity:.12,depthWrite:false});for(let i=0;i<170;i++){const x=(rng()-.5)*38,z=(rng()-.5)*48;if(Math.abs(x)<4.6||Math.abs(z)<2.7)box(group,.1+rng()*.6,.003,.016+rng()*.025,x,.024,z,streakMat)}
 for(const side of [-1,1])for(const z of [-20,-2.7,2.7,20]){box(group,.06,3.1,.06,side*4.7,1.55,z,metal);box(group,.55,.09,.25,side*4.45,3.13,z,lights[0]);const l=new THREE.PointLight('#75e6e7',17,9.5,2);l.position.set(side*4.4,2.7,z);group.add(l)}
 const skyline=new THREE.Group();skyline.name='DistantSkyline';group.add(skyline);for(let i=0;i<30;i++){const x=(i-14.5)*2.8,y=7+rng()*19,z=-30-rng()*13;box(skyline,1.4+rng()*1.2,y,2.2,x,y/2,z,dark);box(skyline,.04,y*.8,.04,x,y*.52,z+1.12,lights[2]);if(i%3===0)box(skyline,.03,2,.03,x,y+1,z,lights[1])}
 batchBoxes(sidewalk);batchBoxes(skyline);const streetDetails=makeStreetDetails({seed});group.add(streetDetails);batchBoxes(streetDetails);const atmosphere=makeRainAtmosphere({seed});group.add(atmosphere);const crowd=makeStreetCrowd({seed}),traffic=makeGroundTraffic({seed});group.add(crowd,traffic);
 const hologram=new THREE.Group();hologram.name='HologramRings';hologram.position.set(0,17,-29);group.add(hologram);for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(5.7-i*.38,.022,5,128,i===1?Math.PI*1.7:Math.PI*2),new THREE.MeshBasicMaterial({color:i===1?'#ff4ec6':'#4bcbec',transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));ring.rotation.z=i;hologram.add(ring)}for(let i=0;i<36;i++){const a=i/36*Math.PI*2;const tick=box(hologram,.045,i%3?.13:.32,.025,Math.sin(a)*5.14,Math.cos(a)*5.14,0,lights[0]);tick.rotation.z=-a}
 group.userData={seed,buildingCount:12,buildings,reflectionDetail,detailBatches,scrollingScreens:textures.filter(t=>t.scroll).map(t=>t.texture),reflection:mirror,hologram,road,atmosphere,streetDetails,crowd,traffic};group.userData.update=seconds=>{reflectionTime.value=seconds;road.userData.update(seconds);atmosphere.userData.update(seconds);streetDetails.userData.update?.(seconds);crowd.userData.update(seconds);traffic.userData.update(seconds);for(const t of textures)if(t.scroll)t.texture.offset.y=(seconds*t.speed)%1;beacons.forEach((b,i)=>b.material.color.setRGB(1,.03,.06).multiplyScalar(.55+.45*Math.sin(seconds*2.7+i)**2));hologram.children[1].rotation.z=seconds*.09;hologram.children[2].rotation.z=-seconds*.065};group.userData.update(0);return group;
}
function makeFlyer({lane=0,radius,height,zRadius,speed,phase,color,center,wobble,scale=1}={}){
 const index=Number.isFinite(Number(lane))?Math.max(0,Math.floor(Number(lane))):0,group=new THREE.Group();group.name='FlyerLane-'+index;const craft=new THREE.Group();craft.name='Vehicle';group.add(craft);const craftColor=color??(index%2?'#ff49b8':'#40f0fa'),bodyMat=new THREE.MeshStandardMaterial({color:'#96aebf',metalness:.58,roughness:.32}),ink=new THREE.MeshStandardMaterial({color:'#24475c',metalness:.55,roughness:.22}),lit=neon(craftColor);
 if(scale!==1)craft.scale.setScalar(scale);
 const orbit={radius:radius??(13+index*1.3),zRadius:zRadius??(18-index),height:height??(7.3+index*2.4),speed:speed??(.16+index*.018),phase:phase??index*1.65,cx:center?.[0]??0,cz:center?.[1]??0,wobble};
 const hull=box(craft,.66,.26,1.6,0,0,0,bodyMat);hull.rotation.x=.04;const nose=new THREE.Mesh(new THREE.ConeGeometry(.35,.65,4),bodyMat);nose.rotation.x=Math.PI/2;nose.rotation.z=Math.PI/4;nose.position.z=.96;craft.add(nose);box(craft,.43,.23,.61,0,.20,.22,ink);box(craft,1.58,.07,.43,0,-.03,-.28,bodyMat);for(const x of [-.68,.68]){box(craft,.22,.2,.9,x,-.02,-.35,ink);box(craft,.16,.13,.06,x,-.02,-.82,lit);box(craft,.045,.045,.48,x,.09,-.29,lit)}box(craft,.53,.035,.04,0,.04,1.14,neon('#deffff'));
 const updateLowLights=prepareLegacyFlyerLow(craft);
 batchBoxes(craft);
 const detailedFlyer=makeDetailedFlyer(craftColor),prepareView=installDetailModel(craft,detailedFlyer,32);
 const n=110,positions=new Float32Array(n*2*3),colors=new Float32Array(n*2*3),indices=[];for(let i=0;i<n-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(indices);const hue=new THREE.Color(craftColor);
 const trail=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));trail.name='ContinuousTrail';trail.frustumCulled=false;group.add(trail);
 function pointInto(t,out){const angle=t*orbit.speed+orbit.phase,w=orbit.wobble;return out.set(orbit.cx+Math.sin(angle)*orbit.radius,orbit.height+(w===undefined?0:Math.sin(angle*2+index)*.6*w),orbit.cz+Math.cos(angle)*orbit.zRadius+Math.sin(angle*2+index)*(w===undefined?1.8:1.8*w))}
 // The trail evaluates the path 220 times per frame; everything reuses two
 // preallocated vectors so the loop allocates nothing.
 const _p=new THREE.Vector3(),_next=new THREE.Vector3(),_dir=new THREE.Vector3(),_ahead=new THREE.Vector3();
 function point(t){return pointInto(t,new THREE.Vector3())}
 // Per-lane constant tables: the trail's fade and width depend only on the
// segment index, and consecutive vertices step along the orbit by one fixed
// angle, so the whole ribbon can be advanced with angle-addition recurrences
// instead of three trig calls per vertex.
 const fadeTable=new Float32Array(n),widthTable=new Float32Array(n);
 for(let i=0;i<n;i++){const frac=i/(n-1);fadeTable[i]=(1-frac)**1.4;widthTable[i]=.22*(1-frac)+.018;}
 const stepDt=4.6/(n-1);
 group.userData={lane:index,craft,trail,samplePosition:point,prepareView};group.userData.update=seconds=>{
  updateLowLights(seconds);detailedFlyer.userData.updateLights(seconds);
  pointInto(seconds,_p);pointInto(seconds+.05,_ahead);craft.position.copy(_p);craft.lookAt(_ahead);craft.rotateZ(Math.sin(seconds*.2+index)*.09);
  const w=orbit.wobble,speed=orbit.speed,R=orbit.radius,zR=orbit.zRadius,H=orbit.height,cx=orbit.cx,cz=orbit.cz;
  const wobZ=w===undefined?1.8:1.8*w,wobY=w===undefined?0:.6*w,hueR=hue.r,hueG=hue.g,hueB=hue.b;
  const base=(seconds-.28)*speed+orbit.phase;
  let sA=Math.sin(base),cA=Math.cos(base),sW=Math.sin(base*2+index),cW=Math.cos(base*2+index);
  const dA=-stepDt*speed,cdA=Math.cos(dA),sdA=Math.sin(dA),cd2=Math.cos(2*dA),sd2=Math.sin(2*dA);
  let px=cx+sA*R,py=H+sW*wobY,pz=cz+cA*zR+sW*wobZ;
  for(let i=0;i<n;i++){
   const nA=sA*cdA+cA*sdA,nC=cA*cdA-sA*sdA,nW=sW*cd2+cW*sd2,nCW=cW*cd2-sW*sd2;
   const nx=cx+nA*R,ny=H+nW*wobY,nz=cz+nC*zR+nW*wobZ;
   const dx=nx-px,dz=nz-pz,inv=1/Math.sqrt(dx*dx+dz*dz+.0001);
   const dirx=dx*inv,dirz=dz*inv,width=widthTable[i],fade=fadeTable[i];
   let o=i*6;
   positions[o]=px+dirz*width;positions[o+1]=py+.025;positions[o+2]=pz-dirx*width;
   positions[o+3]=px-dirz*width;positions[o+4]=py-.025;positions[o+5]=pz+dirx*width;
   colors[o]=hueR*fade;colors[o+1]=hueG*fade;colors[o+2]=hueB*fade;
   colors[o+3]=hueR*fade;colors[o+4]=hueG*fade;colors[o+5]=hueB*fade;
   sA=nA;cA=nC;sW=nW;cW=nCW;px=nx;py=ny;pz=nz;
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true};group.userData.update(0);return group;
}

// ── 对外接口 ────────────────────────────────────────────────────────
// app shell 只需要前三个。
// makeStreetCrowd / makeStreetDetails / makeGroundTraffic 供角色管理台使用——
// 它需要独立构造老街人物、街具与车辆来并列比对，不加载完整城市。
// 其余顶层函数是块内实现细节。
export { makeCyberBlock, makeFlyer, neon, makeStreetCrowd, makeStreetDetails, makeGroundTraffic };
