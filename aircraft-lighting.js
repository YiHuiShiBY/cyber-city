import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aircraftParts } from './aircraft-part-layout.js';

const CABINS = {
  'legacy-flyer': { box: [-.158,.145,-.04,.158,.37,.64], floor:.147, width:.29, length:.62, z:.27 },
  cruiser: { box: [-.35,.47,-.08,.35,.94,1.64], floor:.475, width:.65, length:1.54, z:.75 },
  passenger: { box: [-.73,.81,2.50,.73,1.45,3.96], floor:.82, width:1.35, length:1.30, z:3.18 },
  cargo: { box: [-1.06,1.38,5.35,1.06,2.30,7.03], floor:1.40, width:1.94, length:1.55, z:6.13 },
};
const THRUSTERS = {
  'legacy-flyer': { sites:[[-.635,-.016,-.837],[.635,-.016,-.837]], radius:.060, axis:'z', nav:[[-.75,.045,-.39],[.75,.045,-.39]], navRadius:.022 },
  cruiser: { sites:[[-1.05,-.137,-3.779],[1.05,-.137,-3.779]], radius:.139, axis:'z', nav:[[-5.87,.103,-2.59],[5.87,.103,-2.59]], navRadius:.065 },
  passenger: { sites:[[-3.05,-.17,-3.782],[3.05,-.17,-3.782]], radius:.27, axis:'z', nav:[[-6.18,.068,-2.08],[6.18,.068,-2.08]], navRadius:.075 },
  cargo: { sites:[[-5.15,-.015,-7.192],[5.15,-.015,-7.192]], radius:.40, axis:'z', nav:[[-5.80,.43,-2.7],[5.80,.43,-2.7]], navRadius:.11 },
  airship: { sites:[[-4.10/15,-2.72/3.5,-2.70/3.5],[-4.10/15,-2.72/3.5,2.70/3.5]], radius:.071, axis:'x', nav:[[-.47,0,-.48],[-.47,0,.48]], navRadius:.025 },
};

function plain(source) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.deleteAttribute('uv'); geometry.deleteAttribute('uv1');
  return geometry;
}
function painted(geometry, color, role=0, phase=0) {
  const result = plain(geometry); geometry.dispose();
  const count=result.attributes.position.count, tint=new THREE.Color(color), colors=new Float32Array(count*3), glow=new Float32Array(count*4);
  for(let i=0;i<count;i++){tint.toArray(colors,i*3);glow[i*4+2]=role;glow[i*4+3]=phase;}
  result.setAttribute('color',new THREE.BufferAttribute(colors,3));result.setAttribute('aGlow',new THREE.BufferAttribute(glow,4));return result;
}
function ensureGlow(geometry) {
  if(!geometry.attributes.aGlow)geometry.setAttribute('aGlow',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*4),4));
  return geometry;
}
function join(parts, glow=false) {
  const normalized=parts.filter(Boolean).map(part=>{const g=plain(part);part.dispose();if(glow)ensureGlow(g);else g.deleteAttribute('aGlow');return g;});
  const result=mergeGeometries(normalized);normalized.forEach(g=>g.dispose());result.computeBoundingBox();result.computeBoundingSphere();return result;
}
function cuboid(x,y,z,w,h,d,color) {return painted(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color);}

// Split only authored pressure-shell triangles. This is real mesh clipping, so
// CPU picking and the visible openings agree without a shader-discard exception.
function cutTriangle(vertices, box) {
  let inside=vertices;const outside=[];
  for(let axis=0;axis<3;axis++)for(const lower of [true,false]){
    if(!inside.length)return outside;
    const value=box[axis+(lower?0:3)],distance=v=>(v[axis]-value)*(lower?1:-1);
    const keep=[],reject=[];
    for(let i=0;i<inside.length;i++){
      const a=inside[i],b=inside[(i+1)%inside.length],da=distance(a),db=distance(b);
      (da>=0?keep:reject).push(a);
      if((da>=0)!==(db>=0)){const t=da/(da-db),hit=a.map((v,j)=>v+(b[j]-v)*t);keep.push(hit);reject.push(hit);}
    }
    if(reject.length>=3)outside.push(reject);inside=keep;
  }
  return outside;
}
function clipped(geometry, cutters, ranges=null, remove=[]) {
  const input=plain(geometry),p=input.attributes.position,n=input.attributes.normal,c=input.attributes.color;
  const positions=[],normals=[],colors=[];
  for(let i=0;i<p.count;i+=3){
    if(remove.some(range=>i>=range.start&&i<range.start+range.count))continue;
    let polygons=[[0,1,2].map(k=>[p.getX(i+k),p.getY(i+k),p.getZ(i+k),n.getX(i+k),n.getY(i+k),n.getZ(i+k),c.getX(i+k),c.getY(i+k),c.getZ(i+k)])];
    if(!ranges||ranges.some(range=>i>=range.start&&i<range.start+range.count))for(const box of cutters){
      polygons=polygons.flatMap(poly=>{
        if([0,1,2].some(axis=>Math.max(...poly.map(v=>v[axis]))<box[axis]||Math.min(...poly.map(v=>v[axis]))>box[axis+3]))return[poly];
        return cutTriangle(poly,box);
      });
    }
    for(const polygon of polygons)for(let k=1;k<polygon.length-1;k++){
      const tri=[polygon[0],polygon[k],polygon[k+1]],a=new THREE.Vector3(...tri[1].slice(0,3)).sub(new THREE.Vector3(...tri[0].slice(0,3))),b=new THREE.Vector3(...tri[2].slice(0,3)).sub(new THREE.Vector3(...tri[0].slice(0,3)));
      if(a.cross(b).lengthSq()<1e-20)continue;
      for(const v of tri){positions.push(...v.slice(0,3));const normal=new THREE.Vector3(...v.slice(3,6)).normalize();normals.push(...normal);colors.push(...v.slice(6,9));}
    }
  }
  input.dispose();const result=new THREE.BufferGeometry();
  for(const[name,values]of[['position',positions],['normal',normals],['color',colors]])result.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
  return result;
}
function extract(geometry,ranges) {
  const input=plain(geometry),result=new THREE.BufferGeometry();
  for(const name of ['position','normal','color']){const source=input.attributes[name].array,values=[];for(const range of ranges)values.push(...source.slice(range.start*3,(range.start+range.count)*3));result.setAttribute(name,new THREE.Float32BufferAttribute(values,3));}
  input.dispose();return result;
}
function windowParts(id,low=false){
  // Distant gondolas retain their original compact envelope; detailed bridge
  // window coordinates belong only to the larger Blender gondola.
  if(low&&id==='airship')return[-1,1].map(side=>({name:'Distant gondola pane',min:[-.044,-1.24,side*.133],max:[.044,-1.12,side*.133]}));
  return aircraftParts[id].parts.filter(p=>/recessed glass|InsetWindow|ForwardWindshield/i.test(p.name));
}
function apertures(id,low=false) {
  const result=CABINS[id]?[CABINS[id].box]:[];
  for(const pane of windowParts(id,low)){
    const min=pane.min.slice(),max=pane.max.slice(),center=min.map((v,i)=>(v+max[i])*.5);
    if(id==='passenger'){min[0]=Math.sign(center[0])>0?1.04:-1.72;max[0]=Math.sign(center[0])>0?1.72:-1.04;min[1]+=.010;max[1]-=.010;min[2]+=.015;max[2]-=.015;}
    else if(/ForwardWindshield/.test(pane.name)){min[0]=.10;max[0]=.21;min[1]+=.006;max[1]-=.006;min[2]+=.004;max[2]-=.004;}
    else {min[0]+=.003;max[0]-=.003;min[1]+=.005;max[1]-=.005;min[2]=center[2]>0?.055:-.29;max[2]=center[2]>0?.29:-.055;}
    result.push([...min,...max]);
  }
  return result;
}
function cabinContents(id,low=false){
  const body=[],lights=[],cab=CABINS[id];
  if(cab){
    const {floor:y,width:w,length:d,z}=cab,h=Math.max(.045,w*.21);
    body.push(cuboid(0,y,z,w,.012,d,'#314550'));
    for(const side of low?[0]:[-1,1]){
      const x=side*w*.24;
      body.push(cuboid(x,y+h*.42,z-d*.19,w*(low?.45:.30),h*.75,d*.22,'#526470'));
      if(!low)body.push(cuboid(x,y+h*.95,z-d*.29,w*.29,h*1.20,d*.08,'#72818a'));
    }
    lights.push(cuboid(0,y+h*.65,z+d*.29,w*.68,Math.max(.005,w*.018),d*.055,'#8fe9ec'));
    if(!low)for(const side of [-1,1])lights.push(cuboid(side*w*.43,y+h*.2,z,w*.025,w*.02,d*.83,'#ffd9a1'));
  }
  if(id==='airship'||(!low&&id==='passenger'))for(const[paneIndex,pane]of windowParts(id,low).entries()){
    const center=pane.min.map((v,i)=>(v+pane.max[i])*.5),size=pane.max.map((v,i)=>v-pane.min[i]);
    if(id==='airship'&&/ForwardWindshield/.test(pane.name))continue;
    if(id==='passenger'){
      const sign=Math.sign(center[0]);lights.push(cuboid(sign*1.08,center[1]+size[1]*.30,center[2],.024,size[1]*.085,size[2]*.73,paneIndex%4?'#ffe0ac':'#b1ebef'));
      body.push(cuboid(sign*.91,center[1]-.05,center[2],.15,.24,size[2]*.6,'#59707c'));
    }else{
      const sign=Math.sign(center[2]),tint=paneIndex%4?'#ffdaa0':'#a5e4e9';
      lights.push(low
        ? painted(new THREE.PlaneGeometry(size[0]*.73,size[1]*.10).translate(center[0],center[1]+size[1]*.30,sign*.085),tint)
        : cuboid(center[0],center[1]+size[1]*.30,sign*.143,size[0]*.73,size[1]*.10,.005,tint));
      if(!low)body.push(cuboid(center[0],center[1]-.018,sign*.116,size[0]*.63,size[1]*.48,.017,'#5b7280'));
    }
  }
  return{body,lights};
}
function glowPlane(site,radius,axis,color,role,phase){
  const geometry=painted(new THREE.PlaneGeometry(radius*2,radius*2),color,role,phase),p=geometry.attributes.position,a=geometry.attributes.aGlow;
  for(let i=0;i<p.count;i++)a.setXY(i,p.getX(i)/radius,p.getY(i)/radius);
  if(axis==='x')geometry.rotateY(-Math.PI/2);else if(axis==='y')geometry.rotateX(-Math.PI/2);else geometry.rotateY(Math.PI);
  geometry.translate(...site);return geometry;
}
function lightEffects(id,low=false){
  const spec=THRUSTERS[id],parts=[];
  for(const[i,site]of spec.sites.entries()){
    parts.push(glowPlane(site,spec.radius,spec.axis,'#92efff',3,i*.8));
    parts.push(glowPlane(site,spec.radius*1.44,spec.axis,'#4cb6e0',1,i*.8));
  }
  for(const[i,site]of spec.nav.entries())parts.push(glowPlane(site,spec.navRadius,'y',i?'#89f1c5':'#ff967b',2,i*1.8));
  return parts;
}

export function enhanceAircraftGeometry(id,layers,{low=false}={}){
  const layout=aircraftParts[id];
  for(const[name,geometry]of Object.entries(layers))if(!geometry.attributes.color){
    const color=new THREE.Color(name==='body'?'#819db1':'#ffffff'),values=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<values.length;i+=3)color.toArray(values,i);geometry.setAttribute('color',new THREE.BufferAttribute(values,3));
  }
  if(!low)for(const[name,geometry]of Object.entries(layers))if((geometry.index?.count||geometry.attributes.position.count)!==layout.indexCounts[name])throw new Error(`Regenerate aircraft-part-layout.js after editing ${id}/${name}`);
  const panes=layout.parts.filter(p=>p.layer==='body'&&/cockpit_glazing|InsetWindow|ForwardWindshield/.test(p.name));
  const shells=layout.parts.filter(p=>/pressure.hull|variable_section_fuselage|command module|LowerPressureCabin|UpperBridge|WindowGasket/.test(p.name));
  const inside=cabinContents(id,low),cuts=low&&id!=='airship'?(CABINS[id]?[CABINS[id].box]:[]):apertures(id,low);
  const body=clipped(layers.body,cuts,low?null:shells,low?[]:panes),glass=[];
  if(layers.glass)glass.push(layers.glass.clone());
  if(!low&&panes.length)glass.push(extract(layers.body,panes));
  if(low&&id==='airship')for(const pane of windowParts(id,true)){
    const center=pane.min.map((v,i)=>(v+pane.max[i])*.5),size=pane.max.map((v,i)=>v-pane.min[i]);
    let g=new THREE.PlaneGeometry(size[0],size[1]);
    if(/ForwardWindshield/.test(pane.name))g=new THREE.PlaneGeometry(size[2],size[1]).rotateY(Math.PI/2);
    else if(center[2]<0)g.rotateY(Math.PI);
    glass.push(painted(g.translate(...center),'#8ab9c9'));
  }
  const result={body:join([body,...inside.body]),lights:join([layers.lights.clone(),...inside.lights,...lightEffects(id,low)],true)};
  if(glass.length)result.glass=join(glass);
  for(const geometry of Object.values(layers))geometry.dispose();
  for(const geometry of Object.values(result))geometry.userData={asset:id,cabinOpenings:true,authoring:'Blender source with runtime cabin fittings'};
  return result;
}

export function makeAircraftGlassMaterial(){
  const material=new THREE.MeshPhysicalMaterial({color:'#8cc3d1',metalness:.05,roughness:.10,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  material.name='AircraftClearGlazing';
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float aircraftFacing=abs(dot(normalize(normal),normalize(vViewPosition)));
    diffuseColor.a*=.34+.66*pow(1.-aircraftFacing,3.);
    #include <opaque_fragment>`);};
  material.customProgramCacheKey=()=> 'aircraft-clear-glazing-v1';return material;
}
export function makeAircraftLightMaterial(color='#ffffff'){
  const uniforms={uAircraftTime:{value:0},uAircraftLightLevel:{value:1}};
  const material=new THREE.MeshBasicMaterial({color,vertexColors:true,toneMapped:false,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,blending:THREE.AdditiveBlending});
  material.name='AircraftLayeredLights';material.uniforms=uniforms;
  material.onBeforeCompile=function(shader){Object.assign(shader.uniforms,this.uniforms||uniforms);
    shader.vertexShader='attribute vec4 aGlow;varying vec4 vAircraftGlow;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAircraftGlow=aGlow;');
    shader.fragmentShader='uniform float uAircraftTime,uAircraftLightLevel;varying vec4 vAircraftGlow;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float role=vAircraftGlow.z,r=length(vAircraftGlow.xy),pulse=.90+.10*sin(uAircraftTime*1.7+vAircraftGlow.w);
      float energy=1.8,coverage=1.;
      if(role>.5){
        if(r>1.)discard;
        if(role<1.5){coverage=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r))*.44;energy=2.5;}
        else if(role<2.5){coverage=1.-smoothstep(.48,1.,r);energy=1.1+2.6*pow(max(0.,cos(uAircraftTime*2.6+vAircraftGlow.w)),14.);}
        else{coverage=(1.-smoothstep(.65,1.,r))*.74;energy=3.2;}
      }
      diffuseColor.rgb*=energy*pulse*uAircraftLightLevel;diffuseColor.a*=coverage;`);
  };
  material.customProgramCacheKey=()=> 'aircraft-layered-lights-v1';return material;
}
export function updateAircraftLights(material,seconds){material.uniforms.uAircraftTime.value=Number.isFinite(seconds)?seconds:0;}

/** Legacy low model is still the original factory geometry, regrouped once. */
export function prepareLegacyFlyerLow(craft){
  const layers={body:[],glass:[],lights:[]},oldMaterials=new Set();
  for(const mesh of [...craft.children]){
    if(!mesh.isMesh)continue;mesh.updateMatrix();const material=mesh.material;
    const pane=Math.abs(mesh.position.y-.20)<1e-5&&Math.abs(mesh.position.z-.22)<1e-5;
    const layer=pane?'glass':material.emissiveIntensity>1?'lights':'body';
    const g=painted(mesh.geometry.clone().applyMatrix4(mesh.matrix),material.color||'#ffffff');layers[layer].push(g);
    mesh.geometry.dispose();oldMaterials.add(material);craft.remove(mesh);
  }
  oldMaterials.forEach(material=>material.dispose());
  const geometry=enhanceAircraftGeometry('legacy-flyer',Object.fromEntries(Object.entries(layers).map(([key,parts])=>[key,join(parts)])),{low:true});
  const light=makeAircraftLightMaterial();
  for(const[layer,material]of[['body',new THREE.MeshStandardMaterial({vertexColors:true,metalness:.48,roughness:.36})],['glass',makeAircraftGlassMaterial()],['lights',light]]){
    const mesh=new THREE.Mesh(geometry[layer],material);mesh.name=`Flyer-Low-${layer}`;if(layer==='glass')mesh.renderOrder=3;craft.add(mesh);
  }
  return seconds=>updateAircraftLights(light,seconds);
}
