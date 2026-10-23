import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One detailed geometry for each existing instanced batch. All surface colours
// are baked into vertices, keeping both the fleet draw count and rider tints.
export function colorRiderGeometry(geometry, hex = '#ffffff') {
  geometry.deleteAttribute('uv');
  const color = new THREE.Color(hex), count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function surface(geometry, color) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  return colorRiderGeometry(result, color);
}

function merge(parts) {
  const result = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

function box(x, y, z, w, h, d, color, pitch = 0) {
  return surface(new THREE.BoxGeometry(w, h, d).rotateX(pitch).translate(x, y, z), color);
}

function oval(x, y, z, rx, ry, rz, color, width = 10, height = 6) {
  return surface(new THREE.SphereGeometry(1, width, height).scale(rx, ry, rz).translate(x, y, z), color);
}

function rod(a, b, radiusA, radiusB, color, sides = 6) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
  return surface(geometry, color);
}

// Elliptical rings produce tailored shoulders, a narrow waist and a planted hip.
// Each ring is [height, half width, half depth, forward offset].
function garment(rings, color, sides = 8) {
  const vertices = [], indices = [];
  for (const [y, rx, rz, z] of rings) for (let i = 0; i < sides; i++) {
    const angle = (i + .5) / sides * Math.PI * 2;
    vertices.push(Math.cos(angle) * rx, y, z + Math.sin(angle) * rz);
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < sides; i++) {
    const a = j * sides + i, b = j * sides + (i + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i, i + 1);
    const end = (rings.length - 1) * sides;
    indices.push(end, end + i + 1, end + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return surface(geometry, color);
}

export function makeRiderModelDetails() {
  const frame = [], rider = [], helmet = [], neon = [], headlights = [];
  const graphite = '#243440', edge = '#657d88', alloy = '#a8b6bc';
  const rubber = '#111b23', dark = '#1b2731';

  // Two rubber tyres, open-looking spoke rims and independent brake discs.
  // Tyre extrema are y=0 and z=+/- .610, inside the original lane envelope.
  for (const z of [-.455, .455]) {
    frame.push(surface(new THREE.TorusGeometry(.122, .033, 6, 16).rotateY(Math.PI / 2).translate(0, .155, z), rubber));
    frame.push(rod([-.050, .155, z], [.050, .155, z], .029, .029, alloy, 8));
    for (const side of [-1, 1]) {
      frame.push(surface(new THREE.TorusGeometry(.095, .008, 4, 12).rotateY(Math.PI / 2).translate(side * .036, .155, z), edge));
      for (let i = 0; i < 5; i++) {
        const angle = i / 5 * Math.PI * 2;
        frame.push(rod([side * .036, .155, z], [side * .036, .155 + Math.sin(angle) * .088, z + Math.cos(angle) * .088], .006, .010, alloy, 4));
      }
    }
  }

  // Exposed swingarm, paired front forks and a compact battery drive.
  for (const side of [-1, 1]) {
    frame.push(rod([side * .065, .155, -.455], [side * .074, .325, -.08], .017, .024, graphite));
    frame.push(rod([side * .047, .155, .455], [side * .052, .524, .320], .012, .018, alloy));
    frame.push(rod([side * .046, .370, .377], [side * .052, .538, .318], .022, .022, graphite));
    frame.push(rod([side * .064, .240, -.330], [side * .062, .486, -.255], .011, .015, alloy));
    frame.push(rod([side * .067, .302, -.220], [side * .062, .450, -.265], .022, .022, edge));
    frame.push(rod([side * .072, .295, -.095], [side * .060, .510, .246], .017, .015, edge));
    frame.push(rod([side * .069, .305, -.130], [side * .066, .507, -.264], .015, .015, graphite));
    frame.push(box(side * .079, .338, -.039, .027, .123, .250, dark));
    for (let i = 0; i < 3; i++) frame.push(box(side * .095, .311 + i * .029, -.038, .008, .009, .182, edge));
    frame.push(rod([side * .079, .203, -.027], [side * .159, .203, -.027], .009, .009, alloy));
    neon.push(box(side * .104, .460, .108, .005, .020, .180, '#ffffff', .16));
  }
  frame.push(oval(0, .505, .107, .106, .095, .207, graphite));
  frame.push(oval(0, .529, .091, .091, .080, .170, '#536778'));
  frame.push(box(0, .599, .069, .044, .006, .055, alloy));
  frame.push(oval(0, .526, -.341, .099, .060, .147, graphite));
  frame.push(box(0, .570, -.265, .167, .036, .235, rubber, -.04));
  frame.push(box(0, .563, -.419, .119, .029, .074, '#455a66', -.20));
  frame.push(rod([-.143, .628, .307], [.143, .628, .307], .009, .009, alloy));
  frame.push(rod([0, .538, .308], [0, .628, .307], .017, .012, graphite));
  frame.push(box(0, .568, .373, .115, .073, .080, graphite, -.15));
  frame.push(box(0, .664, .341, .090, .064, .011, '#324d5b', -.27));
  frame.push(box(0, .542, -.488, .084, .033, .026, '#ad555a'));
  neon.push(box(0, .291, -.010, .069, .018, .283, '#b0d3d8'));
  neon.push(box(0, .560, -.491, .072, .013, .013, '#ffffff'));
  headlights.push(box(0, .573, .417, .095, .032, .010, '#ffffff', -.15));

  // Hips sit on the saddle; knees flank the tank and boots rest on footpegs.
  rider.push(garment([[.580,.072,.056,-.216],[.622,.067,.061,-.184],[.743,.084,.068,-.080],[.809,.087,.056,-.004],[.829,.048,.039,.021]], '#ffffff'));
  rider.push(garment([[.567,.079,.064,-.216],[.601,.075,.064,-.199]], '#596773'));
  for (const side of [-1, 1]) {
    rider.push(rod([side * .086, .785, .006], [side * .121, .691, .133], .043, .032, '#e1e9ec', 7));
    rider.push(rod([side * .121, .691, .133], [side * .135, .634, .286], .032, .024, '#b7c8d0', 7));
    rider.push(oval(side * .121, .691, .133, .033, .035, .036, '#8197a4', 7, 4));
    rider.push(rod([side * .067, .582, -.208], [side * .120, .449, .065], .049, .040, '#657583', 7));
    rider.push(rod([side * .120, .449, .065], [side * .128, .247, -.048], .040, .028, '#526470', 7));
    rider.push(oval(side * .122, .442, .072, .036, .042, .042, '#93a6b0', 7, 4));
    helmet.push(oval(side * .135, .627, .307, .023, .025, .029, dark, 7, 5));
    helmet.push(box(side * .132, .229, -.007, .053, .046, .131, rubber, -.025));
    helmet.push(box(side * .132, .209, -.007, .055, .009, .136, '#42525d'));
    // Reflective shoulder strips stay in the established neon-colour batch.
    neon.push(rod([side * .083, .818, .010], [side * .104, .785, .058], .006, .006, '#ffffff', 4));
  }
  helmet.push(rod([0, .819, .020], [0, .866, .071], .027, .027, dark, 8));
  helmet.push(oval(0, .941, .095, .083, .092, .087, '#354856', 12, 8));
  helmet.push(oval(0, .901, .125, .078, .029, .068, '#778d99', 10, 5));
  helmet.push(surface(new THREE.SphereGeometry(1, 12, 5, Math.PI * .12, Math.PI * .76, Math.PI * .36, Math.PI * .30)
    .scale(.086, .095, .090).translate(0, .941, .095), '#102a37'));
  for (const side of [-1, 1]) helmet.push(oval(side * .078, .943, .105, .007, .019, .020, alloy, 6, 4));
  neon.push(box(0, .974, .176, .077, .007, .004, '#d3f1ff', -.22));
  neon.push(box(0, .770, -.112, .107, .012, .008, '#ffffff', .85));

  return { Bikes: merge(frame), Riders: merge(rider), Helmets: merge(helmet), NeonParts: merge(neon), Headlights: merge(headlights) };
}
