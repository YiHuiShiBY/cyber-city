import { makeDetailedTrain, makeTrainPassengerDoors } from './transport-model-details.js';
import { installDetailModel } from './city-detail-geometry.js';
import { sampleStationTrain } from './district-station-life.js';
import * as THREE from 'three';
import { FLOOR_HEIGHT, BAY_WIDTH } from './district-building-geometry.js';
import { applyFacadeWallWash } from './facade-wall-wash.js';

/** Two business towers, an elevated bridge and a compact cross-district rail line. */
export function makeDistrictLandmarks({seed=2049}={}){
 const group=new THREE.Group();group.name='DistrictLandmarks';
 let randomState=Number(seed)>>>0;
 const random=()=>{randomState+=0x6D2B79F5;let value=randomState;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296};
 const boxGeometry=new THREE.BoxGeometry(1,1,1);
 const cylinderGeometry=new THREE.CylinderGeometry(1,1,1,12);
 const mats={
  tower:new THREE.MeshStandardMaterial({color:'#203644',metalness:.57,roughness:.43}),
  podium:new THREE.MeshStandardMaterial({color:'#344853',metalness:.34,roughness:.63}),
  dark:new THREE.MeshStandardMaterial({color:'#11232e',metalness:.47,roughness:.55}),
  steel:new THREE.MeshStandardMaterial({color:'#69818c',metalness:.76,roughness:.34}),
  concrete:new THREE.MeshStandardMaterial({color:'#3f535e',roughness:.8}),
  train:new THREE.MeshStandardMaterial({color:'#5f7885',metalness:.62,roughness:.30,emissive:'#155a6e',emissiveIntensity:.5}),
  glass:new THREE.MeshStandardMaterial({color:'#173d4b',emissive:'#216879',emissiveIntensity:.34,metalness:.65,roughness:.19}),
  platformGlass:new THREE.MeshStandardMaterial({color:'#517481',transparent:true,opacity:.17,depthWrite:false,metalness:.2,roughness:.24,side:THREE.DoubleSide}),
  trainGlow:new THREE.MeshBasicMaterial({color:'#aef4ff',toneMapped:false}),
  trainCore:new THREE.MeshBasicMaterial({color:'#ff9ae0',toneMapped:false}),
  cyan:new THREE.MeshStandardMaterial({color:'#70c9c9',emissive:'#70c9c9',emissiveIntensity:.95,toneMapped:false}),
  amber:new THREE.MeshStandardMaterial({color:'#d1a374',emissive:'#e9b783',emissiveIntensity:.95,toneMapped:false}),
  magenta:new THREE.MeshStandardMaterial({color:'#a568a1',emissive:'#b775b3',emissiveIntensity:.75,toneMapped:false}),
  red:new THREE.MeshStandardMaterial({color:'#dd6b67',emissive:'#dd6b67',emissiveIntensity:.9,toneMapped:false}),
  crownCyan:new THREE.MeshBasicMaterial({color:'#a9f0e7',toneMapped:false}),
  crownAmber:new THREE.MeshBasicMaterial({color:'#f9d49c',toneMapped:false}),
  bridgeGlass:new THREE.MeshBasicMaterial({color:'#4d9cb2',toneMapped:false}),
  panes:new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false})
 };
 applyFacadeWallWash(mats.tower,{intensity:48,source:'district-towers'});
 applyFacadeWallWash(mats.podium,{intensity:32,source:'district-tower-podium'});
 const identity=new THREE.Quaternion(),yAxis=new THREE.Vector3(0,1,0);
 function component(name,x=0,y=0,z=0){const node=new THREE.Group();node.name=name;node.position.set(x,y,z);group.add(node);return node}
 // Retain semantic landmark groups while consolidating all repeated parts by material.
 function builder(parent){
  const buckets=new Map();
  function place(shape,material,position,scale,rotation=identity,color=null){
   const key=shape.uuid+':'+material.uuid;
   if(!buckets.has(key))buckets.set(key,{shape,material,parts:[]});
   buckets.get(key).parts.push({matrix:new THREE.Matrix4().compose(new THREE.Vector3(...position),rotation,new THREE.Vector3(...scale)),color});
  }
  const box=(material,w,h,d,x,y,z,color=null)=>place(boxGeometry,material,[x,y,z],[w,h,d],identity,color);
  const cylinder=(material,r,h,x,y,z,rotation=identity)=>place(cylinderGeometry,material,[x,y,z],[r,h,r],rotation);
  const beam=(material,start,end,width,depth=width)=>{
   const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),direction=b.clone().sub(a);
   const rotation=new THREE.Quaternion().setFromUnitVectors(yAxis,direction.clone().normalize());
   place(boxGeometry,material,a.add(b).multiplyScalar(.5).toArray(),[width,direction.length(),depth],rotation);
  };
  function finish(){
   for(const {shape,material,parts} of buckets.values()){
    const batch=new THREE.InstancedMesh(shape,material,parts.length);batch.name=parent.name+'-'+Object.keys(mats).find(key=>mats[key]===material);
    parts.forEach((part,index)=>{batch.setMatrixAt(index,part.matrix);if(part.color)batch.setColorAt(index,part.color)});
    batch.instanceMatrix.needsUpdate=true;if(batch.instanceColor)batch.instanceColor.needsUpdate=true;batch.computeBoundingSphere();parent.add(batch);
   }
  }
  return {box,cylinder,beam,place,finish};
 }
 const towerHeights=[54,64],towers=[];
 for(let index=0;index<2;index++){
  const tower=component(index?'EastBusinessTower':'WestBusinessTower',index?52:32,0,-60),b=builder(tower);
  const totalHeight=towerHeights[index],roof=totalHeight-5,accent=index?mats.cyan:mats.amber;
  const crownAccent=index?mats.crownCyan:mats.crownAmber;
  // Five segments instead of four: the 29.8-unit shaft is cut in two, so the taper reads as a
  // stepped setback all the way up (8.8 -> 8.2 -> 7.75 -> 7.0 -> 5.6). The cut lands strictly
  // inside the old envelope, so `roof`, the crown, the mast and the beacon -- and therefore
  // totalHeight and the published tower height -- are untouched.
  const tiers=[{y:0,h:4.2,w:8.8,d:10.8},{y:4.2,h:18.476,w:8.2,d:9.4},{y:22.676,h:11.324,w:7.75,d:8.85},{y:34,h:roof-38,w:7.0,d:8.2},{y:roof-4,h:4,w:5.6,d:6.6}];
  tiers.forEach((tier,tierIndex)=>{
   b.box(tierIndex?mats.tower:mats.podium,tier.w,tier.h,tier.d,0,tier.y+tier.h/2,0);
   if(tierIndex)b.box(mats.steel,tier.w+.16,.13,tier.d+.16,0,tier.y+.07,0);
   if(tierIndex===0)return;
   // The tower fenestration now runs on the same grid the district facades use, so a segment twice
   // as tall carries twice as many rows instead of stretching a fixed 1.2 x .57 lattice.
   for(let y=tier.y+1.05;y<tier.y+tier.h-.5;y+=FLOOR_HEIGHT){
    for(const face of [-1,1]){
     for(let x=-tier.w/2+.50,column=0;x<tier.w/2-.30;x+=BAY_WIDTH,column++){
      const lit=random()>.31,color=new THREE.Color(lit?(column%5===0?'#a4c5c3':index?'#63a5af':'#c3a47d'):'#15303d');
      color.multiplyScalar(lit?.38+random()*.52:.55);
      b.box(mats.panes,column%3===0?.25:.33,.69,.025,x,y,face*(tier.d/2+.016),color);
     }
     for(let z=-tier.d/2+.48,column=0;z<tier.d/2-.30;z+=BAY_WIDTH,column++){
      const lit=random()>.4,color=new THREE.Color(lit?(column%4===0?'#c6b799':index?'#5d9ca9':'#8ba6b0'):'#172c38');
      color.multiplyScalar(lit?.34+random()*.48:.55);
      b.box(mats.panes,.025,.69,.31,face*(tier.w/2+.016),y,z,color);
     }
    }
   }
   for(let y=tier.y+4.6;y<tier.y+tier.h-.3;y+=4.8)b.box(mats.dark,tier.w+.08,.085,tier.d+.08,0,y,0);
   // Broad recessed vertical ribs establish a facade rhythm without tracing every edge.
   for(const side of [-1,1])for(const x of [-tier.w*.27,tier.w*.27])b.box(mats.podium,.105,tier.h-.3,.09,x,tier.y+tier.h/2,side*(tier.d/2+.031));
   // The same rhythm on the two flanks, which until now carried window boxes and nothing else.
   for(const side of [-1,1])for(const z of [-tier.d*.27,tier.d*.27])b.box(mats.podium,.09,tier.h-.3,.105,side*(tier.w/2+.031),tier.y+tier.h/2,z);
   if(tierIndex<4)for(const x of [-tier.w*.27,tier.w*.27])b.box(crownAccent,.045,tier.h-2.4,.035,x,tier.y+tier.h/2,tier.d/2+.083);
  });
  // A recessed foyer, a slender canopy and warm bands ground each tall mass.
  b.box(mats.glass,6.3,2.5,.034,0,1.58,5.372);
  for(const x of [-2.2,0,2.2])b.box(mats.steel,.067,2.72,.07,x,1.59,5.348);
  b.box(mats.dark,7.8,.14,1.35,0,3.37,4.65);
  b.box(accent,6.8,.043,.035,0,3.235,5.358);
  for(const x of [-3.69,3.69])b.box(mats.podium,.37,3.30,.48,x,1.65,5.04);
  // Rooftop setbacks end in an open, tapered crown and one precise beacon.
  b.box(mats.steel,5.76,.17,6.76,0,roof+.085,0);
  for(const x of [-2.34,2.34])for(const z of [-2.83,2.83])b.beam(mats.steel,[x,roof+.2,z],[x*.34,roof+3.35,z*.38],.11,.16);
  b.box(mats.dark,2.03,.18,2.47,0,roof+3.4,0);
  for(const z of [-1.20,1.20])b.box(crownAccent,2.05,.085,.031,0,roof+3.48,z);
  // Three suspended horizontal fins make the open crown readable at district scale.
  for(const [height,width,depth] of [[.40,4.48,2.72],[1.65,3.25,2.02],[2.84,2.08,1.36]]){
   for(const side of [-1,1])b.box(crownAccent,width,.095,.055,0,roof+height,side*depth);
   b.box(crownAccent,.055,.095,depth*2,width/2,roof+height,0);
  }
  // Small geometric 2049 wordmark; no font, texture fetch or browser canvas is required.
  b.box(mats.dark,3.42,1.10,.063,0,roof-1.33,3.357);
  const digitSegments={0:'abcdef',2:'abged',4:'fgbc',9:'abfgcd'};
  const segmentShapes={a:[0,.31,.30,.045],b:[.15,.155,.045,.30],c:[.15,-.155,.045,.30],d:[0,-.31,.30,.045],e:[-.15,-.155,.045,.30],f:[-.15,.155,.045,.30],g:[0,0,.30,.045]};
  Array.from('2049').forEach((digit,digitIndex)=>{for(const segment of digitSegments[digit]){const [x,y,w,h]=segmentShapes[segment];b.box(crownAccent,w,h,.020,(digitIndex-1.5)*.57+x,roof-1.33+y,3.398)}});
  b.box(crownAccent,.063,.67,.025,-1.42,roof-1.33,3.398);
  b.box(crownAccent,.16,.047,.025,-1.34,roof-1.02,3.398);
  b.box(mats.dark,1.25,.77,1.5,-.49,roof+.52,-.63);
  for(let vent=0;vent<5;vent++)b.box(mats.steel,1.08,.026,.045,-.49,roof+.92,-1.19+vent*.22);
  b.cylinder(mats.steel,.037,1.36,0,roof+4.15,0);
  b.cylinder(mats.red,.055,.14,0,totalHeight-.07,0);
  // One lit vertical inset distinguishes the higher tower at night.
  if(index)b.box(mats.cyan,.048,17,.025,-2.32,45,4.119);
  b.finish();tower.userData={height:totalHeight,footprint:[8.8,10.8],roofHeight:roof};towers.push(tower);
 }

 const skybridge=component('ThirtySecondFloorSkybridge',42,0,-60),bridge=builder(skybridge);
 bridge.box(mats.steel,12.3,.32,3.12,0,31.84,0);
 bridge.box(mats.dark,12.38,.19,3.21,0,34.01,0);
 for(const side of [-1,1]){
  bridge.box(mats.bridgeGlass,11.98,1.76,.055,0,32.91,side*1.48);
  bridge.box(mats.crownCyan,11.90,.065,.042,0,32.10,side*1.54);
  bridge.box(mats.crownCyan,11.90,.058,.042,0,33.87,side*1.54);
  for(const x of [-5.91,5.91])bridge.box(mats.crownAmber,.075,1.66,.035,x,32.94,side*1.538);
  for(let x=-5.6;x<6;x+=1.4)bridge.box(mats.steel,.057,1.88,.12,x,32.94,side*1.49);
  bridge.beam(mats.steel,[-6.03,30.45,side*1.1],[-4.45,31.72,side*1.1],.15,.18);
  bridge.beam(mats.steel,[6.03,30.45,side*1.1],[4.45,31.72,side*1.1],.15,.18);
  // The two end knee-braces were never tied together, so the span read as a slab on hidden
  // supports. A bottom chord with two posts under it, plus a rail outside the glazing, gives the
  // crossing a visible truss. The chord sits at 30.55, clear of the declared 30.375 clearance.
  bridge.beam(mats.steel,[-4.45,30.55,side*1.1],[4.45,30.55,side*1.1],.14,.16);
  for(const x of [-2.2,2.2])bridge.beam(mats.steel,[x,30.63,side*1.1],[x,31.72,side*1.1],.10,.10);
  for(const railY of [33.10,33.95])bridge.beam(mats.steel,[-6.03,railY,side*1.60],[6.03,railY,side*1.60],.07,.07);
  for(const x of [-6.03,6.03])bridge.beam(mats.steel,[x,32.02,side*1.60],[x,33.95,side*1.60],.07,.07);
 }
 bridge.finish();skybridge.userData={deckHeight:32,clearance:30.375,betweenTowerCenters:[32,52]};

 const viaduct=component('CrossDistrictViaduct',0,0,27),rail=builder(viaduct);
 rail.box(mats.concrete,130,.44,2.8,0,7.28,0);
 for(const side of [-1,1]){
  rail.box(mats.steel,130,.26,.19,0,7.01,side*1.15);
  rail.box(mats.steel,130,.046,.052,0,7.541,side*.67);
  // The platform replaces the guideway edge guard here. Leaving the old
  // continuous guard in place put a solid rail across every boarding bridge.
  for(const [left,right] of [[-65,15.1],[26.9,65]]) {
   rail.box(mats.dark,right-left,.23,.10,(left+right)/2,7.615,side*1.31);
   rail.box(side>0?mats.cyan:mats.magenta,right-left,.025,.027,(left+right)/2,7.71,side*1.367);
  }
 }
 for(let x=-64;x<=64;x+=.72)rail.box(mats.dark,.135,.045,1.72,x,7.516,0);
 const supportXs=[-56,-28,-14,14,28,56];
 for(const x of supportXs){
  rail.box(mats.concrete,1.22,.28,1.62,x,.14,.75);
  rail.box(mats.concrete,.60,6.36,.86,x,3.46,.75);
  rail.box(mats.concrete,1.10,.35,2.51,x,6.81,0);
  for(const side of [-1,1])rail.beam(mats.steel,[x,5.81,.75],[x,6.94,side*1.11],.12,.15);
  rail.cylinder(mats.steel,.031,2.72,x,8.88,-1.31);
  rail.box(mats.steel,.037,.043,1.37,x,10.20,-.645);
 }
 rail.box(mats.steel,130,.017,.017,0,10.20,0);
 rail.finish();viaduct.userData={deckHeight:7.5,width:2.8,length:130,supportXs,supportCenterZ:27.75};

 const station=component('EastArcadeTransitStop',21,0,27),stop=builder(station);
 for(const side of [-1,1]){
  stop.box(mats.concrete,11.8,.25,.83,0,7.525,side*1.88);
  stop.box(mats.amber,11.54,.015,.047,0,7.66,side*1.493);
  stop.box(mats.platformGlass,10.35,.97,.029,0,8.285,side*2.29);
  stop.box(mats.steel,11.68,.06,.055,0,8.82,side*2.31);
  for(const x of [-5.5,0,5.5])stop.box(mats.steel,.075,2.39,.09,x,8.85,side*2.20);
  stop.box(mats.platformGlass,11.82,.075,.87,0,10.04,side*1.96);
  for(const edge of [-1,1])stop.box(mats.steel,11.82,.065,.055,0,10.04,side*1.96+edge*.425);
  stop.box(mats.amber,10.8,.021,.048,0,9.966,side*1.98);
  for(const x of [-3.6,2.8]){
   stop.box(mats.steel,1.35,.11,.33,x,8.11,side*1.98);
   for(const leg of [-.42,.42])stop.box(mats.dark,.044,.44,.24,x+leg,7.86,side*2.01);
  }
 }
 // Compact stair towers lie beside the line, between the north-south avenues.
 for(const x of [-5.35,5.35]){
  stop.box(mats.podium,1.23,7.36,1.31,x,3.68,1.45);
  stop.box(mats.glass,.78,5.9,.031,x,3.39,.785);
  stop.box(mats.cyan,.048,6.74,.032,x-.38,3.49,.79);
 }
 stop.finish();station.userData={platformHeight:7.65,center:[21,27],platformOuterZ:[24.69,29.31]};

 // The local train is a maglev: it floats on a glowing field. There are no
 // wheels, bogies or pantograph, so nothing on the train ever touches the
 // guideway or the catenary.
 const train=component('ThreeCarLocalTrain',0,7.5,27),car=builder(train);
 const glowBase=new THREE.Color(mats.trainGlow.color),canopyTilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.12);
 for(const carX of [-3.9,0,3.9]){
  // Keep the same floor-height opening as the detailed coachwork. The moving
  // leaves are installed after LOD registration so neither view duplicates them.
  car.box(mats.train,2.325,1.45,1.44,carX-.6825,.875,0);
  car.box(mats.train,.605,1.45,1.44,carX+1.5425,.875,0);
  car.box(mats.train,.76,.17,1.44,carX+.86,1.515,0);
  car.box(mats.dark,3.61,.04,1.40,carX,.13,0);
  car.box(mats.steel,3.61,.09,1.46,carX,1.665,0);
  // A shallow levitation plenum clears the rail head below the level floor.
  for(const side of [-1,1]){
   car.box(mats.trainGlow,3.30,.012,.035,carX,.117,side*.706);
   car.box(mats.trainGlow,3.30,.028,.085,carX,1.725,side*.44);
   for(const windowX of [-1.24,-.58,.08])car.box(mats.glass,.51,.49,.019,carX+windowX,1.22,side*.733);
   // Sill and header lines turn the whole window row into one lit band.
   car.box(mats.trainGlow,1.99,.04,.014,carX-.55,.93,side*.728);
   car.box(mats.trainGlow,3.50,.06,.014,carX,1.56,side*.728);
   car.box(mats.amber,1.99,.035,.024,carX-.55,.28,side*.742);
  }
 }
 // Both ends taper into a two-step fairing with a canopy panel, a headlight band
 // and magenta markers; the tip stays inside the declared 6.0-unit half-length.
 const endFace=5.745;
 for(const end of [-1,1]){
  car.box(mats.train,.155,.70,1.30,end*(endFace+.0775),1.13,0);
  car.box(mats.train,.085,.46,1.08,end*(endFace+.1975),1.13,0);
  car.place(boxGeometry,mats.glass,[end*(endFace+.0775),1.492,0],[.155,.019,1.28],canopyTilt);
  car.box(mats.trainGlow,.025,.17,.78,end*(endFace+.2525),1.13,0);
  for(const z of [-.30,.30])car.box(mats.trainCore,.03,.05,.09,end*(endFace+.2525),.92,z);
  // The fairing floor sits higher than the carriage, so its emitter hangs from
  // the fairing rather than floating in the hover gap.
  car.cylinder(mats.trainGlow,.10,.06,end*(endFace+.10),.75,0);
 }
 // Dark bellows close the inter-car gap; a glowing coupler joins the carriages.
 for(const side of [-1,1]){
  car.box(mats.dark,.21,.98,1.20,side*1.95,1.13,0);
  car.box(mats.trainGlow,.24,.14,1.00,side*1.95,.53,0);
 }
 // A wireless power collector replaces the pantograph; its pad stops short of
 // the wire, so even at the top of the hover bob there is no contact.
 car.box(mats.dark,.42,.06,.42,0,1.745,0);
 car.cylinder(mats.steel,.028,.78,0,2.15,0);
 car.cylinder(mats.trainCore,.22,.024,0,2.535,0);
 car.cylinder(mats.trainGlow,.18,.06,0,2.585,0);
 car.finish();
 const prepareView = installDetailModel(train, makeDetailedTrain(), 42);
 const passengerDoors = makeTrainPassengerDoors(); train.add(passengerDoors);
 // A pool of field light over the track travels with the train. It rides above
 // the running-edge strips (top 7.564) and below the skirt (7.841), so its swept
 // box touches neither the guideway nor the carriage.
 const underglow=new THREE.Mesh(
  new THREE.PlaneGeometry(12.4,2.2),
  new THREE.MeshBasicMaterial({color:'#8fe9ff',transparent:true,opacity:.30,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
 underglow.name='ThreeCarLocalTrain-FieldPool';
 underglow.rotation.x=-Math.PI/2;
 underglow.position.set(0,.092,0);
 underglow.renderOrder=3;
 train.add(underglow);
 let trainState=sampleStationTrain(0);
 function update(seconds){
  const time=Number.isFinite(Number(seconds))?Number(seconds):0;
  trainState=sampleStationTrain(time);
  train.position.set(trainState.x,trainState.y,trainState.z);
  passengerDoors.userData.update(trainState.doorOpen);
  train.userData.state=trainState;
  group.userData.trainState=trainState;
  // The shallow hover settles exactly level with the platform before opening.
  mats.trainGlow.color.copy(glowBase).multiplyScalar(.80+.32*Math.sin(time*1.35));
  const endStroke=THREE.MathUtils.clamp(1.6-Math.abs(train.position.x)/40,.25,1);
  underglow.material.opacity=.22+.14*Math.sin(time*1.35);
  underglow.scale.set(endStroke,1,1);
 }
 update(0);group.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(group,true);
 let drawCalls=0,instances=0;group.traverse(object=>{if(object.isMesh){drawCalls++;instances+=object.isInstancedMesh?object.count:1}});
 group.userData={seed,prepareView,landmarkCount:5,towerHeights,towers,skybridge,viaduct,station,train,passengerDoors,trainState,sampleTrain:sampleStationTrain,supportXs,drawCalls,instances,
  bounds:{min:box.min.toArray(),max:box.max.toArray()},
  trainRoute:{axis:'x',range:[-54,54],centerZ:27,maxTrainExtent:[-60,60]},update};
 return group;
}
