import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared vertex-coloured batches keep small surface details inexpensive.
export function detailBuilder() {
  const pieces=[];
  function add(geometry,color){
    const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();g.deleteAttribute('uv');
    const c=new THREE.Color(color),values=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<values.length;i+=3)c.toArray(values,i);
    g.setAttribute('color',new THREE.BufferAttribute(values,3));pieces.push(g);return g;
  }
  const box=(x,y,z,w,h,d,c)=>add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),c);
  const sphere=(x,y,z,w,h,d,c)=>add(new THREE.SphereGeometry(1,16,10).scale(w,h,d).translate(x,y,z),c);
  const ring=(x,y,z,r,t,c,axis='z',sy=1)=>{const g=new THREE.TorusGeometry(r,t,5,24).scale(1,sy,1);if(axis==='x')g.rotateY(Math.PI/2);if(axis==='y')g.rotateX(Math.PI/2);return add(g.translate(x,y,z),c);};
  function beam(a,b,r,c){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start);const g=new THREE.CylinderGeometry(r,r,dir.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));return add(g.translate(...start.add(end).multiplyScalar(.5).toArray()),c);}
  function loft(rings,c,axis='z'){
    const vertices=[],indices=[],sides=8;
    for(const [z,w,h,y=0] of rings)for(let i=0;i<sides;i++){const angle=(i+.5)/sides*Math.PI*2;vertices.push(Math.cos(angle)*w,y+Math.sin(angle)*h,z);}
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides);}
    for(let i=1;i<sides-1;i++){indices.push(0,i+1,i);const n=(rings.length-1)*sides;indices.push(n,n+i,n+i+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();if(axis==='x')g.rotateY(Math.PI/2);return add(g,c);
  }
  function geometry(){const g=mergeGeometries(pieces);pieces.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();return g;}
  function mesh(name,{glow=false,metalness=.45,roughness=.5}={}){const m=new THREE.Mesh(geometry(),glow?new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}):new THREE.MeshStandardMaterial({vertexColors:true,metalness,roughness}));m.name=name;return m;}
  return{add,box,sphere,ring,beam,loft,geometry,mesh};
}

export function installDetailModel(parent,high,range=38){
  const low=[...parent.children];high.name='RefinedModel';parent.add(high);
  const cameraPosition=new THREE.Vector3(),center=new THREE.Vector3();let detail='high';
  const set=next=>{detail=next;low.forEach(n=>n.visible=next==='low');high.visible=next==='high';parent.userData.modelDetail=next;};set('high');
  return camera=>{camera.getWorldPosition(cameraPosition);parent.getWorldPosition(center);const next=cameraPosition.distanceTo(center)<range*(camera.zoom||1)?'high':'low';if(next!==detail)set(next);};
}
