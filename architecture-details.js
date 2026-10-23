import * as THREE from 'three';
import { detailBuilder } from './city-detail-geometry.js';

// Each record comes from the actual facade, including stepped/offset masses.
// No random numbers are consumed: street layout and window lighting stay stable.
export function addArchitectureDetails(group, buildings, panes, masses = []) {
  const entries = [];
  for (let index = 0; index < buildings.length; index++) {
    const b = buildings[index], d = detailBuilder();
    const style = b.styleId || 'horizon';
    const warm = ['harbour', 'market', 'theatre', 'hotel'].includes(style);
    const frame = warm ? '#786d58' : '#52687b', edge = warm ? '#a09176' : '#8195a3';
    const owned = style === 'horizon' ? [] : panes.filter(p => p.index === index);
    for (const mass of masses.filter(m => m.index === index)) {
      const {x,z,width,depth,height,base,firstFloor,floorPitch,bayWidth} = mass;
      for (let y = base + firstFloor; y < base + height - .75; y += floorPitch) {
        for (let face=0;face<4;face++) {
          const span=face<2?width:depth, columns=Math.max(2,Math.round(span/bayWidth));
          for(let column=0;column<columns;column++) {
            const along=(column-(columns-1)/2)*span/(columns+.6);
            const px=x+(face<2?along:(face===2?1:-1)*(width/2+.013));
            const pz=z+(face<2?(face===0?1:-1)*(depth/2+.013):along);
            const angle=[0,Math.PI,Math.PI/2,-Math.PI/2][face];
            const w=Math.min(1.35,span/(columns+.6)*.72),h=.78;
            d.add(new THREE.BoxGeometry(w,h,.018).translate(0,0,-.012).rotateY(angle).translate(px,y,pz),'#102332');
            owned.push({position:[px,y,pz,angle],width:w,height:h});
          }
        }
        // Shallow floor reveals and a shadowed ledge make the tall slab legible.
        d.box(x,y-.62,z,width+.035,.055,depth+.035,'#344858');
      }
      for(const sx of [-1,1])for(const sz of [-1,1])d.box(x+sx*(width/2-.05),base+height/2,z+sz*(depth/2-.05),.13,height,.13,'#586a79');
    }
    for (const [i, p] of owned.entries()) {
      const [x, y, z, angle] = p.position, w = p.width, h = p.height;
      if (w < .2 || h < .19) continue;
      const box = (dx, dy, dz, width, height, depth, color) => {
        d.add(new THREE.BoxGeometry(width, height, depth).translate(dx, dy, dz).rotateY(angle).translate(x, y, z), color);
      };
      const t = Math.min(.055, h * .11);
      for (const side of [-1, 1]) box(side * (w / 2 + t / 2), 0, .018, t, h + t * 2, .09, frame);
      box(0, h / 2 + t / 2, .02, w, t, .10, frame);
      box(0, -h / 2 - t / 2, .055, w + t * 3, t, .19, edge);
      if (w > .85) box(0, 0, .03, .035, h, .08, frame);
      if (h > 3) for(let offset=-h/2+1.6;offset<h/2;offset+=1.6) box(0,offset,.027,w,.045,.07,frame);
      if (['residential', 'hotel', 'market', 'horizon'].includes(style) && i % 5 === 1 && y > 3) {
        box(w / 2 - .18, -h / 2 - .19, .11, .37, .23, .23, '#8b9697');
        for (let l = 0; l < 3; l++) box(w / 2 - .18, -h / 2 - .26 + l * .065, .235, .28, .025, .016, '#253d49');
      }
      if (['workshop', 'harbour', 'lounge', 'market'].includes(style) && h > .4 && y > 2) {
        box(0, h / 2 + .09, .10, w + .14, .055, .32, edge);
      }
    }
    if (!owned.length) continue;
    const mesh = d.mesh(`FacadeDetail-${index}`, { metalness: .3, roughness: .74 });
    mesh.visible = false; group.add(mesh);
    const bounds = b.actualBounds
      ? new THREE.Box3(new THREE.Vector3(...b.actualBounds.min), new THREE.Vector3(...b.actualBounds.max))
      : new THREE.Box3(new THREE.Vector3(b.x - b.width / 2, 0, b.z - b.depth / 2), new THREE.Vector3(b.x + b.width / 2, b.height, b.z + b.depth / 2));
    entries.push({ mesh, bounds });
  }
  const position = new THREE.Vector3();
  group.userData.facadeDetailCount = entries.length;
  group.userData.prepareView = camera => {
    camera.getWorldPosition(position); group.worldToLocal(position);
    for (const entry of entries) entry.mesh.visible = entry.bounds.distanceToPoint(position) < 28 * (camera.zoom || 1);
  };
}
