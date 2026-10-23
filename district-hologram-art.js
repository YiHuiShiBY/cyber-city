// Procedural artwork for the existing single instanced panel batch. Placement,
// palette, presets and the absolute scene clock remain owned by its factory.
// Attachment chord in the panel's local frame. The disc uses a chord just inside
// its lower rim; a three-tile banner attaches to the bottom of its lowest tile.
export function projectionAperture(width, height, form) {
  if (form > .5 && form < 1.5) {
    const span = Math.min(width, height);
    return { halfWidth: span * .20, bottom: -span * .40 };
  }
  return { halfWidth: width * .45, bottom: height * (form > 1.5 ? -.4758333333333333 : -.4275) };
}

export const vertexShader = `
attribute vec3 aSite,aColor;
attribute vec2 aSize;
attribute float aSeed,aYaw,aKind,aForm;
varying vec2 vUv;
varying vec3 vColor;
varying float vSeed,vKind,vForm,vAspect;
void main(){
  vUv=uv;vColor=aColor;vSeed=aSeed;vKind=aKind;vForm=aForm;
  vAspect=aSize.x/max(aSize.y,.001);
  vec3 local=vec3(position.x*aSize.x,position.y*aSize.y,position.z);
  float cy=cos(aYaw),sy=sin(aYaw);
  vec3 world=aSite+vec3(local.x*cy+local.z*sy,local.y,-local.x*sy+local.z*cy);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
}`;

export const fragmentShader = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying float vSeed,vKind,vForm,vAspect;
const float PI=3.14159265359;
const float TAU=6.28318530718;

float stroke(float distance,float width){
  float aa=max(fwidth(distance)*.8,.0006);
  return 1.-smoothstep(width-aa,width+aa,abs(distance));
}
float segment(vec2 p,vec2 a,vec2 b,float width){
  vec2 ab=b-a;
  return stroke(length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),.00001),0.,1.)),width);
}
float boxDistance(vec2 p,vec2 halfSize){
  vec2 d=abs(p)-halfSize;
  return length(max(d,0.))+min(max(d.x,d.y),0.);
}
float fillBox(vec2 p,vec2 halfSize){
  float d=boxDistance(p,halfSize),aa=max(fwidth(d),.001);
  return 1.-smoothstep(-aa,aa,d);
}
float ring(vec2 p,float radius,float width){return stroke(length(p)-radius,width);}
float dotMark(vec2 p,float radius){
  float d=length(p),aa=max(fwidth(d),.001);
  return 1.-smoothstep(radius-aa,radius+aa,d);
}
mat2 rotation(float angle){float c=cos(angle),s=sin(angle);return mat2(c,-s,s,c);}
float bit(float mask,float index){return mod(floor(mask/exp2(index)),2.);}
float digit(vec2 p,float number){
  float n=mod(floor(number),10.);
  float mask=n<.5?63.:n<1.5?6.:n<2.5?91.:n<3.5?79.:n<4.5?102.:
    n<5.5?109.:n<6.5?125.:n<7.5?7.:n<8.5?127.:111.;
  return bit(mask,0.)*segment(p,vec2(-.24,.46),vec2(.24,.46),.047)
    +bit(mask,1.)*segment(p,vec2(.28,.40),vec2(.28,.055),.047)
    +bit(mask,2.)*segment(p,vec2(.28,-.055),vec2(.28,-.40),.047)
    +bit(mask,3.)*segment(p,vec2(-.24,-.46),vec2(.24,-.46),.047)
    +bit(mask,4.)*segment(p,vec2(-.28,-.055),vec2(-.28,-.40),.047)
    +bit(mask,5.)*segment(p,vec2(-.28,.055),vec2(-.28,.40),.047)
    +bit(mask,6.)*segment(p,vec2(-.24,0.),vec2(.24,0.),.047);
}

// Channels are structure / accent / bright detail, composed into a restrained
// three-colour palette at the end rather than one uniformly filled light patch.
vec3 framing(vec2 p,float kind,float serial){
  vec3 art=vec3(0.);
  vec2 a=abs(p);
  art.x+=stroke(boxDistance(p,vec2(.88,.79)),.0035)*.32;
  art.z+=stroke(a.x-.88,.008)*step(.58,a.y)*step(a.y,.79);
  art.z+=stroke(a.y-.79,.008)*step(.68,a.x)*step(a.x,.88);
  art.x+=segment(p,vec2(-.77,.59),vec2(.76,.59),.003)*.35;
  art.x+=segment(p,vec2(-.77,-.61),vec2(.76,-.61),.003)*.35;
  art.z+=digit((p-vec2(-.735,.69))/vec2(.082,.13),kind+1.)*.76;
  art.y+=digit((p-vec2(.65,.69))/vec2(.067,.10),floor(serial/10.))*.65;
  art.y+=digit((p-vec2(.72,.69))/vec2(.067,.10),serial)*.65;
  art.x+=fillBox(p-vec2(-.43,.72),vec2(.16,.014))*.38;
  art.x+=fillBox(p-vec2(-.48,.66),vec2(.11,.010))*.22;
  float ticks=stroke(fract((p.x+.75)*12.)-.5,.07)*step(abs(p.x),.74);
  art.x+=ticks*stroke(p.y+.695,.014)*.36;
  art.y+=segment(p,vec2(-.75,-.746),vec2(-.24,-.746),.006)*.72;
  art.z+=dotMark(p-vec2(.73,-.745),.012)*.7;
  return art;
}

vec3 navigation(vec2 p,float time,float seed){
  vec3 art=vec3(0.);
  float area=fillBox(p,vec2(.76,.53));
  vec2 grid=vec2(p.x+p.y*.38,p.y)*vec2(5.,7.);
  art.x+=(stroke(fract(grid.x)-.5,.013)+stroke(fract(grid.y)-.5,.013))*area*.085;
  // Continuous district contour and a bright route provide a stable hierarchy.
  art.x+=segment(p,vec2(-.71,-.44),vec2(-.56,-.18),.005)*.42;
  art.x+=segment(p,vec2(-.56,-.18),vec2(-.59,.29),.005)*.42;
  art.x+=segment(p,vec2(-.59,.29),vec2(-.20,.48),.005)*.42;
  art.x+=segment(p,vec2(-.20,.48),vec2(.10,.37),.005)*.42;
  art.x+=segment(p,vec2(.10,.37),vec2(.63,.48),.005)*.42;
  art.x+=segment(p,vec2(-.64,-.37),vec2(-.36,-.10),.011)*.84;
  art.x+=segment(p,vec2(-.36,-.10),vec2(-.12,-.10),.011)*.84;
  art.x+=segment(p,vec2(-.12,-.10),vec2(.13,.19),.011)*.84;
  art.x+=segment(p,vec2(.13,.19),vec2(.51,.19),.011)*.84;
  art.x+=segment(p,vec2(.51,.19),vec2(.67,.39),.011)*.84;
  for(int i=0;i<5;i++){
    float n=float(i);
    vec2 node=n<.5?vec2(-.64,-.37):n<1.5?vec2(-.36,-.10):n<2.5?vec2(-.12,-.10):n<3.5?vec2(.13,.19):vec2(.51,.19);
    art.z+=dotMark(p-node,.017)*.82;
    art.y+=ring(p-node,.045,.005)*(.58+.10*sin(time*.7+n+seed));
  }
  vec2 vehicle=mix(vec2(-.12,-.10),vec2(.13,.19),.5+.5*sin(time*.32+seed));
  art.y+=dotMark(p-vehicle,.017);
  art.y+=ring(p-vehicle,.076,.003)*.26;
  for(int i=0;i<3;i++){
    float row=float(i),y=-.25-row*.096;
    art.x+=stroke(boxDistance(p-vec2(.40,y),vec2(.27,.025)),.0025)*.22;
    art.z+=segment(p,vec2(.145,y),vec2(.29+row*.11,y),.007)*.48;
    art.y+=dotMark(p-vec2(.71,y),.009)*.52;
  }
  return art;
}

vec3 orbital(vec2 p,float time,float seed,float aspect){
  vec3 art=vec3(0.);
  vec2 g=p*vec2(aspect,1.)/(.50*min(aspect,1.));
  float radius=length(g),inside=1.-smoothstep(.975,1.025,radius);
  art.x+=ring(g,1.,.012)*.66;
  art.z+=ring(g,1.12,.005)*.48;
  art.x+=ring(g,1.26,.006)*.22;
  art.x+=ring(g*vec2(2.25,1.),1.,.012)*inside*.27;
  art.x+=ring(g*vec2(1.28,1.),1.,.010)*inside*.22;
  for(int i=0;i<3;i++){
    float y=(float(i)-1.)*.45;
    art.x+=ring((g-vec2(0.,y))/vec2(sqrt(1.-y*y),.22),1.,.025)*inside*.28;
  }
  float angle=atan(g.y,g.x),phase=time*.19+seed;
  float angularTick=stroke(fract((angle+PI)/TAU*32.)-.5,.075);
  art.z+=angularTick*ring(g,1.19,.032)*.56;
  vec2 axis=vec2(cos(phase),sin(phase));
  art.y+=segment(g,vec2(0.),axis*.98,.010)*.7;
  float trail=pow(max(0.,cos(angle-phase)),18.);
  art.y+=trail*inside*.075;
  vec2 tilted=rotation(.52)*g;
  art.y+=ring(tilted/vec2(1.35,.47),1.,.008)*.65;
  for(int i=0;i<3;i++){
    float a=phase+float(i)*2.14;
    vec2 point=rotation(-.52)*vec2(cos(a)*1.35,sin(a)*.47);
    art.z+=dotMark(g-point,.035)*.82;
    art.y+=ring(g-point,.080,.009)*.32;
  }
  art.z+=segment(g,vec2(-.09,0.),vec2(.09,0.),.008)*.55;
  art.z+=segment(g,vec2(0.,-.09),vec2(0.,.09),.008)*.55;
  return art;
}

vec3 spectrum(vec2 p,float time,float seed){
  vec3 art=vec3(0.);
  art.x+=segment(p,vec2(-.73,-.49),vec2(.73,-.49),.004)*.6;
  for(int i=0;i<16;i++){
    float n=float(i),x=-.69+n*.092;
    float level=.29+.14*sin(n*.69+time*.83+seed)+.10*sin(n*1.57-time*1.13);
    level+=.16*exp(-pow((n-7.5)/4.5,2.));
    float bar=fillBox(p-vec2(x,-.46+level*.5),vec2(.025,level*.5));
    float slots=.60+.40*smoothstep(.14,.26,fract((p.y+.47)*21.));
    art.x+=bar*slots*.65;
    art.y+=segment(p,vec2(x-.025,-.46+level+.018),vec2(x+.025,-.46+level+.018),.006)*.86;
    art.z+=dotMark(p-vec2(x,-.54),.007)*.27;
  }
  float window=1.-smoothstep(.67,.75,abs(p.x));
  float wave=.33+.085*sin(p.x*12.-time*.72+seed)*(.52+.48*cos(p.x*2.3));
  float echo=.33+.039*sin(p.x*18.+time*.43+seed);
  art.z+=stroke(p.y-wave,.008)*window*.66;
  art.y+=stroke(p.y-echo,.004)*window*.28;
  art.x+=stroke(p.y-.33,.002)*window*.13;
  return art;
}

vec3 statusBoard(vec2 p,float time,float seed){
  vec3 art=vec3(0.);
  for(int i=0;i<3;i++){
    float row=float(i),y=.34-row*.34;
    vec2 icon=rotation(PI*.25)*(p-vec2(-.63,y));
    art.y+=stroke(boxDistance(icon,vec2(.055)),.005)*.74;
    art.z+=digit((p-vec2(-.46,y))/vec2(.08,.14),row+1.)*.70;
    art.x+=segment(p,vec2(-.33,y+.062),vec2(.66,y+.062),.003)*.24;
    float level=.51+.15*sin(seed+row*1.4+time*.21);
    for(int j=0;j<9;j++){
      float col=float(j),x=-.27+col*.109;
      float outline=stroke(boxDistance(p-vec2(x,y),vec2(.041,.030)),.0025);
      art.x+=outline*.25;
      art.x+=fillBox(p-vec2(x,y),vec2(.034,.022))*step(col/9.,level)*.64;
    }
    art.z+=segment(p,vec2(-.31,y-.087),vec2(.05+row*.16,y-.087),.004)*.32;
    art.y+=dotMark(p-vec2(.72,y),.014)*(.68+.12*sin(time*.6+row));
  }
  return art;
}

vec3 energy(vec2 p,float time,float seed){
  vec3 art=vec3(0.);
  float phase=time*.48+seed,window=1.-smoothstep(.66,.75,abs(p.x));
  float wave=sin(p.x*8.+phase)*.23;
  art.x+=stroke(p.y-wave,.011)*window*.85;
  art.y+=stroke(p.y+wave,.008)*window*.80;
  for(int i=0;i<12;i++){
    float x=-.66+float(i)*.12,y=sin(x*8.+phase)*.23;
    art.x+=segment(p,vec2(x,-y),vec2(x,y),.003)*.27;
    art.z+=dotMark(p-vec2(x,y),.014)*.60;
    art.z+=dotMark(p-vec2(x,-y),.010)*.36;
  }
  art.x+=segment(p,vec2(-.72,.39),vec2(.72,.39),.003)*.25;
  art.x+=segment(p,vec2(-.72,-.39),vec2(.72,-.39),.003)*.25;
  float pulse=fract(time*.085+seed*.16);
  float head=-.66+pulse*1.32;
  art.y+=segment(p,vec2(-.66,.45),vec2(head,.45),.007)*.72;
  art.z+=dotMark(p-vec2(head,.45),.016)*.72;
  art.z+=digit((p-vec2(-.67,-.49))/vec2(.07,.12),4.)*.65;
  art.z+=digit((p-vec2(-.59,-.49))/vec2(.07,.12),8.)*.65;
  for(int i=0;i<7;i++){
    float x=.10+float(i)*.085;
    art.x+=fillBox(p-vec2(x,-.49),vec2(.021,.018))*.36;
    art.y+=fillBox(p-vec2(x,-.49),vec2(.021,.018))*step(float(i),4.)*.28;
  }
  return art;
}

void main(){
  vec2 uv=vUv;
  float kind=vKind,tile=0.,aspect=max(vAspect,.10);
  // Each third is a complete inset panel, with an actual gap between panels.
  // The authored seed and roster remain unchanged; only the artwork varies.
  if(vForm>1.5){
    tile=min(floor(vUv.y*3.),2.);
    uv.y=fract(vUv.y*3.);aspect*=3.;kind=mod(vKind+tile,5.);
  }
  vec2 p=(uv-.5)*2.;
  float signedEdge;
  if(vForm>.5&&vForm<1.5){
    signedEdge=length(p*vec2(aspect,1.))-.90*min(aspect,1.);
  }else{
    signedEdge=boxDistance(p*vec2(aspect,1.),vec2(.90*aspect,.82))-.035;
  }
  float aa=max(fwidth(signedEdge),.001);
  float mask=1.-smoothstep(-aa,aa,signedEdge);
  if(mask<.001)discard;
  float time=uTime,seed=vSeed+tile*1.73;
  vec3 art;
  if(kind<.5)art=navigation(p,time,seed);
  else if(kind<1.5)art=orbital(p,time,seed,aspect);
  else if(kind<2.5)art=spectrum(p,time,seed);
  else if(kind<3.5)art=statusBoard(p,time,seed);
  else art=energy(p,time,seed);

  if(vForm>.5&&vForm<1.5){
    vec2 c=p*vec2(aspect,1.)/min(aspect,1.);
    art.x+=ring(c,.855,.004)*.40;
    art.y+=ring(c,.885,.006)*.40;
    float marks=stroke(fract((atan(c.y,c.x)+PI)/TAU*48.)-.5,.08);
    art.z+=marks*ring(c,.825,.019)*.44;
  }else art+=framing(p,kind,mod(floor(vSeed*9.)+tile,99.));

  art=clamp(art,0.,1.15);
  vec3 base=mix(vColor,vec3(.35,.88,1.),.10);
  vec3 accent=mix(vec3(.75,.43,1.),vec3(1.,.68,.30),step(vColor.r,vColor.b));
  accent=mix(accent,vec3(.31,.93,.91),step(.85,vColor.r)*.52);
  vec3 white=mix(vec3(.82,.96,1.),vColor,.13);
  float signal=max(art.x,max(art.y,art.z));
  float rim=exp(-abs(signedEdge)*75.)*.06;
  float scan=.97+.03*sin(vUv.y*260.-time*.42);
  float breath=.98+.02*sin(time*.52+vSeed);
  // Lift partial-coverage lines without lighting the empty screen surface.
  // Brighter nodes can feed bloom while secondary strokes retain their colour.
  float alpha=(.008+sqrt(signal)*.82+rim)*mask*scan*breath;
  vec3 colour=base*(.045+art.x*1.55)+accent*art.y*1.60+white*art.z*1.75;
  colour+=white*smoothstep(.80,1.15,art.z)*.16;
  gl_FragColor=vec4(colour,clamp(alpha,0.,.95));
  #include <colorspace_fragment>
}`;
