import * as THREE from 'three';
import { DISTANT_GROUND_GLSL } from './city-ground-footprint.js';

function randomSequence(seed) {
  let state=seed>>>0;
  return ()=>{state+=0x6D2B79F5;let t=Math.imul(state^state>>>15,state|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}

// Real volumes in three depth bands. Windows stay on the surface shader so
// adding a distant neighbourhood costs boxes, not thousands of window meshes.
function cityMaterial(layer) {
  const material=new THREE.MeshStandardMaterial({color:'#243341',metalness:.28,roughness:.74,fog:false});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uCityLayer={value:layer};
    shader.vertexShader='varying vec3 vDistantWorld; varying vec3 vDistantNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 distantPoint=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        distantPoint=instanceMatrix*distantPoint;
      #endif
      vDistantWorld=(modelMatrix*distantPoint).xyz;
      vDistantNormal=normal;`);
    shader.fragmentShader=`varying vec3 vDistantWorld; varying vec3 vDistantNormal; uniform float uCityLayer;
      float distantHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 facade=abs(vDistantNormal.x)>.5?vDistantWorld.zy:vDistantWorld.xy;
      vec2 cells=facade/vec2(1.38,1.95),cell=floor(cells),f=fract(cells);
      vec2 aa=min(fwidth(cells)*.6,vec2(.23));
      // 屏幕像素密度衰减：单元越小（fwidth→1）窗点对比度越低——远处衰减到
      // 28% 亮度而非归零：消旋转闪烁（幅度∝对比度）且无淡出边界的 popping，
      // 远塔保留一层细腻的窗理纹理而非死平面。
      float cellPx=max(fwidth(cells.x),fwidth(cells.y));
      float detail=.28+.72*smoothstep(.12,.45,cellPx);
      vec2 aperture=smoothstep(vec2(.22)-aa,vec2(.22)+aa,f)*(1.-smoothstep(vec2(.63)-aa,vec2(.63)+aa,f));
      float room=distantHash(cell+floor(vDistantWorld.xz*.071)*13.);
      float light=aperture.x*aperture.y*step(.46,room)*(1.-step(.5,abs(vDistantNormal.y)));
      vec3 tint=mix(vec3(.15,.42,.52),vec3(.84,.46,.18),step(.79,room));
      float office=step(.83,distantHash(vec2(cell.y, floor(facade.x/12.))))*.25;
      totalEmissiveRadiance+=tint*light*detail*(.36+office)*(1.-uCityLayer*.14);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`
      float distanceHaze=smoothstep(130.,660.,length(vDistantWorld-cameraPosition));
      float baseHaze=exp(-max(vDistantWorld.y,0.)*.054)*.86;
      vec3 horizonColor=vec3(.082,.134,.198)+mix(vec3(.052,.096,.118),vec3(.10,.052,.092),smoothstep(-1.,1.,normalize(vDistantWorld-cameraPosition).x*1.35));
      // Silhouettes mix to a target one step darker than the sky so the far
      // skyline stays readable against it instead of dissolving into haze.
      vec3 groundHaze=mix(vec3(.052,.076,.104),horizonColor*.78,smoothstep(150.,540.,length(vec3(vDistantWorld.x,0.,vDistantWorld.z)-cameraPosition)));
      float depthHaze=clamp(.17+distanceHaze*.58+uCityLayer*.10,0.,.86);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,groundHaze,1.-(1.-depthHaze)*(1.-baseHaze));`);
  };
  material.customProgramCacheKey=()=>`megacity-distance-${layer}`;
  return material;
}

export function makeMegacityDistance({seed=7721}={}) {
  const group=new THREE.Group();group.name='MegacityDistance';
  const random=randomSequence(seed),unit=new THREE.BoxGeometry(1,1,1),transform=new THREE.Object3D();
  const buildings=[],layerCounts=[],bounds=new THREE.Box3(),color=new THREE.Color();
  const bands=[{count:68,inner:157,spread:56,height:49},{count:102,inner:243,spread:75,height:70},{count:138,inner:353,spread:84,height:85}];
  bands.forEach((band,layer)=>{
    const masses=[];
    const frontCount=layer===2?42:0;
    for(let i=0;i<band.count+frontCount;i++){
      const front=i>=band.count;
      // The foreground opening sits beyond the normal overview camera, so
      // reverse orbits still see a skyline without blocking the main districts.
      const angle=front?(.735+(i-band.count+.3)/frontCount*.53)*Math.PI:(-.735+(i+.2+random()*.5)/band.count*1.47)*Math.PI;
      const radius=front?610+random()*50:band.inner+random()*band.spread,x=Math.sin(angle)*radius,z=-Math.cos(angle)*radius;
      // Reserve the silhouette and footprint of the headquarters.
      if(layer===0&&Math.abs(x+24)<36&&Math.abs(z+143)<35)continue;
      const w=5+random()*7+layer*1.4,d=5+random()*7+layer;
      const h=12+Math.pow(random(),1.7)*band.height;
      const podium=layer===0?Math.min(10,h*.18):0,c=new THREE.Color().setHSL(.55+random()*.09,.20+random()*.2,.12+random()*.055);
      masses.push({x,y:(h-podium)*.5+podium,z,w,h:h-podium,d,c});
      if(i%3!==0){const capHeight=3+random()*5;masses.push({x:x+w*.12,y:h+capHeight*.5,z,w:w*.55,h:capHeight,d:d*.62,c});}
      if(layer===0)masses.push({x,y:podium*.5,z,w:w+2,h:podium,d:d+2,c});
      buildings.push({x,z,width:w,depth:d,height:h+8,layer});
      bounds.expandByPoint(new THREE.Vector3(x-w/2,0,z-d/2));bounds.expandByPoint(new THREE.Vector3(x+w/2,h+8,z+d/2));
    }
    const batch=new THREE.InstancedMesh(unit,cityMaterial(layer),masses.length);batch.name=`DistantCity-Layer-${layer+1}`;
    masses.forEach((b,i)=>{transform.position.set(b.x,b.y,b.z);transform.scale.set(b.w,b.h,b.d);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);batch.setColorAt(i,b.c);});
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();group.add(batch);layerCounts.push(masses.length);
  });

  // Small light sites bridge the dark space between the volumes. Their layout
  // follows neighbourhood blocks rather than an evenly luminous horizon wall.
  const positions=[],colors=[];
  for(let i=0;i<19000;i++){
    const x=(random()-.5)*930,z=(random()-.64)*780,r=Math.hypot(x,z);
    if(r<142||r>470||(z>70&&Math.abs(x)<130+z*.30))continue;
    const blockX=Math.floor(x/16),blockZ=Math.floor(z/20);
    if((Math.abs(blockX*17+blockZ*7)%11)<4)continue;
    positions.push(x,.07+random()*.05,z);
    color.set(random()>.8?'#ffbe75':random()>.4?'#80c7d2':'#7d8cca').multiplyScalar(.45+random()*.6);colors.push(color.r,color.g,color.b);
  }
  const lightGeometry=new THREE.BufferGeometry();lightGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));lightGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const lightMaterial=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`varying vec3 vLight; varying float vFade; void main(){vec4 p=modelViewMatrix*vec4(position,1.);vLight=color;float raw=180./-p.z;vFade=(1.-smoothstep(160.,650.,-p.z)*.83)*clamp((raw-1.5)/.9,0.,1.);gl_PointSize=clamp(raw,1.,2.3);}`,
    fragmentShader:`varying vec3 vLight; varying float vFade; void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(vLight,a*vFade*.7);}`});
  const lights=new THREE.Points(lightGeometry,lightMaterial);lights.name='DistantCity-LightOcean';group.add(lights);

  const floorMaterial=new THREE.ShaderMaterial({depthWrite:true,toneMapped:false,
    vertexShader:`varying vec3 vGround;void main(){vGround=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vGround,1.);}`,
    fragmentShader:`varying vec3 vGround;${DISTANT_GROUND_GLSL}float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 p=vGround.xz;if(!isDistantCityGround(p))discard;vec2 cellUv=p/vec2(16.,20.);vec2 cell=floor(cellUv);vec2 f=fract(cellUv);float px=max(fwidth(cellUv.x),fwidth(cellUv.y));float linePx=.075/max(px,.0001);float street=(1.-smoothstep(.025,.10,min(min(f.x,1.-f.x),min(f.y,1.-f.y))))*clamp((linePx-1.)/1.5,0.,1.);vec3 col=mix(vec3(.055,.078,.105),vec3(.08,.12,.16),h(cell)*.65);col+=street*vec3(.015,.032,.041);float haze=smoothstep(150.,540.,length(vGround-cameraPosition));gl_FragColor=vec4(mix(col,(vec3(.082,.134,.198)+mix(vec3(.052,.096,.118),vec3(.10,.052,.092),smoothstep(-1.,1.,normalize(vGround-cameraPosition).x*1.35)))*.78,haze),1.);}`});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1100,1100),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.021;floor.name='DistantCity-UrbanGround';group.add(floor);
  group.userData={buildings,layerCounts,lightCount:positions.length/3,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},update(){}};
  return group;
}
