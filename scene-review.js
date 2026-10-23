import * as THREE from 'three';
import { DISTRICT_ASPHALT_ROADS } from './city-ground-footprint.js';

const GROUND_NAMES = new Set(['RainPolishedAsphalt', 'DistantCity-UrbanGround']);
const EFFECT_BRANCHES = /(?:WetReflection|HazeGradient|Hologram|Searchlights|RainAtmosphere|DistrictWeather|Moon)/i;
const COLORS = ['#83ece0', '#ffd18b', '#caafff', '#ffabc7', '#a3d5ff', '#c6e899'];
const fixed = (value, digits = 3) => Number(value).toFixed(digits);
const coordinates = position => position.map(value => fixed(value)).join(' / ');

// CPU counterpart of DISTANT_GROUND_GLSL. A plane's triangle hit alone cannot
// tell whether its fragment shader discards that point.
function distantGroundContains(x, z) {
  const radius = Math.hypot(x, z);
  return radius >= 142 && radius <= 510 && !(z > 70 && Math.abs(x) < 130 + z * .30);
}

function groundHitVisible(hit) {
  const { x, z } = hit.point, object = hit.object;
  if (object.name === 'DistantCity-UrbanGround') return distantGroundContains(x, z);
  if (object.name !== 'RainPolishedAsphalt' || object.material.uniforms.uDistrict.value <= .5) return true;
  if (distantGroundContains(x, z)) return false;
  return ![...DISTRICT_ASPHALT_ROADS.vertical, ...DISTRICT_ASPHALT_ROADS.horizontal].some(road =>
    Math.abs(x - road.x) <= road.width / 2 && Math.abs(z - road.z) <= road.depth / 2);
}

function objectPath(object) {
  const segments = [];
  for (let node = object; node; node = node.parent) {
    const label = node.name || node.type;
    if (!node.parent) { segments.push(label); continue; }
    const peers = node.parent.children.filter(peer => (peer.name || peer.type) === label);
    segments.push(peers.length > 1 ? `${label}[${peers.indexOf(node)}]` : label);
  }
  return segments.reverse().join(' / ');
}

export function formatReviewPoint(point) {
  const instance = point.instanceId === null ? '' : `\n实例索引：${point.instanceId}`;
  return `场景审阅 #${point.id}\n世界坐标 X / Y / Z：${coordinates(point.position)}\n对象：${point.objectPath}${instance}`
    + `\n场景时间：${fixed(point.sceneTime)} 秒\n镜头位置：${coordinates(point.camera.position)}`
    + `\n镜头目标：${coordinates(point.camera.target)}\n精确记录：${JSON.stringify(point)}`;
}

/**
 * DOM-only review annotations. onEnabledChange owns pausing/restoring the app's
 * clock and cruise. Call update() after camera/LOD updates in the existing loop.
 * All saved positions are immutable world-space snapshots, not object followers.
 */
export function createSceneReview({ scene, camera, domElement, controls, getSceneTime = () => 0,
  onEnabledChange = () => {}, toggleButton = null }) {
  const doc = domElement.ownerDocument, win = doc.defaultView;
  let enabled = false, disposed = false, nextId = 1, pointer = null, pressed = null;
  let dirty = false, lastPick = -Infinity, hovered = null, collapsed = false;
  const activePointers = new Set(), records = [], pins = new Map(), proxies = new Map();
  const proxySources = new WeakMap(), raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const projected = new THREE.Vector3(), cameraSpace = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const root = element('div', 'scene-review'); root.hidden = true;
  const pinLayer = element('div', 'scene-review__pins'); pinLayer.setAttribute('aria-hidden', 'true');
  const hover = element('div', 'scene-review__hover'); hover.hidden = true; hover.setAttribute('aria-hidden', 'true');
  const hoverName = element('strong'), hoverPosition = element('span'), hoverHint = element('small', '', '单击添加标记');
  hover.append(hoverName, hoverPosition, hoverHint);
  const panel = element('section', 'scene-review__panel'); panel.setAttribute('aria-label', '场景审阅标记');
  const heading = element('div', 'scene-review__heading');
  const title = element('h2', '', '场景审阅'), counter = element('span', 'scene-review__count', '0 个标记');
  const collapse = button('收起', 'collapse'); collapse.setAttribute('aria-label', '收起或展开标记列表');
  const exit = button('退出 · Esc', 'exit'); exit.setAttribute('aria-label', '退出场景审阅');
  heading.append(title, counter, collapse, exit);
  const help = element('p', 'scene-review__help', '单击实体表面添加坐标点，拖动继续观察。');
  const list = element('ol', 'scene-review__list'); list.setAttribute('aria-label', '坐标标记列表');
  const empty = element('p', 'scene-review__empty', '还没有标记\n将指针移到场景中，选择需要讨论的位置。');
  const actions = element('div', 'scene-review__actions');
  const copyAll = button('复制全部', 'copy-all'), clear = button('清空标记', 'clear');
  actions.append(copyAll, clear);
  const status = element('p', 'scene-review__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const manualCopy = element('textarea', 'scene-review__manual-copy');
  manualCopy.hidden = true; manualCopy.readOnly = true; manualCopy.setAttribute('aria-label', '待复制的审阅记录');
  panel.append(heading, help, empty, list, actions, status, manualCopy);
  root.append(pinLayer, hover, panel); doc.body.append(root);

  function element(tag, className = '', text = '') {
    const node = doc.createElement(tag); if (className) node.className = className; node.textContent = text; return node;
  }
  function button(text, action, id) {
    const node = element('button', '', text); node.type = 'button'; node.dataset.reviewAction = action;
    if (id !== undefined) node.dataset.reviewId = String(id);
    return node;
  }
  function announce(text) { status.textContent = text; }
  function setCollapsed(value) {
    collapsed = value; panel.classList.toggle('scene-review__panel--collapsed', collapsed);
    collapse.textContent = collapsed ? '展开' : '收起'; collapse.setAttribute('aria-expanded', String(!collapsed));
  }
  function physicalMaterial(material) {
    return material && material.visible !== false && material.opacity > .01 && !material.transparent
      && material.depthWrite !== false && !material.isShaderMaterial && !material.isRawShaderMaterial
      && (material.blending === THREE.NormalBlending || material.blending === THREE.NoBlending);
  }

  // District GPU crowd does not write its rendered transforms to instanceMatrix.
  // Materialize exactly its known shader transform into an unrendered CPU proxy;
  // no geometry/material is changed or added to the city scene.
  function crowdProxy(source) {
    const attributes = source.geometry.attributes;
    if (!['aP0', 'aP1', 'aP2', 'aP3', 'aP4'].every(name => attributes[name])) return null;
    if (!source.isInstancedMesh || !source.material.customProgramCacheKey().startsWith('gpu-crowd-')) return null;
    let entry = proxies.get(source);
    if (!entry) {
      const shader = { uniforms: {}, vertexShader: '', fragmentShader: '' };
      source.material.onBeforeCompile(shader);
      if (!['uMount', 'uScale', 'uKind', 'uSide', 'uAccessory'].every(name => shader.uniforms[name])) return null;
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, source.count);
      mesh.matrixAutoUpdate = false;
      entry = { mesh, uniforms: shader.uniforms, revision: null, shown: [] };
      proxies.set(source, entry); proxySources.set(mesh, source);
    }
    const revision = [source.geometry.uuid, source.count, ...['aP0', 'aP1', 'aP2', 'aP3', 'aP4'].map(name => attributes[name].version)].join(':');
    if (entry.revision !== revision) {
      const u = entry.uniforms, mount = u.uMount.value, scale = u.uScale.value;
      const { aP0: p0, aP1: p1, aP2: p2, aP3: p3, aP4: p4 } = attributes;
      entry.mesh.geometry = source.geometry; entry.mesh.count = source.count;
      for (let i = 0; i < source.count; i++) {
        const c = u.uKind.value < 1.5 ? p1.getX(i) : p1.getZ(i);
        const s = u.uKind.value < 1.5 ? p1.getY(i) : p1.getW(i);
        const ca = u.uKind.value > 1.5 ? (u.uSide.value < .5 ? p2.getZ(i) : p3.getX(i)) : 1;
        const sa = u.uKind.value > 1.5 ? (u.uSide.value < .5 ? p2.getW(i) : p3.getY(i)) : 0;
        const shown = !((u.uAccessory.value > .5 && p4.getX(i) < .5) || p4.getY(i) > .5);
        entry.shown[i] = shown;
        const sx = shown ? scale.x : 0, sy = shown ? scale.y : 0, sz = shown ? scale.z : 0;
        matrix.set(sx * c, sy * s * sa, sz * s * ca, p0.getX(i) + mount.x * c + mount.z * s,
          0, sy * ca, -sz * sa, p0.getY(i) + mount.y + p0.getW(i),
          -sx * s, sy * c * sa, sz * c * ca, p0.getZ(i) - mount.x * s + mount.z * c,
          0, 0, 0, 1);
        entry.mesh.setMatrixAt(i, matrix);
      }
      entry.mesh.boundingSphere = null; entry.mesh.computeBoundingSphere(); entry.revision = revision;
    }
    entry.mesh.matrixWorld.copy(source.matrixWorld);
    entry.mesh.layers.mask = source.layers.mask;
    return entry.mesh;
  }

  // Raycaster lazily caches InstancedMesh bounds. Keep a separate accurate
  // snapshot so a later review session cannot use last session's moving bounds,
  // and the app's intentionally conservative rendering bounds stay untouched.
  function instanceProxy(source) {
    let entry = proxies.get(source);
    if (!entry) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, source.instanceMatrix.count);
      mesh.matrixAutoUpdate = false; entry = { mesh, revision: null };
      proxies.set(source, entry); proxySources.set(mesh, source);
    }
    const revision = `${source.geometry.uuid}:${source.instanceMatrix.version}:${source.count}`;
    if (entry.revision !== revision) {
      entry.mesh.geometry = source.geometry; entry.mesh.material = source.material; entry.mesh.count = source.count;
      entry.mesh.instanceMatrix.copy(source.instanceMatrix);
      entry.mesh.boundingSphere = null; entry.mesh.computeBoundingSphere(); entry.revision = revision;
    }
    entry.mesh.matrixWorld.copy(source.matrixWorld); entry.mesh.layers.mask = source.layers.mask;
    return entry.mesh;
  }

  function pick(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    ndc.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera); raycaster.layers.mask = camera.layers.mask;
    const candidates = [];
    function visit(object) {
      if (!object.visible || object.userData.reviewPickable === false || EFFECT_BRANCHES.test(object.name)) return;
      if (object.isMesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (GROUND_NAMES.has(object.name)) candidates.push(object);
        else if (materials.some(physicalMaterial)) {
          // Unit boxes are shared with GPU umbrella poles, so ordinary streets
          // and vehicles can also carry aP0..aP4. Only the active material tells
          // whether those attributes actually displace the rendered vertices.
          const programs = materials.map(material => material.customProgramCacheKey());
          if (programs.some(key => key.startsWith('gpu-'))) {
            // Known GPU crowd has an exact CPU counterpart. Other explicitly
            // GPU-transformed programs are not pickable until one is supplied.
            if (materials.length === 1 && programs[0].startsWith('gpu-crowd-')) {
              const proxy = crowdProxy(object); if (proxy) candidates.push(proxy);
            }
          } else candidates.push(object.isInstancedMesh ? instanceProxy(object) : object);
        }
      }
      for (const child of object.children) visit(child);
    }
    visit(scene);
    for (const hit of raycaster.intersectObjects(candidates, false)) {
      const source = proxySources.get(hit.object);
      if (source) {
        const shown = proxies.get(source).shown;
        if (shown && !shown[hit.instanceId]) continue;
        hit.object = source;
      }
      const object = hit.object;
      if (!GROUND_NAMES.has(object.name)) {
        const material = Array.isArray(object.material) ? object.material[hit.face?.materialIndex || 0] : object.material;
        if (!physicalMaterial(material)) continue;
      } else if (!groundHitVisible(hit)) continue;
      cameraSpace.copy(hit.point).applyMatrix4(camera.matrixWorldInverse);
      if (-cameraSpace.z < camera.near || -cameraSpace.z > camera.far) continue;
      return hit;
    }
    return null;
  }

  function describe(hit) {
    const object = hit.object;
    return { position: hit.point.toArray(), objectName: object.name || object.type, objectPath: objectPath(object),
      objectType: object.type, instanceId: Number.isInteger(hit.instanceId) ? hit.instanceId : null,
      faceIndex: Number.isInteger(hit.faceIndex) ? hit.faceIndex : null };
  }
  function addPoint(hit) {
    const record = { id: nextId++, ...describe(hit), sceneTime: Number(getSceneTime()) || 0, createdAt: new Date().toISOString(),
      camera: { position: camera.position.toArray(), target: controls.target.toArray(), quaternion: camera.quaternion.toArray(),
        fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect, zoom: camera.zoom } };
    records.push(record);
    const pin = element('div', 'scene-review__pin'); pin.dataset.reviewId = String(record.id);
    pin.style.setProperty('--review-color', COLORS[(record.id - 1) % COLORS.length]);
    const number = element('span', 'scene-review__pin-number', String(record.id));
    const label = element('span', 'scene-review__pin-label');
    label.append(element('strong', '', record.objectName + (record.instanceId === null ? '' : ` · ${record.instanceId}`)), element('span', '', coordinates(record.position)));
    pin.append(number, label); pinLayer.append(pin); pins.set(record.id, pin);
    setCollapsed(false); renderList(); announce(`已添加标记 #${record.id}`); update();
  }
  function renderList() {
    list.replaceChildren(); counter.textContent = `${records.length} 个标记`;
    empty.hidden = records.length > 0; clear.disabled = copyAll.disabled = records.length === 0;
    for (const record of records) {
      const row = element('li', 'scene-review__item'); row.dataset.reviewId = String(record.id);
      row.style.setProperty('--review-color', COLORS[(record.id - 1) % COLORS.length]);
      const top = element('div', 'scene-review__item-top');
      top.append(element('span', 'scene-review__item-number', `#${record.id}`), element('strong', '', record.objectName));
      const xyz = element('div', 'scene-review__coordinates');
      ['X', 'Y', 'Z'].forEach((axis, i) => xyz.append(element('span', '', `${axis} ${fixed(record.position[i])}`)));
      const path = element('p', 'scene-review__path', record.objectPath + (record.instanceId === null ? '' : ` · 实例 ${record.instanceId}`));
      path.title = path.textContent;
      const actions = element('div', 'scene-review__item-actions');
      const copy = button('复制坐标', 'copy', record.id), remove = button('删除', 'delete', record.id);
      copy.setAttribute('aria-label', `复制标记 #${record.id} 的完整记录`); remove.setAttribute('aria-label', `删除标记 #${record.id}`);
      actions.append(copy, remove); row.append(top, xyz, path, actions); list.append(row);
    }
  }
  async function copyText(text) {
    manualCopy.hidden = true;
    try {
      if (!win.navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await win.navigator.clipboard.writeText(text); announce('已复制，可直接粘贴到对话中');
    } catch {
      if (disposed) return;
      manualCopy.value = text; manualCopy.hidden = false; manualCopy.focus(); manualCopy.select();
      let copied = false;
      try { copied = doc.execCommand('copy'); } catch { /* Keep the selected, visible text for manual copying. */ }
      if (copied) { manualCopy.hidden = true; announce('已复制，可直接粘贴到对话中'); }
      else announce('已选中完整记录，请按 Ctrl+C 复制');
    }
  }
  function onPanelClick(event) {
    const target = event.target.closest('[data-review-action]'); if (!target || !panel.contains(target)) return;
    const action = target.dataset.reviewAction, id = Number(target.dataset.reviewId);
    if (action === 'collapse') setCollapsed(!collapsed);
    if (action === 'exit') setEnabled(false);
    if (action === 'copy-all' && records.length) copyText(records.map(formatReviewPoint).join('\n\n---\n\n'));
    if (action === 'copy') { const record = records.find(point => point.id === id); if (record) copyText(formatReviewPoint(record)); }
    if (action === 'delete') {
      const index = records.findIndex(point => point.id === id); if (index < 0) return;
      records.splice(index, 1); pins.get(id)?.remove(); pins.delete(id); renderList(); announce(`已删除标记 #${id}`);
    }
    if (action === 'clear') {
      records.length = 0; pins.forEach(pin => pin.remove()); pins.clear(); renderList(); announce('标记已清空');
    }
  }

  function onPointerMove(event) {
    pointer = { x: event.clientX, y: event.clientY }; dirty = true;
    if (pressed && (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6 || event.pointerId !== pressed.id)) pressed.dragged = true;
    if (pressed) hover.hidden = true;
  }
  function onPointerDown(event) {
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) { if (pressed) pressed.dragged = true; return; }
    if (event.button !== 0 || event.isPrimary === false) return;
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    hover.hidden = true;
  }
  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (!pressed || event.pointerId !== pressed.id) return;
    const tap = !pressed.dragged && activePointers.size === 0 && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= 6;
    pressed = null; pointer = { x: event.clientX, y: event.clientY }; dirty = true;
    if (!tap) return;
    const hit = pick(event.clientX, event.clientY);
    if (hit) addPoint(hit); else announce('此处没有可标记的实体表面，请换一个位置');
  }
  function onPointerCancel() { pressed = null; activePointers.clear(); hover.hidden = true; }
  function onPointerLeave() { pointer = null; hovered = null; dirty = false; hover.hidden = true; }
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); setEnabled(false); toggleButton?.focus({ preventScroll: true }); }
  }
  function onCameraChange() { if (pointer) dirty = true; }
  function onBlur() { onPointerCancel(); onPointerLeave(); }

  function setEnabled(value) {
    const next = Boolean(value); if (disposed || enabled === next) return;
    enabled = next; root.hidden = !enabled; domElement.classList.toggle('scene-review-canvas', enabled);
    if (toggleButton) { toggleButton.setAttribute('aria-pressed', String(enabled)); toggleButton.textContent = `审阅 · ${enabled ? '开' : '关'}`; }
    const method = enabled ? 'addEventListener' : 'removeEventListener';
    domElement[method]('pointermove', onPointerMove); domElement[method]('pointerdown', onPointerDown);
    domElement[method]('pointerleave', onPointerLeave); win[method]('pointerup', onPointerUp);
    win[method]('pointercancel', onPointerCancel); win[method]('blur', onBlur); doc[method]('keydown', onKeyDown, true);
    controls[method]('change', onCameraChange);
    onBlur(); lastPick = -Infinity; manualCopy.hidden = true;
    if (!enabled) { for (const entry of proxies.values()) entry.mesh.dispose(); proxies.clear(); }
    onEnabledChange(enabled);
    if (enabled) {
      setCollapsed(win.matchMedia('(max-width: 650px), (max-height: 600px)').matches);
      renderList(); announce('场景已暂停，可添加多个标记'); update();
    }
  }
  function toggle() { setEnabled(!enabled); }
  function update() {
    if (!enabled || disposed) return;
    const rect = domElement.getBoundingClientRect(); camera.updateMatrixWorld(true);
    for (const record of records) {
      const pin = pins.get(record.id); projected.fromArray(record.position);
      cameraSpace.copy(projected).applyMatrix4(camera.matrixWorldInverse); projected.project(camera);
      const visible = cameraSpace.z < 0 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1;
      pin.hidden = !visible;
      if (visible) {
        pin.style.left = `${rect.left + (projected.x * .5 + .5) * rect.width}px`;
        pin.style.top = `${rect.top + (-projected.y * .5 + .5) * rect.height}px`;
        pin.classList.toggle('scene-review__pin--left', projected.x > .4);
      }
    }
    const now = win.performance.now();
    if (!pointer || pressed || !dirty || now - lastPick < 100) return;
    dirty = false; lastPick = now; hovered = pick(pointer.x, pointer.y);
    hover.hidden = !hovered;
    if (hovered) {
      const description = describe(hovered);
      hoverName.textContent = description.objectName + (description.instanceId === null ? '' : ` · 实例 ${description.instanceId}`);
      hoverPosition.textContent = `X / Y / Z  ${coordinates(description.position)}`;
      hover.style.left = `${Math.max(8, Math.min(win.innerWidth - 300, pointer.x + 18))}px`;
      hover.style.top = `${Math.max(8, Math.min(win.innerHeight - 92, pointer.y + 18))}px`;
    }
  }
  function dispose() {
    if (disposed) return; setEnabled(false); disposed = true;
    toggleButton?.removeEventListener('click', toggle); panel.removeEventListener('click', onPanelClick); root.remove();
  }
  panel.addEventListener('click', onPanelClick); toggleButton?.addEventListener('click', toggle);
  if (toggleButton) toggleButton.setAttribute('aria-pressed', 'false');
  setCollapsed(false); renderList();
  return { setEnabled, toggle, update, dispose, getPoints: () => JSON.parse(JSON.stringify(records)), get enabled() { return enabled; } };
}
