const DISTRICT_ORDER = [
  'northwest', 'north', 'northeast',
  'west', 'center', 'east',
  'southwest', 'south', 'southeast',
];
const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
]);
const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
let nextNavigationId = 0;

/** A north-up, nonmodal district picker. The caller owns camera and atmosphere state. */
export function createDistrictNavigation({ styles, onSelect, onOpenChange, domElement = document.body }) {
  const ownerDocument = domElement.ownerDocument;
  const orderedStyles = DISTRICT_ORDER.map(id => styles.find(style => style.id === id));
  if (orderedStyles.some(style => !style)) throw new Error('The district guide requires all nine district styles.');

  const instanceId = `district-navigation-${++nextNavigationId}`;
  const root = ownerDocument.createElement('nav');
  root.className = 'district-navigation';
  root.setAttribute('aria-label', '片区导航');

  const opener = ownerDocument.createElement('button');
  opener.type = 'button';
  opener.className = 'district-navigation__opener';
  opener.setAttribute('aria-expanded', 'false');
  opener.setAttribute('aria-controls', instanceId);
  opener.setAttribute('aria-haspopup', 'dialog');
  const icon = ownerDocument.createElement('span');
  icon.className = 'district-navigation__icon';
  icon.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 9; i++) icon.append(ownerDocument.createElement('i'));
  const label = ownerDocument.createElement('span');
  label.textContent = '九区导览';
  const current = ownerDocument.createElement('span');
  current.className = 'district-navigation__current';
  current.hidden = true;
  opener.append(icon, label, current);

  const panel = ownerDocument.createElement('div');
  panel.id = instanceId;
  panel.className = 'district-navigation__popover';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', `${instanceId}-title`);
  const header = ownerDocument.createElement('div');
  header.className = 'district-navigation__header';
  const title = ownerDocument.createElement('h2');
  title.id = `${instanceId}-title`;
  title.textContent = '选择目的地';
  const north = ownerDocument.createElement('span');
  north.className = 'district-navigation__north';
  north.textContent = '↑ 北 / N';
  north.setAttribute('aria-label', '地图上方为北');
  header.append(title, north);
  const grid = ownerDocument.createElement('div');
  grid.className = 'district-navigation__grid';
  const buttons = new Map();
  const selectionListeners = [];

  let open = false;
  let activeId = null;
  let disposed = false;

  for (const style of orderedStyles) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'district-navigation__district';
    button.dataset.districtId = style.id;
    button.setAttribute('aria-pressed', 'false');
    button.style.setProperty('--district-primary', style.primary);
    button.style.setProperty('--district-secondary', style.secondary);
    const colors = ownerDocument.createElement('span');
    colors.className = 'district-navigation__colors';
    colors.setAttribute('aria-hidden', 'true');
    const name = ownerDocument.createElement('span');
    name.className = 'district-navigation__name';
    name.textContent = style.name;
    const subtitle = ownerDocument.createElement('span');
    subtitle.className = 'district-navigation__subtitle';
    subtitle.textContent = style.subtitle;
    button.append(colors, name, subtitle);
    const select = () => {
      // The caller may focus its canvas during selection; do not steal that focus.
      try { onSelect?.(style.id); }
      finally { close({ restoreFocus: false }); }
    };
    button.addEventListener('click', select);
    selectionListeners.push([button, select]);
    buttons.set(style.id, button);
    grid.append(button);
  }
  panel.append(header, grid);
  root.append(opener, panel);
  domElement.append(root);

  function setActive(idOrNull) {
    if (disposed) return;
    const active = orderedStyles.find(style => style.id === idOrNull);
    activeId = active?.id ?? null;
    current.textContent = active ? `· ${active.name}` : '';
    current.hidden = !active;
    for (const [id, button] of buttons) {
      button.classList.toggle('is-active', id === activeId);
      button.setAttribute('aria-pressed', String(id === activeId));
    }
  }

  function close({ restoreFocus = true } = {}) {
    if (disposed || !open) return;
    open = false;
    panel.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    onOpenChange?.(false);
    if (restoreFocus) opener.focus({ preventScroll: true });
  }

  function toggle() {
    if (disposed) return;
    if (open) { close(); return; }
    open = true;
    panel.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    // Opening also tells the caller to clear any movement key held beforehand.
    onOpenChange?.(true);
    (buttons.get(activeId) || buttons.values().next().value).focus({ preventScroll: true });
  }

  function handleKeyboard(event) {
    if (disposed || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    const inNavigation = root.contains(event.target) || root.contains(ownerDocument.activeElement);
    if (!open && !inNavigation) return;
    if (open && event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (MOVEMENT_CODES.has(event.code) || MOVEMENT_KEYS.has(String(event.key || '').toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onOutsidePointer(event) {
    if (open && !root.contains(event.target)) close({ restoreFocus: false });
  }

  function onVisibilityChange() {
    if (ownerDocument.hidden) close({ restoreFocus: false });
  }

  opener.addEventListener('click', toggle);
  // Capture prevents the scene's document-level handlers from receiving guide input.
  ownerDocument.addEventListener('keydown', handleKeyboard, true);
  ownerDocument.addEventListener('keyup', handleKeyboard, true);
  ownerDocument.addEventListener('pointerdown', onOutsidePointer, true);
  ownerDocument.addEventListener('visibilitychange', onVisibilityChange);

  function dispose() {
    if (disposed) return;
    close({ restoreFocus: false });
    disposed = true;
    opener.removeEventListener('click', toggle);
    selectionListeners.forEach(([button, select]) => button.removeEventListener('click', select));
    ownerDocument.removeEventListener('keydown', handleKeyboard, true);
    ownerDocument.removeEventListener('keyup', handleKeyboard, true);
    ownerDocument.removeEventListener('pointerdown', onOutsidePointer, true);
    ownerDocument.removeEventListener('visibilitychange', onVisibilityChange);
    root.remove();
  }

  return { setActive, close, isOpen: () => open, dispose };
}
