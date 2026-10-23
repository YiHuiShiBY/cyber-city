import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const VIEWS = {
  iso: [3, 1.9, 4], front: [0, 0, 5], side: [5, 0, 0],
  back: [0, 0, -5], top: [0, 5, .001],
};
const list = material => Array.isArray(material) ? material : [material];

/** One WebGL context for every comparison panel; model geometry comes from the city. */
export class ComparisonViewer {
  constructor(board, { onStats } = {}) {
    this.board = board;
    this.onStats = onStats;
    this.entries = [];
    this.elapsed = 0;
    this.state = { view: 'iso', wireframe: false, materialMode: 'original', light: 'studio', autoRotate: false, paused: true, linked: true };
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    const canvas = this.renderer.domElement;
    canvas.className = 'comparison-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    canvas.setAttribute('aria-hidden', 'true');
    board.prepend(canvas);
    this._resize = new ResizeObserver(() => { this.resize(); this.invalidate(); });
    this._resize.observe(board);
    this._visibility = () => {
      this.previousTime = undefined;
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; }
      else this.invalidate();
    };
    document.addEventListener('visibilitychange', this._visibility);
    this.resize();
  }

  show(items) {
    this._clear();
    this.elapsed = 0;
    const commonSize = new THREE.Vector3();
    try {
      for (const { variant, element } of items) {
        const model = variant.create();
        model.update?.(0);
        const object = model.object;
        object.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(object);
        if (bounds.isEmpty() || !Number.isFinite(bounds.min.length() + bounds.max.length())) {
          model.dispose?.();
          throw new Error(`角色 ${variant.label} 没有可观察的几何体`);
        }
        const size = bounds.getSize(new THREE.Vector3());
        commonSize.max(size);
        const center = bounds.getCenter(new THREE.Vector3());
        const wrapper = new THREE.Group();
        wrapper.position.set(-center.x, -bounds.min.y, -center.z);
        wrapper.add(object);
        const scene = new THREE.Scene();
        scene.add(wrapper);
        const entry = { variant, element, model, scene, wrapper, ownedMaterials: [], materialNodes: [], stats: { id: variant.id, meshes: 0, triangles: 0, width: size.x, height: size.y, depth: size.z } };
        this.entries.push(entry);
        object.traverse(node => {
          if (node.geometry) {
            entry.stats.meshes++;
            if (node.isMesh) entry.stats.triangles += (node.geometry.index?.count ?? node.geometry.attributes.position?.count ?? 0) / 3 * (node.isInstancedMesh ? node.count : 1);
          }
          if (!node.material) return;
          const originals = list(node.material).map(material => {
            const clone = material.clone();
            if (material.uniforms && !clone.uniforms) clone.uniforms = THREE.UniformsUtils.clone(material.uniforms);
            // Material.clone does not preserve custom shader hooks.
            clone.onBeforeCompile = material.onBeforeCompile;
            clone.customProgramCacheKey = material.customProgramCacheKey;
            entry.ownedMaterials.push(clone);
            return clone;
          });
          const clays = originals.map(material => {
            const clay = node.isMesh
              ? new THREE.MeshStandardMaterial({ color: '#d1d7d5', roughness: .82, metalness: 0, side: material.side })
              : material.clone();
            entry.ownedMaterials.push(clay);
            return clay;
          });
          entry.materialNodes.push({ node, array: Array.isArray(node.material), originals, clays });
        });
        entry.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .005, 200);
        entry.controls = new OrbitControls(entry.camera, element);
        entry.controls.enableDamping = false;
        entry.controls.minZoom = .35;
        entry.controls.maxZoom = 16;
        entry.controls.enablePan = true;
        entry.controls.screenSpacePanning = true;
        entry.controls.autoRotateSpeed = 1.5;
        entry.change = () => {
          if (!this.syncing && this.state.linked) this._sync(entry);
          this.invalidate();
        };
        entry.controls.addEventListener('change', entry.change);
        entry.doubleClick = () => this.reset();
        element.addEventListener('dblclick', entry.doubleClick);
        element.setAttribute('aria-label', `${variant.label} 三维预览，拖动旋转，滚轮缩放，右键平移，双击复位`);
        const hemi = new THREE.HemisphereLight('#e1f4ff', '#66756c', 2.4);
        const key = new THREE.DirectionalLight('#fff1d5', 3.2);
        key.position.set(4, 6, 5);
        const fill = new THREE.DirectionalLight('#9ccfff', 1.4);
        fill.position.set(-4, 2, -3);
        scene.add(hemi, key, fill);
        entry.lights = { hemi, key, fill };
      }
      this.commonSize = commonSize;
      const span = Math.max(commonSize.x, commonSize.y, commonSize.z, 1);
      for (const entry of this.entries) {
        const grid = new THREE.GridHelper(span * 3.6, 18, '#637d88', '#9bacb1');
        grid.position.y = -.012;
        grid.material.transparent = true;
        grid.material.opacity = .38;
        entry.grid = grid;
        entry.scene.add(grid);
      }
      this.setMaterialMode(this.state.materialMode);
      this.setLight(this.state.light);
      this.setView(this.state.view);
      this.onStats?.(this.getStats());
      this.resize();
      this.invalidate();
      return this.getStats();
    } catch (error) {
      this._clear();
      throw error;
    }
  }

  _sync(source) {
    this.syncing = true;
    for (const target of this.entries) {
      if (target === source) continue;
      target.camera.position.copy(source.camera.position);
      target.camera.quaternion.copy(source.camera.quaternion);
      target.camera.zoom = source.camera.zoom;
      target.controls.target.copy(source.controls.target);
      target.camera.updateProjectionMatrix();
      target.controls.update();
    }
    this.syncing = false;
  }

  _fit(entry) {
    if (!this.commonSize) return;
    const width = Math.max(entry.element.clientWidth, 1), height = Math.max(entry.element.clientHeight, 1);
    const aspect = width / height;
    const box = new THREE.Box3(
      new THREE.Vector3(-this.commonSize.x / 2, 0, -this.commonSize.z / 2),
      new THREE.Vector3(this.commonSize.x / 2, this.commonSize.y, this.commonSize.z / 2),
    );
    const viewRotation = entry.camera.quaternion.clone().invert();
    let horizontal = 0, vertical = 0;
    const center = new THREE.Vector3(0, this.commonSize.y / 2, 0);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(viewRotation);
      horizontal = Math.max(horizontal, Math.abs(point.x));
      vertical = Math.max(vertical, Math.abs(point.y));
    }
    // Leave room for the animation and for turning a wide umbrella into view.
    const half = Math.max(vertical, horizontal / aspect, this.commonSize.y * .34) * 1.3;
    entry.camera.left = -half * aspect;
    entry.camera.right = half * aspect;
    entry.camera.top = half;
    entry.camera.bottom = -half;
    entry.camera.updateProjectionMatrix();
  }

  setView(view = 'iso') {
    if (!VIEWS[view]) return;
    this.state.view = view;
    this.syncing = true;
    const span = Math.max(this.commonSize?.length() || 3, 1);
    for (const entry of this.entries) {
      const target = new THREE.Vector3(0, (this.commonSize?.y || 1) * .5, 0);
      entry.controls.target.copy(target);
      entry.camera.position.copy(new THREE.Vector3(...VIEWS[view]).normalize().multiplyScalar(span * 4).add(target));
      entry.camera.up.set(0, 1, 0);
      entry.camera.zoom = 1;
      entry.camera.lookAt(target);
      entry.camera.far = Math.max(span * 20, 100);
      entry.controls.update();
      this._fit(entry);
    }
    this.syncing = false;
    this.invalidate();
  }

  reset() { this.setView(this.state.view); }
  setLinked(value) { this.state.linked = !!value; if (value && this.entries.length) this._sync(this.entries[0]); this.invalidate(); }
  setAutoRotate(value) { this.state.autoRotate = !!value; this.invalidate(); }
  setPaused(value) { this.state.paused = !!value; this.previousTime = undefined; this.invalidate(); }
  setWireframe(value) { this.state.wireframe = !!value; this._applyMaterials(); }
  setMaterialMode(value) { this.state.materialMode = value === 'clay' ? 'clay' : 'original'; this._applyMaterials(); }

  _applyMaterials() {
    for (const entry of this.entries) for (const { node, array, originals, clays } of entry.materialNodes) {
      const chosen = this.state.materialMode === 'clay' ? clays : originals;
      for (const material of chosen) if ('wireframe' in material) material.wireframe = this.state.wireframe;
      node.material = array ? chosen : chosen[0];
    }
    this.invalidate();
  }

  setLight(value) {
    this.state.light = value === 'night' ? 'night' : 'studio';
    const night = this.state.light === 'night';
    for (const entry of this.entries) {
      entry.scene.background = new THREE.Color(night ? '#142333' : '#b9c9cf');
      entry.lights.hemi.intensity = night ? .8 : 2.4;
      entry.lights.key.intensity = night ? 1.1 : 3.2;
      entry.lights.fill.intensity = night ? 1.8 : 1.4;
      entry.grid.material.opacity = night ? .18 : .38;
    }
    this.invalidate();
  }

  getStats() { return this.entries.map(entry => ({ ...entry.stats })); }

  resize() {
    const rect = this.board.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width), 1), height = Math.max(Math.round(rect.height), 1);
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      this.renderer.setSize(width, height, false);
      for (const entry of this.entries) this._fit(entry);
    }
    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
    if (!this.frame && !document.hidden && !this.disposed) this.frame = requestAnimationFrame(time => this._tick(time));
  }

  _tick(time) {
    this.frame = 0;
    if (this.disposed || document.hidden) return;
    const delta = this.previousTime === undefined ? 0 : Math.min((time - this.previousTime) / 1000, .1);
    this.previousTime = time;
    const moving = !this.state.paused || this.state.autoRotate;
    if (!this.state.paused) this.elapsed += delta;
    if (this.dirty || !this.lastRender || time - this.lastRender >= 1000 / 30) {
      if (!this.state.paused) for (const entry of this.entries) entry.model.update?.(this.elapsed);
      if (this.state.autoRotate) {
        const rotating = this.state.linked ? this.entries.slice(0, 1) : this.entries;
        for (const entry of rotating) {
          const offset = entry.camera.position.clone().sub(entry.controls.target);
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), .012);
          entry.camera.position.copy(entry.controls.target).add(offset);
          entry.controls.update();
        }
      }
      this.render();
      this.lastRender = time;
      this.dirty = false;
    }
    if (moving && !this.frame) this.frame = requestAnimationFrame(next => this._tick(next));
  }

  render() {
    const board = this.board.getBoundingClientRect();
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    for (const entry of this.entries) {
      const rect = entry.element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const x = rect.left - board.left, y = board.bottom - rect.bottom;
      this.renderer.setViewport(x, y, rect.width, rect.height);
      this.renderer.setScissor(Math.max(x, 0), Math.max(y, 0), Math.max(0, Math.min(rect.width, board.width - x)), Math.max(0, Math.min(rect.height, board.height - y)));
      this.renderer.render(entry.scene, entry.camera);
    }
    this.renderer.setScissorTest(false);
  }

  capture() {
    this.render();
    const canvas = document.createElement('canvas');
    const source = this.renderer.domElement, ratio = source.width / this.width;
    canvas.width = source.width; canvas.height = source.height + Math.round(56 * ratio);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#132329'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d5f1ed'; ctx.font = `${16 * ratio}px sans-serif`;
    ctx.fillText('雨夜霓虹 · 角色管理台  /  ' + new Date().toLocaleString('zh-CN'), 20 * ratio, 33 * ratio);
    ctx.drawImage(source, 0, 56 * ratio);
    const board = this.board.getBoundingClientRect();
    ctx.font = `${12 * ratio}px sans-serif`;
    for (const entry of this.entries) {
      const rect = entry.element.getBoundingClientRect();
      const x = (rect.left - board.left + 10) * ratio, y = (rect.top - board.top + 78) * ratio;
      ctx.fillStyle = '#132329dc'; ctx.fillRect(x - 5 * ratio, y - 16 * ratio, Math.min(rect.width - 20, ctx.measureText(entry.variant.label).width / ratio + 18) * ratio, 24 * ratio);
      ctx.fillStyle = '#e1f5ef'; ctx.fillText(entry.variant.label, x, y, (rect.width - 32) * ratio);
    }
    const link = document.createElement('a');
    link.download = `角色对照-${this.entries[0]?.variant.id || 'preview'}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png'); link.click();
    return link.href;
  }

  _clear() {
    for (const entry of this.entries) {
      entry.controls?.dispose();
      entry.element.removeEventListener('dblclick', entry.doubleClick);
      for (const material of entry.ownedMaterials) material.dispose();
      entry.grid?.geometry.dispose();
      entry.grid?.material.dispose();
      entry.model.dispose?.();
      entry.scene.clear();
    }
    this.entries = [];
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this._resize.disconnect();
    document.removeEventListener('visibilitychange', this._visibility);
    this._clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
