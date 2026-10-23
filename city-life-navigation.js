/** Small camera bookmarks into the live city. Selecting one never changes time. */
export function createCityLifeNavigation({ activities, onSelect, domElement = document.body }) {
  const root = document.createElement('nav');
  root.className = 'city-life-navigation';
  root.setAttribute('aria-label', '城市生活观察');
  const heading = document.createElement('div');
  heading.className = 'city-life-navigation__heading';
  heading.textContent = '此刻 · 城市生活';
  const choices = document.createElement('div');
  choices.className = 'city-life-navigation__choices';
  const status = document.createElement('div');
  status.className = 'city-life-navigation__status';
  const label = document.createElement('strong'), detail = document.createElement('span');
  status.append(label, detail); status.hidden = true;
  const names = { market: '夜市烟火', crossing: '路口人潮', station: '夜班列车' };
  const buttons = new Map();
  let selected = null, previous = '';
  for (const id of Object.keys(names)) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = names[id];
    button.dataset.activityId = id; button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => onSelect(id));
    choices.append(button); buttons.set(id, button);
  }
  root.append(heading, choices, status); domElement.append(root);
  function setActive(id) {
    selected = id; previous = '';
    for (const [key, button] of buttons) {
      button.setAttribute('aria-pressed', String(key === id));
      button.classList.toggle('active', key === id);
    }
    status.hidden = !selected;
  }
  function update(paused = false) {
    if (!selected) return;
    const state = activities[selected]?.userData.state || {};
    const title = `${paused ? '已暂停 · ' : ''}${state.label || names[selected]}`;
    const description = state.detail || '拖动观察 · 时间与全城同步';
    const next = title + description;
    if (next !== previous) { label.textContent = title; detail.textContent = description; previous = next; }
  }
  return { root, buttons, setActive, update, get activeId() { return selected; } };
}
