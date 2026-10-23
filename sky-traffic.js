import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSkyTrafficDetails } from './sky-traffic-details.js';
import { enhanceAircraftGeometry, makeAircraftGlassMaterial, makeAircraftLightMaterial, updateAircraftLights } from './aircraft-lighting.js';

const TAU = Math.PI * 2;
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

/** Three deliberately different aircraft silhouettes share ten render batches. */
export function makeSkyTraffic({ buildings = [], obstacles = [] } = {}) {
  const group = new THREE.Group(); group.name = 'SkyTraffic';
  const colors = { pearl:'#91acb9', silver:'#758f9f', steel:'#506777', dark:'#1c3542', glass:'#153844', cyan:'#8bced8', amber:'#c3a074', teal:'#56797f' };
  function painted(geometry, tint) {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    const color = new THREE.Color(tint), count = plain.attributes.position.count, values = new Float32Array(count * 3);
    for (let i=0;i<count;i++) values.set([color.r,color.g,color.b],i*3);
    plain.setAttribute('color',new THREE.BufferAttribute(values,3));
    if (!plain.attributes.uv) plain.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
    return plain;
  }
  function box(w,h,d,x,y,z,color) { return painted(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color); }
  function panel(w,h,x,y,z,axis,color) {
    const geometry=new THREE.PlaneGeometry(w,h);
    if(axis==='x')geometry.rotateY(Math.PI/2);
    if(axis==='y')geometry.rotateX(-Math.PI/2);
    return painted(geometry.translate(x,y,z),color);
  }
  function prism(points,height,y,color) {
    const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
    return painted(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1,steps:1}).rotateX(-Math.PI/2).translate(0,y-height/2,0),color);
  }
  function fin(x,y,z,height,color) {
    const shape=new THREE.Shape([new THREE.Vector2(-.95,0),new THREE.Vector2(.86,0),new THREE.Vector2(-.48,height)]);
    return painted(new THREE.ExtrudeGeometry(shape,{depth:.17,bevelEnabled:false,steps:1}).rotateY(Math.PI/2).translate(x-.085,y,z),color);
  }
  function loft(stations,color,bevel=true) {
    const vertices=[],indices=[],count=bevel?8:4;
    for(const [z,w,low,high] of stations){
      const edge=Math.min(.23,(high-low)*.22);
      const section=bevel?[[-w,low+edge],[-w+edge,low],[w-edge,low],[w,low+edge],[w,high-edge],[w-edge,high],[-w+edge,high],[-w,high-edge]]:[[-w,low],[w,low],[w,high],[-w,high]];
      for(const [x,y] of section)vertices.push(x,y,z);
    }
    for(let row=0;row<stations.length-1;row++)for(let edge=0;edge<count;edge++){
      const a=row*count+edge,b=row*count+(edge+1)%count;indices.push(a,b,a+count,b,b+count,a+count);
    }
    for(let end=0;end<2;end++)for(let edge=1;edge<count-1;edge++){
      const start=end?(stations.length-1)*count:0;
      if(end)indices.push(start,start+edge,start+edge+1);else indices.push(start,start+edge+1,start+edge);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return painted(geometry,color);
  }
  function merge(parts) { const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();return geometry; }

  function passengerModel() {
    const body=[loft([[-5.65,.43,-.20,.35],[-4.3,1.13,-.60,.78],[-1.6,1.47,-.72,1.10],[2.8,1.36,-.55,1.08],[4.65,.84,-.25,.70],[5.75,.13,.03,.27]],colors.pearl)];
    body.push(prism([[-6.4,-2.05],[-2.0,1.65],[2.0,1.65],[6.4,-2.05],[4.85,-3.05],[-4.85,-3.05]],.23,-.13,colors.silver));
    body.push(prism([[-3.15,-4.3],[-.80,-3.6],[.80,-3.6],[3.15,-4.3],[2.45,-5.25],[-2.45,-5.25]],.18,.27,colors.steel));
    for(const side of [-1,1]){
      body.push(loft([[-3.72,.51,-.61,.18],[-2.9,.57,-.71,.30],[-.60,.47,-.55,.30]],colors.dark).translate(side*3.05,0,0));
      body.push(fin(side*.74,.47,-4.05,1.47,colors.silver));
    }
    const glass=[loft([[2.15,1.12,1.03,1.10],[3.40,.95,.88,1.29],[4.38,.63,.67,.72]],colors.glass,false)];
    for(const side of [-1,1])glass.push(panel(6.70,.36,side*1.485,.56,-.70,'x',colors.glass));
    const lights=[];
    for(const side of [-1,1]){
      for(let window=0;window<8;window++)lights.push(panel(.32,.23,side*1.496,.58,-3.40+window*.72,'x',window%4===0?'#c3b494':'#78bac8'));
      lights.push(panel(.71,.25,side*3.05,-.15,-3.731,'z','#8fdfed'));
      lights.push(panel(.30,.13,side*6.32,.025,-2.12,'y',side>0?'#a8d4cc':'#cd9d84'));
      lights.push(panel(.17,.13,side*.23,.24,5.72,'z','#d5e7dc'));
    }
    return {body:merge(body),glass:merge(glass),lights:merge(lights),trailRear:5.75,trailWidth:.34,trailAge:1.3};
  }
  function cargoModel() {
    const body=[box(1.65,1.20,14.9,0,.42,-.40,colors.steel),loft([[4.1,1.50,-.60,1.55],[6.2,1.59,-.25,2.10],[8.35,.71,.05,.97]],colors.silver,false)];
    for(let bay=0;bay<3;bay++)for(const side of [-1,1]){
      const z=2.7-bay*3.85,color=bay===1?'#a0835b':side>0?'#657d87':'#617c78';
      body.push(box(2.70,2.35,3.18,side*2.1,-.60,z,color));
      body.push(box(2.88,.22,.33,side*2.1,.68,z-1.17,colors.steel));
      body.push(box(.16,2.55,3.27,side*3.46,-.60,z,colors.dark));
    }
    for(const z of [-4.9,2.3])body.push(box(11.35,.42,.80,0,.46,z,colors.silver));
    for(const side of [-1,1]){
      body.push(loft([[-7.13,.66,-.61,.44],[-5.95,.86,-.76,.74],[1.87,.63,-.55,.53]],colors.dark).translate(side*5.15,0,0));
      body.push(fin(side*1.13,.80,-5.52,1.87,colors.silver));
    }
    const glass=[loft([[5.1,1.40,1.40,1.65],[6.1,1.47,1.52,2.17],[7.71,.84,.94,1.27]],colors.glass,false)];
    const lights=[];
    for(const side of [-1,1]){
      lights.push(panel(1.04,.50,side*5.15,-.09,-7.145,'z','#79b9cd'));
      lights.push(panel(.49,.21,side*.63,.53,8.23,'z','#d2dbbd'));
      lights.push(panel(6.8,.12,side*5.80,.40,-2.37,'x','#527e90'));
      for(let bay=0;bay<3;bay++)lights.push(panel(.80,.15,side*3.552,.16,2.7-bay*3.85,'x','#c9a06b'));
    }
    return {body:merge(body),glass:merge(glass),lights:merge(lights),trailRear:7.2,trailWidth:.49,trailAge:2.2};
  }
  function cruiserModel() {
    const body=[prism([[-6.10,-2.75],[-1.22,3.45],[0,4.23],[1.22,3.45],[6.10,-2.75],[2.71,-1.81],[1.1,-3.70],[-1.1,-3.70],[-2.71,-1.81]],.19,-.025,'#758f9c')];
    body.push(loft([[-3.91,.50,-.25,.22],[-1.50,.83,-.40,.66],[1.64,.63,-.15,.67],[4.18,.06,.02,.18]],colors.silver));
    for(const side of [-1,1]){
      body.push(box(.59,.46,1.65,side*1.05,-.22,-2.80,colors.dark));
      body.push(fin(side*1.13,.12,-2.71,.97,colors.steel));
    }
    const glass=[loft([[-.33,.48,.55,.70],[.65,.49,.62,.90],[2.0,.26,.38,.43]],colors.glass,false)];
    const lights=[];
    for(const side of [-1,1]){
      lights.push(panel(.45,.20,side*1.05,-.18,-3.635,'z','#87c8d7'));
      lights.push(panel(.26,.11,side*5.93,.08,-2.61,'y','#abc4d0'));
      lights.push(panel(.09,1.45,side*.95,.082,-1.34,'y','#537f8b'));
    }
    return {body:merge(body),glass:merge(glass),lights:merge(lights),trailRear:4.00,trailWidth:.23,trailAge:1.45};
  }
  const models={passenger:passengerModel(),cargo:cargoModel(),cruiser:cruiserModel()};
  for(const [kind,model] of Object.entries(models))Object.assign(model,enhanceAircraftGeometry(kind,{body:model.body,glass:model.glass,lights:model.lights},{low:true}));
  const detailedModels=makeSkyTrafficDetails(models);
  const kindCounts={passenger:8,cargo:6,cruiser:10};
  const passengers={halfX:81,halfZ:83,radius:23,speed:7.6,height:59.5};
  const straightX=(passengers.halfX-passengers.radius)*2,straightZ=(passengers.halfZ-passengers.radius)*2,arcLength=passengers.radius*Math.PI/2;
  const passengerLength=2*straightX+2*straightZ+4*arcLength;
  const passengerSegments=[
    {kind:'line',x:-58,z:83,tx:1,tz:0,length:straightX},{kind:'arc',x:58,z:60,angle:0,length:arcLength},
    {kind:'line',x:81,z:60,tx:0,tz:-1,length:straightZ},{kind:'arc',x:58,z:-60,angle:Math.PI/2,length:arcLength},
    {kind:'line',x:58,z:-83,tx:-1,tz:0,length:straightX},{kind:'arc',x:-58,z:-60,angle:Math.PI,length:arcLength},
    {kind:'line',x:-81,z:-60,tx:0,tz:1,length:straightZ},{kind:'arc',x:-58,z:60,angle:Math.PI*1.5,length:arcLength},
  ];
  let start=0;for(const segment of passengerSegments){segment.start=start;start+=segment.length;}
  function samplePassenger(distance){
    const s=mod(distance,passengerLength),segment=passengerSegments.find(item=>s<item.start+item.length)||passengerSegments[0],along=s-segment.start;
    if(segment.kind==='line')return{x:segment.x+segment.tx*along,z:segment.z+segment.tz*along,tx:segment.tx,tz:segment.tz};
    const angle=segment.angle+along/passengers.radius;return{x:segment.x+Math.sin(angle)*passengers.radius,z:segment.z+Math.cos(angle)*passengers.radius,tx:Math.cos(angle),tz:-Math.sin(angle)};
  }
  const vehicles=[];
  for(let index=0;index<8;index++)vehicles.push({kind:'passenger',modelIndex:index,phase:(index+.27)/8*passengerLength,period:passengerLength/passengers.speed,speed:passengers.speed,altitude:passengers.height});
  for(let index=0;index<6;index++)vehicles.push({kind:'cargo',modelIndex:index,phase:TAU*index/6+.30,period:TAU/.019,angularSpeed:-.019,altitude:118+(index%2)*6,speed:2.05});
  const formation=[{right:0,forward:0},{right:-8,forward:-11},{right:8,forward:-11},{right:-16,forward:-22},{right:16,forward:-22}];
  for(let index=0;index<10;index++)vehicles.push({kind:'cruiser',modelIndex:index,formation:Math.floor(index/5),slot:index%5,offset:formation[index%5],phase:.44+Math.floor(index/5)*Math.PI,period:TAU/.195,angularSpeed:.195,altitude:46+Math.floor(index/5)*.25,speed:6.1});
  for(let index=0;index<vehicles.length;index++){
    const vehicle=vehicles[index],model=models[vehicle.kind],bounds=new THREE.Box3();
    for(const geometry of [model.body,model.glass,model.lights]){geometry.computeBoundingBox();bounds.union(geometry.boundingBox);}
    vehicle.index=index;vehicle.id=`${vehicle.kind}-${vehicle.modelIndex+1}`;
    vehicle.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};vehicle.size=bounds.getSize(new THREE.Vector3()).toArray();
    vehicle.collision={center:bounds.getCenter(new THREE.Vector3()).toArray(),halfExtents:vehicle.size.map(value=>value/2)};
  }
  function sampleVehicle(index,seconds=0){
    const vehicle=vehicles[mod(Math.trunc(Number.isFinite(index)?index:0),vehicles.length)],time=Number.isFinite(seconds)?mod(seconds,vehicle.period):0;
    let x,y,z,yaw,pitch=0,roll=0,phase;
    if(vehicle.kind==='passenger'){
      const distance=vehicle.phase+time*passengers.speed,p=samplePassenger(distance);phase=distance/passengerLength*TAU;
      x=p.x;z=p.z;y=vehicle.altitude+Math.sin(phase*2)*.28;yaw=Math.atan2(p.tx,p.tz);
      pitch=-Math.atan(.56*TAU/passengerLength*Math.cos(phase*2));roll=Math.sin(phase)*.026;
    }else if(vehicle.kind==='cargo'){
      phase=vehicle.phase+time*vehicle.angularSpeed;
      x=Math.sin(phase)*111;z=-1+Math.cos(phase)*97;y=vehicle.altitude+Math.sin(phase*2)*.55;
      yaw=Math.atan2(-111*Math.cos(phase),97*Math.sin(phase));
      pitch=Math.atan2(1.1*Math.cos(phase*2),Math.hypot(111*Math.cos(phase),97*Math.sin(phase)));roll=Math.sin(phase)*.018;
    }else{
      phase=vehicle.phase+time*vehicle.angularSpeed;
      const dx=34*Math.cos(phase),dz=-29*Math.sin(phase),speed=Math.hypot(dx,dz),tx=dx/speed,tz=dz/speed;
      x=34*Math.sin(phase)+tz*vehicle.offset.right+tx*vehicle.offset.forward;
      z=29*Math.cos(phase)-tx*vehicle.offset.right+tz*vehicle.offset.forward;
      y=vehicle.altitude+Math.sin(phase*2)*.20;yaw=Math.atan2(tx,tz);
      pitch=-Math.atan2(.4*Math.cos(phase*2),speed);roll=-.070;
    }
    return {x,y,z,yaw,pitch,roll,phase,index:vehicle.index,id:vehicle.id,kind:vehicle.kind,period:vehicle.period,fade:1};
  }
  const bodyMaterial=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.38,roughness:.43,emissive:'#2c4556',emissiveIntensity:.12});
  const glassMaterial=makeAircraftGlassMaterial();
  const lightMaterial=makeAircraftLightMaterial();
  const batches=[];
  for(const [kind,model] of Object.entries(models))for(const [layer,material] of [['body',bodyMaterial],['glass',glassMaterial],['lights',lightMaterial]]){
    const mesh=new THREE.InstancedMesh(detailedModels[kind][layer],material,kindCounts[kind]);mesh.name=`SkyTraffic-${kind}-${layer}`;
    if(layer==='glass')mesh.renderOrder=3;
    mesh.userData.detailGeometries=[detailedModels[kind][layer],model[layer]];
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);batches.push({mesh,kind});
  }
  const trailSteps=9,trailPositions=new Float32Array(vehicles.length*trailSteps*2*3),trailColors=new Float32Array(trailPositions.length),trailIndices=[];
  const palette={passenger:new THREE.Color('#5297a4'),cargo:new THREE.Color('#758c9c'),cruiser:new THREE.Color('#6b90a4')};
  for(const vehicle of vehicles)for(let step=0;step<trailSteps;step++){
    const fade=Math.pow(1-step/(trailSteps-1),1.7),tint=palette[vehicle.kind],base=(vehicle.index*trailSteps+step)*6;
    for(const offset of [0,3])trailColors.set([tint.r*fade,tint.g*fade,tint.b*fade],base+offset);
    if(step<trailSteps-1){const v=(vehicle.index*trailSteps+step)*2;trailIndices.push(v,v+1,v+2,v+1,v+3,v+2);}
  }
  const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3).setUsage(THREE.DynamicDrawUsage));trailGeometry.setAttribute('color',new THREE.BufferAttribute(trailColors,3));trailGeometry.setIndex(trailIndices);
  const trails=new THREE.Mesh(trailGeometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.31,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false}));
  trails.name='SkyTraffic-ShortTrails';trails.frustumCulled=false;group.add(trails);
  const transform=new THREE.Object3D();transform.rotation.order='YXZ';
  // Kind -> batches lookup: each vehicle writes to its three meshes directly
  // instead of scanning the whole batch list by kind string every frame.
  const batchesByKind={};
  for(const batch of batches)(batchesByKind[batch.kind]??=[]).push(batch);
  const detailLevels={passenger:'high',cargo:'high',cruiser:'high'};
  const detailRange={passenger:34,cargo:43,cruiser:28};
  const detailEye=new THREE.Vector3(),detailCenter=new THREE.Vector3(),detailProjection=new THREE.Vector3(),detailMatrix=new THREE.Matrix4();
  function prepareView(camera){
    camera.updateMatrixWorld(true);camera.getWorldPosition(detailEye);group.updateWorldMatrix(true,false);
    for(const kind of Object.keys(kindCounts)){
      const limit=detailRange[kind]*(camera.zoom||1)*(detailLevels[kind]==='high'?1.16:1);
      const mesh=batchesByKind[kind][0].mesh;
      let near=false;
      for(let index=0;index<mesh.count&&!near;index++){
        mesh.getMatrixAt(index,detailMatrix);detailCenter.setFromMatrixPosition(detailMatrix).applyMatrix4(group.matrixWorld);
        if(detailCenter.distanceTo(detailEye)>limit)continue;
        detailProjection.copy(detailCenter).project(camera);
        near=Math.abs(detailProjection.x)<1.25&&Math.abs(detailProjection.y)<1.25&&Math.abs(detailProjection.z)<1;
      }
      const next=near?'high':'low';
      if(next!==detailLevels[kind]){
        for(const batch of batchesByKind[kind]){
          const geometry=batch.mesh.userData.detailGeometries[next==='high'?0:1];
          batch.mesh.geometry=geometry;batch.mesh.boundingBox=null;batch.mesh.boundingSphere=null;
        }
        detailLevels[kind]=next;
      }
    }
    const levels=Object.values(detailLevels);group.userData.modelDetail=levels.every(level=>level===levels[0])?levels[0]:'mixed';
  }
  function update(seconds=0){
    updateAircraftLights(lightMaterial,seconds);
    for(const vehicle of vehicles){
      const p=sampleVehicle(vehicle.index,seconds);transform.position.set(p.x,p.y,p.z);transform.rotation.set(p.pitch,p.yaw,p.roll,'YXZ');transform.updateMatrix();
      for(const batch of batchesByKind[vehicle.kind])batch.mesh.setMatrixAt(vehicle.modelIndex,transform.matrix);
      const model=models[vehicle.kind];
      for(let step=0;step<trailSteps;step++){
        const f=step/(trailSteps-1),q=sampleVehicle(vehicle.index,seconds-f*model.trailAge),fx=Math.sin(q.yaw),fz=Math.cos(q.yaw),width=model.trailWidth*(1-f)+.015,base=(vehicle.index*trailSteps+step)*6;
        const x=q.x-fx*model.trailRear,z=q.z-fz*model.trailRear,y=q.y-.16;
        trailPositions.set([x+fz*width,y,z-fx*width,x-fz*width,y,z+fx*width],base);
      }
    }
    for(const batch of batches)batch.mesh.instanceMatrix.needsUpdate=true;trailGeometry.attributes.position.needsUpdate=true;
  }
  function normalizeObstacle(item){
    const bounds=item?.bounds||item;
    if(Array.isArray(bounds?.min)&&Array.isArray(bounds?.max))return {min:bounds.min.slice(),max:bounds.max.slice()};
    if(![item?.x,item?.z,item?.width,item?.depth,item?.height].every(Number.isFinite))return null;
    const base=Number.isFinite(item.base)?item.base:0;
    return {min:[item.x-item.width/2,base,item.z-item.depth/2],max:[item.x+item.width/2,base+item.height,item.z+item.depth/2]};
  }
  const obstacleVolumes=[...buildings,...obstacles].map(normalizeObstacle).filter(Boolean);
  group.userData={vehicles,kindCounts,sampleVehicle,update,prepareView,detailLevels,modelDetail:'high',obstacles:obstacleVolumes,batchCount:group.children.length,
    routes:{passenger:{...passengers,length:passengerLength,segments:passengerSegments},cargo:{radius:111,zRadius:97,center:[0,-1],altitudes:[118,124]},cruiser:{radius:34,zRadius:29,altitudes:[46,46.25],formation}},
    bounds:{min:[-123,43,-109],max:[123,128,107]},
    view:{camera:[94,91,130],target:[-1,64,-13]}};
  update(0);return group;
}
