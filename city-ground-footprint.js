// Shared world-XZ footprint: the distant city and wet road must never paint
// the same ground. Keep the radial limits and foreground opening in one place.
export const DISTANT_GROUND_GLSL = `
  bool isDistantCityGround(vec2 p) {
    float radius = length(p);
    return radius >= 142. && radius <= 510.
      && !(p.y > 70. && abs(p.x) < 130. + p.y * .30);
  }
`;

// These same rectangles build the opaque street slabs and exclude the wet
// surface underneath them. Keep the original four-vertical/four-horizontal order.
export const DISTRICT_ASPHALT_ROADS = {
  vertical: [-63, -21, 21, 63].map(x => ({ x, z: 0, width: 5.5, depth: 159 })),
  horizontal: [-75, -24, 24, 75].map(z => ({ x: 0, z, width: 132, depth: 5.5 })),
};

const glslFloat = value => Number.isInteger(value) ? `${value}.0` : String(value);
export const DISTRICT_ASPHALT_GLSL = `
  bool isDistrictAsphaltGround(vec2 p) {
    return ${[...DISTRICT_ASPHALT_ROADS.vertical, ...DISTRICT_ASPHALT_ROADS.horizontal].map(road => {
      const center = [road.x, road.z].map(glslFloat).join(', ');
      const halfSize = [road.width / 2, road.depth / 2].map(glslFloat).join(', ');
      return `all(lessThanEqual(abs(p - vec2(${center})), vec2(${halfSize})))`;
    }).join('\n      || ')};
  }
`;
