import * as THREE from 'three';

// Upper-storey mirrored details already fade exponentially in the wet-surface
// shader. Beyond the street views, omit instances wholly above ten units;
// retain full-height masses intersecting that band and retain all lit lower floors.
export function installReflectionDistanceLOD(reflection,source) {
  const distant=new THREE.Group();distant.name='DistrictWetReflection-Distant';
  const matrix=new THREE.Matrix4(),box=new THREE.Box3();let originalInstances=0,distantInstances=0;
  for(const node of source.children){
    if(!node.isInstancedMesh){const copy=node.clone();copy.visible=node.visible;distant.add(copy);continue;}
    node.geometry.computeBoundingBox();const keep=[];
    for(let i=0;i<node.count;i++){
      node.getMatrixAt(i,matrix);box.copy(node.geometry.boundingBox).applyMatrix4(matrix);
      if(box.min.y<=10.0)keep.push(i);
    }
    originalInstances+=node.count;distantInstances+=keep.length;if(!keep.length)continue;
    // Instance attributes (notably window rhythm) must keep exactly the same
    // selected order as matrices and colours; the original geometry stays intact.
    const geometry=node.geometry.clone();
    for(const [name,attribute]of Object.entries(node.geometry.attributes))if(attribute.isInstancedBufferAttribute){
      const array=new attribute.array.constructor(keep.length*attribute.itemSize);
      keep.forEach((id,i)=>array.set(attribute.array.subarray(id*attribute.itemSize,(id+1)*attribute.itemSize),i*attribute.itemSize));
      geometry.setAttribute(name,new THREE.InstancedBufferAttribute(array,attribute.itemSize,attribute.normalized,attribute.meshPerAttribute));
    }
    if(geometry.isInstancedBufferGeometry)geometry.instanceCount=keep.length;
    const mesh=new THREE.InstancedMesh(geometry,node.material,keep.length);mesh.name=`${node.name}-DistantReflection`;
    keep.forEach((id,i)=>{node.getMatrixAt(id,matrix);mesh.setMatrixAt(i,matrix);if(node.instanceColor){const c=new THREE.Color();node.getColorAt(id,c);mesh.setColorAt(i,c);}});
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();distant.add(mesh);
  }
  reflection.add(distant);const position=new THREE.Vector3();
  reflection.userData={originalInstances,distantInstances,distant,source,prepareView(camera){
    camera.getWorldPosition(position);const far=position.y>46&&position.length()>150;
    source.visible=!far;distant.visible=far;reflection.userData.detail=far?'distant':'full';
  }};
  return reflection;
}
