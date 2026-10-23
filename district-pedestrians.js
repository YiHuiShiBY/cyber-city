import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Local units match the original 1.12-unit citizens. The same authored shapes
// feed the city and the inspector; only distant city views use the coarse set.
function colored(geometry, color) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute('uv');
  const rgb = new THREE.Color(color), count = result.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

// Elliptical cross-sections give garments a waist, shoulders and an actual hem.
// Rings are [y, radiusX, radiusZ, centreX?, centreZ?].
function profile(rings, sides, color, caps = true) {
  const positions = [], indices = [];
  for (const [y, rx, rz, x = 0, z = 0] of rings) for (let i = 0; i < sides; i++) {
    const angle = (i + .5) / sides * Math.PI * 2;
    positions.push(x + Math.cos(angle) * rx, y, z + Math.sin(angle) * rz);
  }
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) {
    const a = r * sides + i, b = r * sides + (i + 1) % sides, c = a + sides, d = b + sides;
    indices.push(a, c, b, b, c, d);
  }
  if (caps) for (const r of [0, rings.length - 1]) {
    const base = r * sides;
    for (let i = 1; i < sides - 1; i++) {
      if (r === 0) indices.push(base, base + i, base + i + 1);
      else indices.push(base, base + i + 1, base + i);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return colored(geometry, color);
}

function ellipsoid(x, y, z, sx, sy, sz, color, width = 8, height = 6) {
  return colored(new THREE.SphereGeometry(1, width, height).scale(sx, sy, sz).translate(x, y, z), color);
}

function patch(x, y, z, width, height, color) {
  return colored(new THREE.PlaneGeometry(width, height).translate(x, y, z), color);
}

function merge(pieces) {
  const geometry = mergeGeometries(pieces);
  pieces.forEach(piece => piece.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function coat(detail) {
  const high = detail === 'high';
  const rings = high
    ? [[.515,.097,.060],[.553,.092,.057],[.705,.079,.052],[.825,.101,.058],[.855,.097,.054],[.882,.043,.039]]
    : [[.515,.122,.073],[.705,.10,.064],[.853,.122,.070]];
  const pieces = [profile(rings, high ? 8 : 4, '#ffffff')];
  if (high) {
    pieces.push(profile([[.860,.047,.042],[.901,.040,.036]], 8, '#d5dcd8', false));
    pieces.push(patch(0,.684,.058,.008,.273,'#6f7c7b'));
    for (const side of [-1, 1]) {
      pieces.push(patch(side*.055,.623,.058,.047,.012,'#b0beb9'));
      pieces.push(patch(side*.055,.586,.058,.002,.055,'#c7d1cc'));
    }
  }
  return merge(pieces);
}

function head(detail) {
  const high = detail === 'high', skin = '#bea08b', hair = '#28343b';
  const pieces = [];
  if (high) {
    pieces.push(ellipsoid(0,1.023,.003,.061,.088,.057,skin,10,8));
    pieces.push(colored(new THREE.SphereGeometry(1,10,5,0,Math.PI*2,0,Math.PI*.44)
      .scale(.064,.09,.061).translate(0,1.03,.003),hair));
    // Short sideburns, ears, a small nose and two recessed eyes establish a front.
    for (const side of [-1, 1]) {
      pieces.push(ellipsoid(side*.059,1.020,.001,.010,.020,.015,skin,6,4));
      pieces.push(patch(side*.023,1.043,.055,.010,.005,'#3f3936'));
    }
    pieces.push(ellipsoid(0,1.025,.058,.010,.014,.016,'#b3917b',6,4));
    pieces.push(patch(0,.998,.054,.018,.003,'#8d7063'));
    pieces.push(profile([[.882,.022,.022],[.957,.023,.024]],8,skin,false));
  } else {
    // A compact three-ring head retains the new proportions and dark hair from afar.
    const face = profile([[.935,.043,.040],[1.070,.067,.061]],6,skin);
    const p = face.attributes.position, c = face.attributes.color, dark = new THREE.Color(hair);
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.06) c.setXYZ(i,dark.r,dark.g,dark.b);
    pieces.push(face);
    pieces.push(colored(new THREE.ConeGeometry(1,1,4).scale(.067,.05,.061).translate(0,1.095,0),hair));
    pieces.push(profile([[.866,.025,.025],[.946,.025,.025]],4,skin,false));
  }
  return merge(pieces);
}

function leg(detail) {
  const high = detail === 'high';
  if (!high) return profile([
    [-.530,.046,.085,0,.023],[-.455,.033,.055,0,.018],[0,.052,.051,0,0],
  ],4,'#28353e');
  return merge([
    profile([[-.466,.027,.031,0,.006],[-.252,.034,.037,0,.018],[-.055,.041,.043,0,0],[0,.043,.043,0,0]],8,'#35414b'),
    profile([[-.513,.038,.068,0,.026],[-.472,.037,.065,0,.022],[-.448,.026,.040,0,.005]],8,'#37424a'),
    profile([[-.530,.039,.070,0,.026],[-.512,.040,.070,0,.026]],8,'#1c252d'),
    patch(0,-.487,.090,.039,.008,'#616b6c'),
  ]);
}

export function makeDistrictPedestrianParts() {
  const high = { coat: coat('high'), head: head('high'), leg: leg('high') };
  const low = { coat: coat('low'), head: head('low'), leg: leg('low') };
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84 });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .76 });
  const trousers = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .87 });
  const arms = [-1,1].flatMap(side => {
    const sleeve = detail => {
      const high = detail === 'high';
      return profile(high ? [[-.312,.020,.024,side*.003,.030],[-.162,.025,.027,side*.008,.013],[0,.026,.027,0,0]]
        : [[-.312,.026,.030,side*.003,.030],[-.001,.034,.032,0,0]], high ? 6 : 4, '#e4e9e7');
    };
    const hand = detail => detail === 'high'
      ? ellipsoid(side*.003,-.332,.031,.019,.028,.021,'#bea08b',6,4)
      : colored(new THREE.TetrahedronGeometry(1).scale(.018,.028,.020).translate(side*.003,-.332,.031),'#bea08b');
    return [
      { name:side<0?'LeftSleeves':'RightSleeves',geometry:sleeve('high'),lowGeometry:sleeve('low'),material:cloth,kind:'arm',tintCoat:true,side,x:side*.103,y:.837,scale:[1,1,1] },
      { name:side<0?'LeftHands':'RightHands',geometry:hand('high'),lowGeometry:hand('low'),material:skin,kind:'arm',side,x:side*.103,y:.837,scale:[1,1,1] },
    ];
  });
  return [
    { name:'Coats',geometry:high.coat,lowGeometry:low.coat,material:cloth,scale:[1,1,1],y:0,kind:'coat' },
    { name:'Heads',geometry:high.head,lowGeometry:low.head,material:skin,scale:[1,1,1],y:0,kind:'head' },
    { name:'Legs',geometry:high.leg,lowGeometry:low.leg,material:trousers,scale:[1,1,1],x:-.059,z:-.009,y:.530,kind:'leg',side:-1 },
    { name:'RightLegs',geometry:high.leg,lowGeometry:low.leg,material:trousers,scale:[1,1,1],x:.059,z:.009,y:.530,kind:'leg',side:1 },
    ...arms,
  ];
}
