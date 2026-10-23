import { Vector3 } from 'three';

const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const KEY_CODES = {
  w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', q: 'KeyQ', e: 'KeyE',
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
};

export function createKeyboardNavigation({ camera, controls, domElement, onMove, speed = 3.6, boost = 2.5, bounds = {} }) {
  const ownerDocument = domElement.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const held = new Set();
  const forward = new Vector3();
  const displacement = new Vector3();
  const limits = { minX: -75, maxX: 75, minY: .45, maxY: 90, minZ: -75, maxZ: 75, ...bounds };
  const previousTabIndex = domElement.getAttribute('tabindex');
  const addedTabIndex = previousTabIndex === null;
  if (addedTabIndex) domElement.tabIndex = 0;

  let lastTime = null;
  let accelerating = false;
  let travelling = false;
  let disposed = false;
  let headingX = 0;
  let headingZ = -1;

  const now = () => ownerWindow.performance.now() / 1000;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const movementCode = event => MOVEMENT_CODES.has(event.code)
    ? event.code : KEY_CODES[String(event.key || '').toLowerCase()];
  const isShift = event => event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight';

  function boundedStep(position, step, low, high) {
    if (step === 0) return 0;
    // Preset views may begin outside the travel area; approach it without snapping.
    if (position > high) return step < 0 ? Math.max(low, position + step) - position : 0;
    if (position < low) return step > 0 ? Math.min(high, position + step) - position : 0;
    return clamp(position + step, low, high) - position;
  }

  function isEditable(node) {
    let element = node?.nodeType === 1 ? node : node?.parentElement;
    while (element) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable) return true;
      const editable = element.getAttribute?.('contenteditable');
      if (editable !== null && editable !== undefined && editable.toLowerCase() !== 'false') return true;
      element = element.parentElement;
    }
    return false;
  }

  function shouldIgnore(event) {
    return event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229 ||
      ownerDocument.hidden || isEditable(ownerDocument.activeElement) ||
      (event.composedPath?.() || [event.target]).some(isEditable);
  }

  function reset() {
    held.clear();
    lastTime = null;
    accelerating = false;
    travelling = false;
  }

  function update(seconds) {
    if (disposed || !Number.isFinite(seconds)) return;
    if (!held.size) {
      lastTime = seconds;
      travelling = false;
      return;
    }
    if (lastTime === null) {
      lastTime = seconds;
      return;
    }
    const delta = clamp(seconds - lastTime, 0, .1);
    lastTime = seconds;

    const ahead = Number(held.has('KeyW') || held.has('ArrowUp')) - Number(held.has('KeyS') || held.has('ArrowDown'));
    const right = Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft'));
    const rise = Number(held.has('KeyE')) - Number(held.has('KeyQ'));
    if (!ahead && !right && !rise) {
      travelling = false;
      return;
    }
    if (!delta) return;

    camera.getWorldDirection(forward);
    const groundLength = Math.hypot(forward.x, forward.z);
    if (groundLength > 1e-8) {
      headingX = forward.x / groundLength;
      headingZ = forward.z / groundLength;
    }
    // A vertical camera keeps its last usable ground heading.
    displacement.set(headingX * ahead - headingZ * right, rise, headingZ * ahead + headingX * right);
    displacement.normalize().multiplyScalar(delta * speed * (accelerating ? boost : 1));
    displacement.set(
      boundedStep(camera.position.x, displacement.x, limits.minX, limits.maxX),
      boundedStep(camera.position.y, displacement.y, limits.minY, limits.maxY),
      boundedStep(camera.position.z, displacement.z, limits.minZ, limits.maxZ),
    );
    if (displacement.lengthSq() < 1e-20) {
      travelling = false;
      return;
    }

    if (!travelling || controls.autoRotate) onMove?.();
    travelling = true;
    camera.position.add(displacement);
    controls.target.add(displacement);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      reset();
      return;
    }
    if (event.defaultPrevented || shouldIgnore(event)) {
      reset();
      return;
    }
    const code = movementCode(event);
    const shift = isShift(event);
    if (!code && !shift) return;

    const seconds = now();
    // Settle the previous combination before changing direction or speed.
    update(seconds);
    accelerating = Boolean(event.shiftKey || shift);
    if (code) {
      if (!held.size) lastTime = seconds;
      held.add(code);
      if (code.startsWith('Arrow')) event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const code = movementCode(event);
    const shift = isShift(event);
    if ((!code || !held.has(code)) && !shift) return;
    if (shouldIgnore(event)) {
      reset();
      return;
    }

    // This also captures taps that begin and end between animation frames.
    update(now());
    accelerating = Boolean(event.shiftKey);
    if (code) held.delete(code);
    if (!held.size) {
      lastTime = null;
      travelling = false;
    }
  }

  function onFocusIn(event) {
    if (isEditable(event.target) || (event.composedPath?.() || []).some(isEditable)) reset();
  }
  function onVisibilityChange() {
    if (ownerDocument.hidden) reset();
  }
  function onPointerDown() {
    domElement.focus({ preventScroll: true });
  }

  ownerDocument.addEventListener('keydown', onKeyDown);
  ownerDocument.addEventListener('keyup', onKeyUp);
  ownerDocument.addEventListener('focusin', onFocusIn);
  ownerDocument.addEventListener('visibilitychange', onVisibilityChange);
  ownerWindow.addEventListener('blur', reset);
  domElement.addEventListener('pointerdown', onPointerDown);

  function dispose() {
    if (disposed) return;
    reset();
    disposed = true;
    ownerDocument.removeEventListener('keydown', onKeyDown);
    ownerDocument.removeEventListener('keyup', onKeyUp);
    ownerDocument.removeEventListener('focusin', onFocusIn);
    ownerDocument.removeEventListener('visibilitychange', onVisibilityChange);
    ownerWindow.removeEventListener('blur', reset);
    domElement.removeEventListener('pointerdown', onPointerDown);
    if (addedTabIndex && domElement.getAttribute('tabindex') === '0') domElement.removeAttribute('tabindex');
  }

  return { update, reset, dispose };
}
