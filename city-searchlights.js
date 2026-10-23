import * as THREE from 'three';
import { detailBuilder } from './city-detail-geometry.js';

const DEFINITIONS=[
  {x:-87,z:25,azimuth:.07,elevation:1.20,phase:.1,color:'#a6e9ff',reach:186,radius:17},
  {x:87,z:13,azimuth:-.07,elevation:1.19,phase:2.4,color:'#d1b7ff',reach:174,radius:16},
  {x:-68,z:-94,azimuth:1.38,elevation:1.24,phase:1.2,color:'#bfe7ff',reach:192,radius:19},
  {x:65,z:-94,azimuth:-1.38,elevation:1.23,phase:3.5,color:'#b7e6ed',reach:181,radius:18},
  {x:-62,z:95,azimuth:1.70,elevation:1.19,phase:4.2,color:'#a0dbea',reach:167,radius:17},
  {x:57,z:95,azimuth:-1.70,elevation:1.21,phase:5.3,color:'#ffe4b8',reach:175,radius:17},
];

/** Moving fixtures and soft volumetric shafts, evaluated directly from scene time. */
export function makeCitySearchlights({buildings=[]}={}){
  const group=new THREE.Group();group.name='CitySearchlights';
  const sites=DEFINITIONS.map((s,index)=>({...s,index,y:3.05,colorRGB:new THREE.Color(s.color).toArray()}));
  const base=detailBuilder();
  for(const site of sites){
    base.box(site.x,.14,site.z,3.3,.28,3.3,'#344551');
    base.box(site.x,1.05,site.z,1.72,1.65,1.72,'#172d3b');
    base.box(site.x,1.94,site.z,2.26,.2,2.26,'#607785');
    for(const side of [-1,1]){
      base.box(site.x+side*.99,2.5,site.z,.24,1.15,.7,'#546b7a');
      base.box(site.x+side*1.33,.37,site.z,.29,.19,2.1,'#8c805a');
    }
    for(let i=0;i<4;i++)base.box(site.x,1.05+i*.19,site.z+.867,1.08,.055,.03,'#78919d');
  }
  group.add(base.mesh('SearchlightFoundations',{roughness:.66}));
  const head=detailBuilder();
  const can=new THREE.CylinderGeometry(.77,.93,1.36,12).rotateX(Math.PI/2).translate(0,0,.24);
  head.add(can,'#284353');
  head.box(-.78,0,.04,.22,.92,1.05,'#718a96');head.box(.78,0,.04,.22,.92,1.05,'#718a96');
  const headGeometry=head.geometry();
  const heads=new THREE.InstancedMesh(headGeometry,new THREE.MeshStandardMaterial({vertexColors:true,metalness:.7,roughness:.34}),sites.length);heads.name='SearchlightMovingHeads';heads.frustumCulled=false;group.add(heads);
  const lensGeometry=new THREE.CircleGeometry(.68,16);lensGeometry.translate(0,0,.935);
  const lenses=new THREE.InstancedMesh(lensGeometry,new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false,side:THREE.DoubleSide}),sites.length);lenses.name='SearchlightLenses';lenses.frustumCulled=false;
  sites.forEach((s,i)=>lenses.setColorAt(i,new THREE.Color(s.color)));group.add(lenses);

  const cone=new THREE.CylinderGeometry(1,.04,1,20,1,false).translate(0,.5,0);
  const geometry=new THREE.InstancedBufferGeometry();geometry.index=cone.index;
  geometry.setAttribute('position',cone.getAttribute('position'));
  geometry.setAttribute('aSite',new THREE.InstancedBufferAttribute(new Float32Array(sites.length*3),3));
  geometry.setAttribute('aDirection',new THREE.InstancedBufferAttribute(new Float32Array(sites.length*3),3));
  geometry.setAttribute('aColor',new THREE.InstancedBufferAttribute(new Float32Array(sites.flatMap(s=>s.colorRGB)),3));
  geometry.setAttribute('aShape',new THREE.InstancedBufferAttribute(new Float32Array(sites.flatMap(s=>[s.reach,s.radius,s.phase])),3));
  geometry.instanceCount=sites.length;
  const uniforms={uTime:{value:0}};
  // Integrate density through the cone's bounding cylinder. This gives a soft
  // interior and a view-dependent thickness, instead of a visibly solid shell.
  const beamMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`attribute vec3 aSite,aDirection,aColor,aShape;varying vec3 vLocal,vCamera,vColor,vShape;
      void main(){vec3 axis=normalize(aDirection);vec3 right=normalize(cross(axis,vec3(0.,0.,1.)));vec3 forward=cross(right,axis);
      vec3 center=(modelMatrix*vec4(aSite,1.)).xyz;vec3 eye=cameraPosition-center;
      vCamera=vec3(dot(eye,right)/aShape.y,dot(eye,axis)/aShape.x,dot(eye,forward)/aShape.y);
      vLocal=position;vColor=aColor;vShape=aShape;
      vec3 world=center+right*position.x*aShape.y+axis*position.y*aShape.x+forward*position.z*aShape.y;
      gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`uniform float uTime;varying vec3 vLocal,vCamera,vColor,vShape;
      void main(){vec3 ray=normalize(vLocal-vCamera);float aa=dot(ray.xz,ray.xz),bb=dot(vCamera.xz,ray.xz),cc=dot(vCamera.xz,vCamera.xz)-1.;
      float nearT=0.,farT=100000.;
      if(aa>.0000001){float disc=bb*bb-aa*cc;if(disc<0.)discard;float root=sqrt(disc);nearT=max(0.,(-bb-root)/aa);farT=(-bb+root)/aa;}
      else if(cc>0.)discard;
      if(abs(ray.y)>.0000001){float y0=-vCamera.y/ray.y,y1=(1.-vCamera.y)/ray.y;nearT=max(nearT,min(y0,y1));farT=min(farT,max(y0,y1));}
      else if(vCamera.y<0.||vCamera.y>1.)discard;
      // Intersect the tapered volume itself before integration, so a narrow
      // lower shaft cannot fall between the fixed ray samples.
      float k=.96,r0=.04+k*vCamera.y;
      float ca=dot(ray.xz,ray.xz)-k*k*ray.y*ray.y;
      float cb=2.*(dot(vCamera.xz,ray.xz)-r0*k*ray.y);
      float ccc=dot(vCamera.xz,vCamera.xz)-r0*r0;
      if(abs(ca)<.0000001){if(abs(cb)>.0000001){float cut=-ccc/cb;if(cb>0.)farT=min(farT,cut);else nearT=max(nearT,cut);}else if(ccc>0.)discard;}
      else{float dd=cb*cb-4.*ca*ccc;if(dd<0.){if(ca>0.)discard;}else{float rr=sqrt(max(dd,0.));float t0=(-cb-rr)/(2.*ca),t1=(-cb+rr)/(2.*ca);float lo=min(t0,t1),hi=max(t0,t1);if(ca>0.){nearT=max(nearT,lo);farT=min(farT,hi);}else if(nearT<lo)farT=min(farT,lo);else nearT=max(nearT,hi);}}
      if(farT<=nearT)discard;
      float stepT=(farT-nearT)/14.,sum=0.;
      for(int i=0;i<14;i++){vec3 p=vCamera+ray*(nearT+(float(i)+.5)*stepT);float radial=length(p.xz)/(.04+.96*p.y);
        float density=pow(max(0.,1.-radial*radial),1.65)*smoothstep(0.,.035,p.y)*(1.-smoothstep(.63,1.,p.y));
        density*=min(4.,1./(.18+p.y*1.4));
        density*=.81+.12*sin(p.y*18.+p.x*2.6-uTime*.18+vShape.z)+.07*sin(p.y*51.+uTime*.11);
        sum+=density;
      }
      float meters=length(ray*vec3(vShape.y,vShape.x,vShape.y));
      float alpha=1.-exp(-sum*stepT*meters*.021);
      gl_FragColor=vec4(vColor,alpha*.55);
      #include <colorspace_fragment>
      }`});
  const shafts=new THREE.Mesh(geometry,beamMaterial);shafts.name='LargeAtmosphericSearchlightShafts';shafts.frustumCulled=false;shafts.renderOrder=4;group.add(shafts);
  const haloGeometry=new THREE.InstancedBufferGeometry();const quad=new THREE.PlaneGeometry(1,1);haloGeometry.index=quad.index;haloGeometry.setAttribute('position',quad.getAttribute('position'));haloGeometry.setAttribute('uv',quad.getAttribute('uv'));
  haloGeometry.setAttribute('aSite',geometry.getAttribute('aSite'));haloGeometry.setAttribute('aColor',geometry.getAttribute('aColor'));haloGeometry.instanceCount=sites.length;
  const haloMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`attribute vec3 aSite,aColor;varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=aColor;vec4 p=modelViewMatrix*vec4(aSite,1.);p.xy+=position.xy*7.;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vColor;void main(){vec2 p=(vUv-.5)*2.;float alpha=exp(-dot(p,p)*7.)*(1.-smoothstep(.6,1.,length(p)));gl_FragColor=vec4(vColor,alpha*.52);}`});
  const halos=new THREE.Mesh(haloGeometry,haloMaterial);halos.name='SearchlightEmitterHalos';halos.frustumCulled=false;halos.renderOrder=3;group.add(halos);

  function sampleBeam(index,seconds=0){
    const s=sites[((Math.trunc(index)%sites.length)+sites.length)%sites.length];const t=Number.isFinite(seconds)?seconds:0;
    // Choreographed sweep: all heads share one slow phase (a small per-site
    // skew keeps them from being robotic), so the fleet leans and sweeps as
    // one. The old free phases sent six beams crossing the sky like scribble.
    const skew=s.phase*.13;
    const azimuth=s.azimuth+Math.sin(t*.039+skew)*.22,elevation=s.elevation+Math.sin(t*.027+skew*1.7)*.045;
    // Azimuth zero points toward -Z. The narrow sweep keeps the lower shaft
    // outside the elevated loop while the wider upper part crosses the sky.
    const dx=Math.sin(azimuth)*Math.cos(elevation),dy=Math.sin(elevation),dz=-Math.cos(azimuth)*Math.cos(elevation);
    return{x:s.x,y:s.y,z:s.z,dx,dy,dz,reach:s.reach,radius:s.radius,tip:[s.x+dx*s.reach,s.y+dy*s.reach,s.z+dz*s.reach]};
  }
  const transform=new THREE.Object3D(),axis=new THREE.Vector3(),zAxis=new THREE.Vector3(0,0,1),position=new THREE.Vector3();
  const source=geometry.getAttribute('aSite'),direction=geometry.getAttribute('aDirection');
  function update(seconds){
    const t=Number.isFinite(seconds)?seconds:0;uniforms.uTime.value=t;
    for(let i=0;i<sites.length;i++){const p=sampleBeam(i,t);axis.set(p.dx,p.dy,p.dz);position.set(p.x,p.y,p.z);
      transform.position.copy(position);transform.quaternion.setFromUnitVectors(zAxis,axis);transform.updateMatrix();heads.setMatrixAt(i,transform.matrix);lenses.setMatrixAt(i,transform.matrix);
      source.setXYZ(i,p.x+p.dx*.96,p.y+p.dy*.96,p.z+p.dz*.96);direction.setXYZ(i,p.dx,p.dy,p.dz);
    }
    heads.instanceMatrix.needsUpdate=true;lenses.instanceMatrix.needsUpdate=true;source.needsUpdate=true;direction.needsUpdate=true;
  }
  const clearance=sites.map(s=>Math.min(...buildings.map(b=>Math.hypot(Math.max(0,Math.abs(s.x-b.x)-b.width/2),Math.max(0,Math.abs(s.z-b.z)-b.depth/2))))-1.65);
  group.userData={sites,sampleBeam,update,uniforms,shafts,heads,lenses,clearance,
    view:{camera:[108,59,155],target:[-4,61,-16]},beamCount:sites.length};
  update(0);return group;
}
