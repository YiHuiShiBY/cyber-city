/* 操作模式套件 · TownControlsSuite
 * 从千人小镇三模式体系泛化：环绕 / 键鼠第一人称（Pointer Lock）/ 触屏轮盘。
 * 各 demo 引入本文件后调用 mount(cfg)：
 *   TownControlsSuite.mount({
 *     mount: 画布容器（面板/摇杆的挂载点，需 position:relative）,
 *     storageKey: 'xxx-controls',          // localStorage 键（隐藏状态+手动模式记忆）
 *     modes: ['orbit','fps','moba'],       // 启用的模式子集
 *     hints: { orbit: [[键,说明],...], fps: [...], moba: [...] },  // 各模式键位说明
 *     auto: true,                          // 首访自动识别（触屏→moba 若启用，否则 orbit）
 *     onModeChange(mode){},                // 模式切换回调（demo 侧启停自己的控制）
 *     fps: { target: 锁定元素, onLook(dyaw,dpitch), onMove({x,y,z}) },  // 键鼠适配
 *     moba: { onMove({x,y}) }              // 轮盘适配：x 右 y 前，-1..1，松手回调 {0,0}
 *   });
 * 说明：fps 的 WASD/QE 由本套件捕获并按帧回调 onMove（仅 fps 模式且未聚焦输入框时）；
 * 鼠标视角为 FPS 瞄准约定（向右看右，已取负 yaw），demo 侧直接累加即可。
 */
(function () {
  'use strict';
  var MODE_LABELS = { orbit: '环绕', fps: '键鼠', moba: '轮盘' };

  function mount(cfg) {
    var root = cfg.mount;
    if (!root) return null;
    var modes = (cfg.modes && cfg.modes.length ? cfg.modes : ['orbit']);
    var storageKey = cfg.storageKey || 'tcs-controls';
    var mode = 'orbit', hidden = false;

    /* ---------- DOM ---------- */
    var panel = document.createElement('div');
    panel.className = 'tcs-panel';
    panel.setAttribute('aria-label', '镜头操作说明');
    var head = document.createElement('div');
    head.className = 'tcs-head';
    var title = document.createElement('span');
    title.textContent = '⌨ 镜头操作';
    var hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.textContent = '隐藏 ✕';
    hideBtn.title = '隐藏操作说明';
    head.appendChild(title);
    head.appendChild(hideBtn);
    panel.appendChild(head);

    var chips = document.createElement('div');
    chips.className = 'tcs-modes';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', '操作模式');
    modes.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tcs-chip';
      b.dataset.mode = m;
      b.textContent = MODE_LABELS[m] || m;
      b.addEventListener('click', function () { setMode(m); try { localStorage.setItem(storageKey + '-mode', m); } catch (e) {} });
      chips.appendChild(b);
    });
    panel.appendChild(chips);

    var body = document.createElement('div');
    body.className = 'tcs-body';
    panel.appendChild(body);

    var entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'tcs-entry';
    entry.textContent = '⌨ 操作';
    entry.setAttribute('aria-label', '展开镜头操作说明');

    var joystick = null, knob = null;
    if (modes.indexOf('moba') >= 0 && cfg.moba && cfg.moba.onMove) {
      joystick = document.createElement('div');
      joystick.className = 'tcs-joystick';
      joystick.hidden = true;
      joystick.setAttribute('aria-label', '移动轮盘');
      var base = document.createElement('div');
      base.className = 'tcs-joy-base';
      knob = document.createElement('div');
      knob.className = 'tcs-joy-knob';
      base.appendChild(knob);
      joystick.appendChild(base);
    }

    var hintBar = null;
    if (modes.indexOf('fps') >= 0 && cfg.fps) {
      hintBar = document.createElement('div');
      hintBar.className = 'tcs-fps-hint';
      hintBar.hidden = true;
    }

    root.appendChild(panel);
    root.appendChild(entry);
    if (joystick) root.appendChild(joystick);
    if (hintBar) root.appendChild(hintBar);

    /* ---------- 说明表 ---------- */
    function renderHints() {
      var rows = (cfg.hints && cfg.hints[mode]) || [];
      var html = '';
      rows.forEach(function (r) { html += '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; });
      body.innerHTML = html ? '<dl>' + html + '</dl>' : '';
    }

    /* ---------- 模式状态机 ---------- */
    function setMode(m) {
      if (modes.indexOf(m) < 0) return;
      mode = m;
      Array.prototype.forEach.call(chips.children, function (c) {
        c.setAttribute('aria-pressed', String(c.dataset.mode === m));
      });
      renderHints();
      if (joystick) joystick.hidden = m !== 'moba';
      if (hintBar) { hintBar.hidden = m !== 'fps'; fadeTimer(0); }
      if (m !== 'fps' && document.pointerLockElement) document.exitPointerLock();
      if (m !== 'moba' && cfg.moba && cfg.moba.onMove) cfg.moba.onMove({ x: 0, y: 0 });
      if (cfg.onModeChange) cfg.onModeChange(m);
    }

    /* ---------- 隐藏 / 展开两态 ---------- */
    function applyHidden(v) {
      hidden = v;
      panel.hidden = hidden;
      entry.hidden = !hidden;
      try { localStorage.setItem(storageKey + '-hidden', hidden ? '1' : '0'); } catch (e) {}
    }
    hideBtn.addEventListener('click', function () { applyHidden(true); });
    entry.addEventListener('click', function () { applyHidden(false); });

    /* ---------- 键鼠：Pointer Lock 视角 + WASD/QE 移动 ---------- */
    var fadeT = null;
    function fadeTimer(start) {
      clearTimeout(fadeT);
      if (hintBar) hintBar.classList.remove('tcs-faded');
      if (start && hintBar) fadeT = setTimeout(function () { hintBar.classList.add('tcs-faded'); }, 6000);
    }
    if (cfg.fps && cfg.fps.target) {
      var target = cfg.fps.target;
      target.addEventListener('pointerdown', function (e) {
        if (mode !== 'fps' || document.pointerLockElement || e.pointerType === 'touch') return;
        if (target.requestPointerLock) { try { target.requestPointerLock(); } catch (err) {} }
      });
      document.addEventListener('pointerlockchange', function () {
        if (mode !== 'fps' || !hintBar) return;
        var locked = document.pointerLockElement === target;
        hintBar.textContent = locked ? 'WASD 移动 · Q/E 升降 · 鼠标转视角 · Esc 释放鼠标' : '点击画面锁定鼠标，进入第一人称操控';
        fadeTimer(locked ? 1 : 0);
      });
      document.addEventListener('mousemove', function (e) {
        if (mode !== 'fps' || document.pointerLockElement !== target || !cfg.fps.onLook) return;
        cfg.fps.onLook(-e.movementX * .0026, e.movementY * .0022);
      });
      /* WASD/QE 按键向量 → 按帧回调 onMove */
      var keys = {};
      var MOVE = { KeyW: [0, 1, 0], KeyS: [0, -1, 0], KeyA: [-1, 0, 0], KeyD: [1, 0, 0], KeyQ: [0, 0, 1], KeyE: [0, 0, -1] };
      document.addEventListener('keydown', function (e) {
        if (mode !== 'fps' || e.ctrlKey || e.metaKey || e.altKey) return;
        var v = MOVE[e.code];
        if (!v) return;
        if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
        e.preventDefault();
        keys[e.code] = true;
      });
      document.addEventListener('keyup', function (e) { keys[e.code] = false; });
      addEventListener('blur', function () { keys = {}; });
      var last = { x: 0, y: 0, z: 0 };
      (function pump() {
        if (mode === 'fps' && cfg.fps.onMove) {
          var next = { x: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), y: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), z: (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0) };
          if (next.x !== last.x || next.y !== last.y || next.z !== last.z) { cfg.fps.onMove(next); last = next; }
        }
        requestAnimationFrame(pump);
      })();
    }

    /* ---------- 轮盘：虚拟摇杆 ---------- */
    if (joystick && cfg.moba && cfg.moba.onMove) {
      var joyId = null, joyCenter = null, R = 38;
      var joyBase = joystick.querySelector('.tcs-joy-base');
      function joyUpdate(e) {
        if (e.pointerId !== joyId || !joyCenter) return;
        var dx = e.clientX - joyCenter.x, dy = e.clientY - joyCenter.y;
        var len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        cfg.moba.onMove(len < R * .18 ? { x: 0, y: 0 } : { x: dx / R, y: -dy / R });
      }
      joystick.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        joyId = e.pointerId;
        var r = joyBase.getBoundingClientRect();
        joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        try { joystick.setPointerCapture(joyId); } catch (err) {}
        joyUpdate(e);
      });
      joystick.addEventListener('pointermove', joyUpdate);
      function joyEnd(e) {
        if (e.pointerId !== joyId) return;
        joyId = null;
        knob.style.transform = '';
        cfg.moba.onMove({ x: 0, y: 0 });
      }
      joystick.addEventListener('pointerup', joyEnd);
      joystick.addEventListener('pointercancel', joyEnd);
      joystick.addEventListener('lostpointercapture', joyEnd);
    }

    /* ---------- 初始化：记忆 > 自动识别 ---------- */
    var savedMode = null, savedHidden = null;
    try {
      savedMode = localStorage.getItem(storageKey + '-mode');
      savedHidden = localStorage.getItem(storageKey + '-hidden');
    } catch (e) {}
    var coarse = matchMedia('(pointer: coarse)').matches;
    var initMode = (savedMode && modes.indexOf(savedMode) >= 0) ? savedMode
      : (cfg.auto !== false && coarse && modes.indexOf('moba') >= 0 ? 'moba' : 'orbit');
    var initHidden = savedHidden !== null ? savedHidden === '1' : coarse;
    setMode(initMode);
    applyHidden(initHidden);

    return {
      setMode: setMode,
      getMode: function () { return mode; }
    };
  }

  window.TownControlsSuite = { mount: mount };
})();
