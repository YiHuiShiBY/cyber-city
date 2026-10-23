// Distance-driven gait: reversible absolute-time sampling, with no shared RNG.
// Integral of |cos(theta)| keeps footsteps continuous through route turnarounds.
function travel(theta) {
  const interval = Math.floor((theta + Math.PI / 2) / Math.PI);
  return 2 * interval + Math.sin(theta - interval * Math.PI);
}
export function sampleWalkingGait(time, frequency, amplitude, phase, out = {}) {
  const theta = time * frequency + phase;
  const velocity = frequency * amplitude * Math.cos(theta);
  const distance = amplitude * (travel(theta) - travel(phase));
  const cycle = distance * Math.PI * 2 / .44 + phase;
  const speed = Math.abs(velocity);
  const amount = Math.min(1, speed / .55);
  const effort = amount * amount * (3 - 2 * amount);
  out.velocity = velocity;
  out.stride = Math.cos(cycle) * .42 * effort;
  out.liftLeft = Math.max(0, -Math.sin(cycle)) * .075 * effort;
  out.liftRight = Math.max(0, Math.sin(cycle)) * .075 * effort;
  out.bob = Math.abs(Math.sin(cycle)) * .012 * effort;
  out.twist = Math.sin(cycle) * .045 * effort;
  return out;
}
