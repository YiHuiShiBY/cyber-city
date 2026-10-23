// The district's lit windows are one InstancedMesh (`DistrictStyleBatch-*`: the unit plane
// against the shared `light` material), so giving every window an organised on/off rhythm
// costs **no extra draw call and no per-frame CPU work**: each lit pane carries a four-float
// instanced attribute and the pattern is evaluated in the vertex shader from absolute
// seconds. That keeps the project rule that animation is a function of scene time, so pause,
// rewind and freeze all behave.
//
//   aBlink = (kind, phase, floorNorm, columnNorm)
//
// `kind` 0 means "not an animated window" and the shader returns 1, which is what the
// non-window instances of that same batch (there are none today, but the attribute is
// deliberately optional) need. A missing attribute reads as (0,0,0,1) in WebGL, so kind 0
// catches that case too instead of picking up a bogus phase.
//
// The rhythm is derived from the building ordinal, the face index, the floor row and the
// column -- never from `rng()`. Consuming one extra random number here would shift every
// pane, height and paint colour downstream of `windows()` in the shared stream, and the
// frozen-height / frozen-paint contract and every pixel A/B would stop meaning anything.
export const WINDOW_BLINK_ATTRIBUTE = 'aBlink';

// Rates are read as "one full pass per 1/rate seconds": the sweep crosses a facade in ~18 s,
// the group rhythm flips an office block roughly every 10 s, the chase runs the width in ~12 s.
const SWEEP_RATE = .055;
const GROUP_RATE = .62;
const CHASE_RATE = .085;

export function makeWindowBlinkUniforms() {
  return { uBlinkTime: { value: 0 } };
}

// Level 1 is the baked colour. The values are tuned as a pair: the dark state has to read as a
// window that is genuinely off (0.10 is under a tenth of the authored colour, i.e. black at
// night), and the bright state has to read as one that is on without clipping to white, so it
// stays below ~1.7x. The base values are then set so each rhythm averages close to 1.0 across the
// facade -- without that the whole district would simply lose a quarter of its glow, which is the
// one thing a night skyline cannot afford. Peak-to-trough is about 14:1.
const LEVELS = {
  sweepDim: .66, sweepCrest: 1.02,
  groupOn: 1.36, groupHalf: .84, groupOff: .10,
  chaseDim: .68, chaseCrest: .96,
};

function blinkSource(attributeName) {
  return `attribute vec4 ${attributeName};
uniform float uBlinkTime;
float windowBlinkLevel(vec4 win, float t) {
  if (win.x < .5) return 1.;
  if (win.x < 1.5) {
    // Upward sweep: one bright band climbs the facade and everything behind it stays low.
    float f = fract(win.z - t * ${SWEEP_RATE.toFixed(4)} + win.y);
    float crest = exp(-pow((f - .10) / .16, 2.));
    return ${LEVELS.sweepDim.toFixed(2)} + ${LEVELS.sweepCrest.toFixed(2)} * crest;
  }
  if (win.x < 2.5) {
    // Floor groups: whole floors switch together like an office tower, three states deep.
    float group = floor(win.z * 7. + win.y * 7.);
    float s = sin((t + win.y * 41.) * ${GROUP_RATE.toFixed(4)} + group * 2.1);
    if (s > .30) return ${LEVELS.groupOn.toFixed(2)};
    if (s > -.45) return ${LEVELS.groupHalf.toFixed(2)};
    return ${LEVELS.groupOff.toFixed(2)};
  }
  // Column chase: the same band, but running along the facade instead of up it.
  float f = fract(win.w * 2. - t * ${CHASE_RATE.toFixed(4)} + win.y);
  float crest = exp(-pow((f - .08) / .14, 2.));
  return ${LEVELS.chaseDim.toFixed(2)} + ${LEVELS.chaseCrest.toFixed(2)} * crest;
}
`;
}

/**
 * Makes `material` scale every instance's colour by the window rhythm. Chains onto whatever
 * `onBeforeCompile` the material already has, so it can sit on top of another injection.
 */
export function applyWindowBlink(material, uniforms, cacheKey, attributeName = WINDOW_BLINK_ATTRIBUTE) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    injectWindowBlink(shader, uniforms, attributeName);
  };
  // The cache key has to change with the injection or the renderer reuses a program compiled
  // without it -- the window batch would silently keep its static colours.
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|window-blink`;
  return material;
}

/** Adds the attribute, the uniform and the colour multiply to an already-built shader. */
export function injectWindowBlink(shader, uniforms, attributeName = WINDOW_BLINK_ATTRIBUTE) {
  shader.uniforms.uBlinkTime = uniforms.uBlinkTime;
  shader.vertexShader = blinkSource(attributeName) + shader.vertexShader;
  // `color_vertex` has just written instanceColor into vColor, so scaling it here is exactly
  // "this pane is on a lower/higher setting right now".
  shader.vertexShader = shader.vertexShader.replace(
    '#include <color_vertex>',
    '#include <color_vertex>\n\tvColor.rgb *= windowBlinkLevel(' + attributeName + ', uBlinkTime);',
  );
  return shader;
}

/** kind 1..3 for a building, chosen so neighbouring buildings do not all run the same pattern. */
export function blinkKindFor(ordinal, face) {
  return 1 + ((ordinal * 2 + face) % 3);
}

/** Phase in 0..1, again position-derived rather than random. */
export function blinkPhaseFor(ordinal, face) {
  return ((ordinal * 7 + face * 3) % 11) / 11;
}
