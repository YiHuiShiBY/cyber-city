import * as THREE from 'three';
import { detailBuilder } from './city-detail-geometry.js';
import { makeBlenderAircraftGeometry } from './aircraft-blender-models.js';
import { makeAircraftGlassMaterial, makeAircraftLightMaterial, updateAircraftLights } from './aircraft-lighting.js';

export function makeDetailedFlyer(accent) {
  const geometry = makeBlenderAircraftGeometry('legacy-flyer'), group = new THREE.Group();
  const hull = new THREE.Mesh(geometry.body, new THREE.MeshStandardMaterial({ vertexColors:true, metalness:.56, roughness:.32 }));
  hull.name = 'Flyer-PanelledHull';
  const lamps = new THREE.Mesh(geometry.lights, makeAircraftLightMaterial(new THREE.Color(accent).lerp(new THREE.Color('#ffffff'),.65)));
  const glass = new THREE.Mesh(geometry.glass, makeAircraftGlassMaterial());
  glass.name = 'Flyer-ClearCanopy'; glass.renderOrder = 3;
  lamps.name = 'Flyer-NavigationLights'; group.add(hull,lamps,glass);
  group.userData.updateLights = seconds => updateAircraftLights(lamps.material, seconds);
  return group;
}

export function makeDetailedTrain() {
  const group = new THREE.Group(), d = detailBuilder(), light = detailBuilder();
  for (const center of [-3.9,0,3.9]) {
    const left = center < 0, right = center > 0;
    // The former closed loft ran directly behind the painted doors. Split its
    // length at the vestibule so there is an actual 0.76-wide, floor-level hole.
    d.loft([[-1.84,left?.42:.70,left?.60:.74,.91],[-1.35,.75,.78,.91],[.48,.75,.78,.91]], '#c1cece','x').translate(center,0,0);
    d.loft([[1.24,.75,.78,.91],[1.35,.75,.78,.91],[1.84,right?.42:.70,right?.60:.74,.91]], '#c1cece','x').translate(center,0,0);
    d.box(center+.86,1.575,0,.76,.23,1.39,'#c1cece');
    d.box(center,.13,0,3.56,.04,1.39,'#2b424d');
    d.box(center+.86,.145,0,.76,.01,1.38,'#526874');
    d.box(center,1.72,0,2.65,.13,.71,'#79949e');
    for(const side of [-1,1]) {
      // All static fascia terminates at the doorway; sliding leaves are shared
      // by high and low detail models and are added outside their LOD groups.
      d.box(center-.51,1.19,side*.701,1.96,.45,.034,'#243d49');
      for(const x of [-.97,-.46,.05]) {
        d.box(center+x,1.23,side*.725,.40,.33,.035,'#78a8b6');
        light.box(center+x,1.365,side*.747,.34,.018,.011,'#c6eeed');
      }
      for (const x of [.455,1.265])d.box(center+x,.815,side*.738,.035,1.34,.054,'#314d59');
      light.box(center-.50,.28,side*.738,1.89,.035,.035,'#4dcdd6');
      light.box(center+1.48,.28,side*.66,.39,.035,.035,'#4dcdd6');
      for(const x of [-1.12,1.12]) {
        d.box(center+x,.129,side*.65,.55,.025,.12,'#162e3d');
        light.box(center+x,.117,side*.706,.43,.012,.035,'#8decff');
      }
    }
    for(let i=0;i<8;i++)d.box(center-.66+i*.19,1.796,0,.085,.02,.51,'#314c59');
    if(center!==0) {
      const sign=Math.sign(center);
      d.add(new THREE.BoxGeometry(.46,.025,.67).rotateZ(-sign*.48).translate(center+sign*1.57,1.575,0),'#143440');
      d.box(center+sign*1.60,1.58,0,.035,.035,.68,'#9ab5bd');
      for(const side of [-1,1])light.box(center+sign*1.842,.93,side*.28,.028,.075,.16,sign<0?'#e9ffff':'#ff6d64');
    }
  }
  for(const x of [-1.95,1.95])for(let i=0;i<5;i++)d.box(x-.095+i*.047,1.08,0,.026,.97,1.16,i%2?'#425760':'#1f343e');
  d.box(0,1.86,0,.52,.12,.46,'#294852');
  d.beam([-.20,1.92,0],[.16,2.27,0],.025,'#a2bec5');
  d.beam([.16,2.27,0],[-.05,2.50,0],.025,'#a2bec5');
  d.box(-.05,2.53,0,.56,.055,.27,'#4d6874');
  light.box(-.05,2.58,0,.29,.025,.17,'#a7f6ff');
  group.add(d.mesh('Train-Coachwork'),light.mesh('Train-CabinAndLevitationLights',{glow:true}));
  return group;
}

/** Common train doors stay outside the static high/low mesh switch. */
export function makeTrainPassengerDoors() {
  const group = new THREE.Group(); group.name = 'Train-WorkingPassengerDoors';
  const leaves = [], bridges = [], signals = [];
  const boardMaterial = new THREE.MeshStandardMaterial({ color: '#a5b8bb', metalness: .7, roughness: .4 });
  const signalMaterial = new THREE.MeshBasicMaterial({ color: '#ffd89b', toneMapped: false });
  for (const center of [-3.9, 0, 3.9]) {
    for (const side of [-1, 1]) {
      for (const half of [-1, 1]) {
        const d = detailBuilder();
        d.box(0,.815,0,.384,1.33,.045,'#526f7c');
        d.box(0,1.105,side*.026,.272,.49,.013,'#9bc9ce');
        d.box(half*.166,.79,side*.029,.023,1.22,.015,'#243c46');
        d.box(0,.283,side*.030,.36,.028,.012,'#86d9dc');
        const leaf = d.mesh(`Train-Door-${center}-${side}-${half}`);
        const closedX = center + .86 + half * .19;
        leaf.position.set(closedX, 0, side * .762);
        leaf.userData = { side, half, closedX, doorwayX: center + .86 };
        leaves.push(leaf); group.add(leaf);
      }
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(.76,.04,.80), boardMaterial);
    bridge.name = 'Train-RetractableBoardingBridge'; bridge.position.set(center + .86,.13,.762);
    bridge.userData.doorwayX = center + .86; bridges.push(bridge); group.add(bridge);
    const signal = new THREE.Mesh(new THREE.BoxGeometry(.50,.035,.035), signalMaterial);
    signal.name = 'Train-DoorStatusLamp'; signal.position.set(center + .86,1.535,.766); signals.push(signal); group.add(signal);
  }
  function update(open) {
    const amount = THREE.MathUtils.clamp(open, 0, 1);
    for (const leaf of leaves) leaf.position.x = leaf.userData.closedX + (leaf.userData.side > 0 ? leaf.userData.half * .40 * amount : 0);
    for (const bridge of bridges) { bridge.scale.z = Math.max(.001, amount); bridge.position.z = .762 + .40 * amount; bridge.visible = amount > 0; }
    signalMaterial.color.set(amount > .99 ? '#90f3cf' : amount > 0 ? '#ffbd72' : '#8badb8');
    group.userData.doorOpen = amount;
  }
  group.userData = { leaves, bridges, signals, update, doorOpen: 0, openingWidth: .76, floorHeight: .15, activeSide: 1 };
  update(0); return group;
}

export function makeDetailedAirship() {
  const geometry = makeBlenderAircraftGeometry('airship');
  return { structure:geometry.body, glass:geometry.glass, lights:geometry.lights };
}
