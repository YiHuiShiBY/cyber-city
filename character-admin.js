import { createCharacterCatalog } from './character-catalog.js';
import { ComparisonViewer } from './character-viewer.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const STORAGE_KEY = 'neon-crossing-character-reviews-v1';
const STATUS = { pending: '待审阅', improve: '待优化', approved: '已通过' };
const categoryLabels = { pedestrians: '行人', pedestrian: '行人', people: '行人', characters: '角色', robots: '机器人', robot: '机器人', riders: '骑行者', animals: '动物', vehicles: '载具', props: '街头道具', citizens: '市民', humanoids: '人形角色' };
const formatNumber = value => Number.isFinite(value) ? new Intl.NumberFormat('zh-CN').format(value) : '—';
const categoryLabel = category => categoryLabels[category] || category || '角色';
const lower = value => String(value ?? '').toLocaleLowerCase('zh-CN');
const tagList = variant => Array.isArray(variant?.tags) ? variant.tags : variant?.tags ? [String(variant.tags)] : [];
const state = { groups: [], selectedGroupId: null, selectedVariantId: null, query: '', category: 'all', page: 0, pageSize: 4, focusId: null, view: 'iso', wireframe: false, material: 'original', light: 'studio', autoRotate: false, paused: true, linked: true, loading: true, error: null };
let catalog = null;
let viewer = null;
let stats = [];
let reviews = {};
let loadSequence = 0;
let toastTimer;
try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) reviews = saved; } catch { /* A fresh in-memory review book remains usable when browser storage is unavailable. */ }

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
}

function currentGroup() { return state.groups.find(group => group.id === state.selectedGroupId); }
function currentVariant() { return currentGroup()?.variants.find(variant => variant.id === state.selectedVariantId); }
function reviewFor(id) { const record = reviews[id] || {}; return { status: STATUS[record.status] ? record.status : 'pending', notes: typeof record.notes === 'string' ? record.notes : '' }; }
function searchText(group) { return lower([group.id, group.label, group.description, categoryLabel(group.category), group.source].join(' ')); }
function variantsFor(group) {
  if (!group) return [];
  const query = lower(state.query.trim());
  if (!query || searchText(group).includes(query)) return group.variants;
  return group.variants.filter(variant => lower([variant.id, variant.label, variant.source, ...tagList(variant)].join(' ')).includes(query));
}
function visibleGroups() {
  return state.groups.filter(group => (state.category === 'all' || group.category === state.category) && variantsFor(group).length);
}
function visibleVariants() {
  const variants = variantsFor(currentGroup());
  if (state.focusId) return variants.filter(variant => variant.id === state.focusId);
  return variants.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
}
function syncUrl() {
  const url = new URL(location.href);
  if (state.selectedGroupId) url.searchParams.set('group', state.selectedGroupId); else url.searchParams.delete('group');
  if (state.focusId) url.searchParams.set('variant', state.focusId); else url.searchParams.delete('variant');
  history.replaceState(null, '', url);
}

function renderCategories() {
  const counts = new Map();
  state.groups.forEach(group => counts.set(group.category, (counts.get(group.category) || 0) + 1));
  const categories = [{ id: 'all', label: '全部', count: state.groups.length }, ...[...counts].map(([id, count]) => ({ id, label: categoryLabel(id), count }))];
  $('#category-list').innerHTML = categories.map(category => `<button class="category-button${state.category === category.id ? ' is-active' : ''}" data-category="${escapeHtml(category.id)}" aria-pressed="${state.category === category.id}">${escapeHtml(category.label)}<small>${category.count}</small></button>`).join('');
}

function renderGroups() {
  const groups = visibleGroups();
  $('#catalog-count').textContent = `${groups.length} 个分组 · ${groups.reduce((sum, group) => sum + variantsFor(group).length, 0)} 个模型`;
  $('#group-list').innerHTML = groups.length ? groups.map(group => {
    const count = variantsFor(group).length;
    const index = state.groups.indexOf(group) + 1;
    return `<button class="group-button${group.id === state.selectedGroupId ? ' is-active' : ''}" data-group="${escapeHtml(group.id)}"${group.id === state.selectedGroupId ? ' aria-current="true"' : ''}><span class="group-icon" aria-hidden="true">${String(index).padStart(2, '0')}</span><span class="group-copy"><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(categoryLabel(group.category))} / ${count} 个变体</small></span><span class="group-size">${String(count).padStart(2, '0')}</span></button>`;
  }).join('') : '<div class="catalog-empty">没有匹配的模型<br>试试「撑伞」或「手机」</div>';
}

function setStatePanel(type, title, message) {
  $('#state-panel').hidden = !type;
  $('#state-panel').dataset.state = type || '';
  $('#state-title').textContent = title || '';
  $('#state-message').textContent = message || '';
  $('#retry').hidden = type !== 'error';
  $('#clear-search').hidden = type !== 'empty';
  $('#comparison-board').hidden = !!type;
  $('#pagination').hidden = !!type;
}

function cardMarkup(variant, index) {
  const group = currentGroup();
  const ordinal = group.variants.indexOf(variant) + 1;
  const record = reviewFor(variant.id);
  return `<article class="model-card${variant.id === state.selectedVariantId ? ' is-selected' : ''}" data-variant="${escapeHtml(variant.id)}" aria-label="${escapeHtml(variant.label)}"><header class="model-card-head"><div><span class="eyebrow">VARIANT / ${String(ordinal).padStart(2, '0')}</span><h2 title="${escapeHtml(variant.label)}">${escapeHtml(variant.label)}</h2><code class="card-id" title="${escapeHtml(variant.id)}">${escapeHtml(variant.id)}</code></div><button class="expand-button" data-focus="${escapeHtml(variant.id)}" aria-label="${state.focusId ? '返回并列观察' : `放大观察${escapeHtml(variant.label)}`}">${state.focusId ? '↙ 返回' : '↗ 放大'}</button></header><div class="model-viewport" data-viewport="${index}" tabindex="0" role="img" aria-label="${escapeHtml(variant.label)}三维模型，拖动旋转，滚轮缩放"></div><footer class="model-card-footer"><span class="card-stat" data-card-stat="${escapeHtml(variant.id)}">正在创建模型…</span><span class="review-badge" data-card-review="${escapeHtml(variant.id)}" data-status="${record.status}">${STATUS[record.status]}</span></footer></article>`;
}

function renderInspector() {
  const variant = currentVariant();
  $('#inspector-empty').hidden = !!variant;
  $('#inspector-content').hidden = !variant;
  if (!variant) return;
  const group = currentGroup();
  const record = reviewFor(variant.id);
  $('#selected-number').textContent = `${group.label} / ${String(group.variants.indexOf(variant) + 1).padStart(2, '0')}`;
  $('#selected-name').textContent = variant.label;
  $('#selected-id').textContent = variant.id;
  $('#selected-source').textContent = variant.source || group.source || '城市原始模型';
  $('#selected-tags').innerHTML = tagList(variant).map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
  $('#review-notes').value = record.notes;
  $('#note-length').textContent = `${record.notes.length} / 3000`;
  $('#review-saved').textContent = '自动保存';
  $$('[data-review]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.review === record.status)));
  updateStats(stats);
}

function updateStats(nextStats) {
  if (Array.isArray(nextStats)) stats = nextStats;
  for (const item of stats) {
    const output = $$('[data-card-stat]').find(element => element.dataset.cardStat === item.id);
    if (output) output.textContent = `${formatNumber(item.meshes)} 网格 · ${formatNumber(item.triangles)} 面`;
  }
  const selected = stats.find(item => item.id === state.selectedVariantId);
  $('#stat-meshes').textContent = formatNumber(selected?.meshes);
  $('#stat-triangles').textContent = formatNumber(selected?.triangles);
  $('#stat-dimensions').textContent = selected && [selected.width, selected.height, selected.depth].every(Number.isFinite) ? `${selected.width.toFixed(2)} × ${selected.height.toFixed(2)} × ${selected.depth.toFixed(2)}` : '—';
}

function renderBoard() {
  const group = currentGroup();
  const board = $('#comparison-board');
  const oldCards = [...board.querySelectorAll('.model-card')];
  oldCards.forEach(card => card.remove());
  if (!group || !variantsFor(group).length) {
    viewer?.show([]);
    state.selectedVariantId = null;
    $('#group-name').textContent = '没有匹配的模型';
    $('#group-description').textContent = '换一个关键词，或者清除分类筛选。';
    $('#group-category').textContent = 'CHARACTER COLLECTION';
    $('#group-code').textContent = 'SEARCH';
    $('#variant-count').textContent = '0';
    setStatePanel('empty', '没有找到匹配的模型', '可以搜索名称、类型、来源或标签，例如「飞行器」「列车」或「撑伞」。');
    renderInspector();
    return;
  }
  const all = variantsFor(group);
  state.page = Math.min(state.page, Math.max(0, Math.ceil(all.length / state.pageSize) - 1));
  if (state.focusId && !all.some(variant => variant.id === state.focusId)) state.focusId = null;
  const shown = visibleVariants();
  if (!shown.some(variant => variant.id === state.selectedVariantId)) state.selectedVariantId = shown[0]?.id || null;
  $('#group-name').textContent = group.label;
  $('#group-description').textContent = group.description || '同类造型集中展示，逐个检查模型细节与差异。';
  $('#group-category').textContent = `${categoryLabel(group.category)} / COLLECTION`;
  $('#group-code').textContent = group.id;
  $('#variant-count').textContent = all.length;
  $('#board-summary').textContent = state.focusId ? '单个放大 · 检查模型细节' : `${shown.length} 个模型并列 · ${state.linked ? '镜头已同步' : '独立镜头'}`;
  document.title = `${group.label} · 角色管理台 · 雨夜霓虹`;
  board.dataset.layout = state.focusId ? '1' : String(state.pageSize);
  board.insertAdjacentHTML('beforeend', shown.map(cardMarkup).join(''));
  setStatePanel(null);
  const start = state.page * state.pageSize + 1;
  $('#page-summary').textContent = state.focusId ? `当前模型 ${group.variants.indexOf(shown[0]) + 1} / ${group.variants.length}` : `${start}—${Math.min(start + state.pageSize - 1, all.length)} / ${all.length} 个变体`;
  $('#page-count').textContent = `${state.page + 1} / ${Math.ceil(all.length / state.pageSize)}`;
  $('#previous-page').disabled = state.page === 0 || !!state.focusId;
  $('#next-page').disabled = (state.page + 1) * state.pageSize >= all.length || !!state.focusId;
  $('#page-count').hidden = !!state.focusId;
  $('#previous-page').hidden = !!state.focusId;
  $('#next-page').hidden = !!state.focusId;
  $('#leave-focus').hidden = !state.focusId;
  stats = [];
  renderInspector();
  try {
    const nextStats = viewer.show(shown.map((variant, index) => ({ variant, element: board.querySelector(`[data-viewport="${index}"]`) })));
    updateStats(nextStats || viewer.getStats());
    applyViewerOptions();
  } catch (error) {
    state.error = error;
    setStatePanel('error', '模型暂时无法显示', `读取「${group.label}」时出现问题。可以重新载入后继续检查。`);
    console.error('Character comparison viewer:', error);
  }
  syncUrl();
}

function applyViewerOptions() {
  if (!viewer) return;
  viewer.setLinked(state.linked);
  viewer.setView(state.view);
  viewer.setWireframe(state.wireframe);
  viewer.setMaterialMode(state.material);
  viewer.setLight(state.light);
  viewer.setAutoRotate(state.autoRotate);
  viewer.setPaused(state.paused);
}

function selectGroup(id) {
  if (!state.groups.some(group => group.id === id)) return;
  state.selectedGroupId = id;
  state.page = 0;
  state.focusId = null;
  state.selectedVariantId = null;
  renderGroups();
  renderBoard();
}

function selectVariant(id) {
  if (!currentGroup()?.variants.some(variant => variant.id === id)) return;
  state.selectedVariantId = id;
  $$('.model-card').forEach(card => card.classList.toggle('is-selected', card.dataset.variant === id));
  renderInspector();
}

function focusVariant(id) {
  state.focusId = state.focusId === id ? null : id;
  state.selectedVariantId = id;
  renderBoard();
}

function applyFilters() {
  const groups = visibleGroups();
  if (!groups.some(group => group.id === state.selectedGroupId)) state.selectedGroupId = groups[0]?.id || null;
  state.page = 0;
  state.focusId = null;
  renderCategories();
  renderGroups();
  renderBoard();
}

function saveReview(id, changes) {
  if (!id) return;
  reviews[id] = { ...reviewFor(id), ...changes, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews)); $('#review-saved').textContent = '已保存'; }
  catch { $('#review-saved').textContent = '仅本次会话'; toast('浏览器未允许本地存储，审阅记录暂存于当前会话。'); }
  const badge = $$('[data-card-review]').find(element => element.dataset.cardReview === id);
  if (badge) { badge.dataset.status = reviews[id].status; badge.textContent = STATUS[reviews[id].status]; }
}

async function loadCatalog() {
  const sequence = ++loadSequence;
  state.loading = true;
  state.error = null;
  setStatePanel('loading', '正在载入角色与载具', '首次载入需要创建原始模型，请稍候。');
  try {
    const next = await createCharacterCatalog();
    if (sequence !== loadSequence) { next.dispose?.(); return; }
    if (!Array.isArray(next.groups) || !next.groups.length) throw new Error('角色目录为空');
    viewer?.dispose();
    viewer = null;
    catalog?.dispose?.();
    catalog = next;
    state.groups = next.groups;
    $('#comparison-board').replaceChildren();
    viewer = new ComparisonViewer($('#comparison-board'), { onStats: updateStats });
    applyViewerOptions();
    const params = new URL(location.href).searchParams;
    const requestedGroup = params.get('group');
    const requestedVariant = params.get('variant');
    state.selectedGroupId = state.groups.find(group => group.id === requestedGroup)?.id || state.groups.find(group => /撑伞|umbrella/.test(`${group.label} ${group.id}`))?.id || state.groups[0].id;
    state.focusId = currentGroup()?.variants.some(variant => variant.id === requestedVariant) ? requestedVariant : null;
    state.selectedVariantId = state.focusId;
    state.page = state.focusId ? Math.floor(currentGroup().variants.findIndex(variant => variant.id === state.focusId) / state.pageSize) : 0;
    state.category = 'all';
    state.query = '';
    $('#catalog-search').value = '';
    $('#catalog-total').textContent = state.groups.reduce((sum, group) => sum + group.variants.length, 0);
    renderCategories();
    renderGroups();
    renderBoard();
    state.loading = false;
  } catch (error) {
    if (sequence !== loadSequence) return;
    state.loading = false;
    state.error = error;
    setStatePanel('error', '角色档案载入失败', '请确认通过本地服务打开此页面，然后点击重新载入。');
    $('#catalog-count').textContent = '载入失败';
    console.error('Character catalog:', error);
  }
}

$('#catalog-search').addEventListener('input', event => { state.query = event.target.value; applyFilters(); });
$('#category-list').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (button) { state.category = button.dataset.category; applyFilters(); } });
$('#group-list').addEventListener('click', event => { const button = event.target.closest('[data-group]'); if (button) selectGroup(button.dataset.group); });
$('#comparison-board').addEventListener('pointerdown', event => { const card = event.target.closest('[data-variant]'); if (card && card.dataset.variant !== state.selectedVariantId) selectVariant(card.dataset.variant); });
$('#comparison-board').addEventListener('focusin', event => { const card = event.target.closest('[data-variant]'); if (card && card.dataset.variant !== state.selectedVariantId) selectVariant(card.dataset.variant); });
$('#comparison-board').addEventListener('click', event => { const button = event.target.closest('[data-focus]'); if (button) focusVariant(button.dataset.focus); });
$('#previous-page').addEventListener('click', () => { if (state.page > 0) { state.page--; renderBoard(); } });
$('#next-page').addEventListener('click', () => { if ((state.page + 1) * state.pageSize < variantsFor(currentGroup()).length) { state.page++; renderBoard(); } });
$('#leave-focus').addEventListener('click', () => { state.focusId = null; renderBoard(); });
$$('[data-columns]').forEach(button => button.addEventListener('click', () => {
  const first = state.page * state.pageSize;
  state.pageSize = Number(button.dataset.columns);
  state.page = Math.floor(first / state.pageSize);
  state.focusId = null;
  $$('[data-columns]').forEach(item => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  renderBoard();
}));
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  viewer?.setView(state.view);
  $$('[data-view]').forEach(item => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
}));
function toggleControl(selector, key, apply) {
  $(selector).addEventListener('click', () => {
    state[key] = !state[key];
    $(selector).classList.toggle('is-active', state[key]);
    $(selector).setAttribute('aria-pressed', String(state[key]));
    apply(state[key]);
  });
}
toggleControl('#wireframe', 'wireframe', value => viewer?.setWireframe(value));
toggleControl('#auto-rotate', 'autoRotate', value => viewer?.setAutoRotate(value));
toggleControl('#linked-cameras', 'linked', value => { viewer?.setLinked(value); if (!state.focusId) $('#board-summary').textContent = `${visibleVariants().length} 个模型并列 · ${value ? '镜头已同步' : '独立镜头'}`; });
$('#clay-mode').addEventListener('click', () => { state.material = state.material === 'original' ? 'clay' : 'original'; const active = state.material === 'clay'; $('#clay-mode').classList.toggle('is-active', active); $('#clay-mode').setAttribute('aria-pressed', String(active)); viewer?.setMaterialMode(state.material); });
$('#light-mode').addEventListener('change', event => { state.light = event.target.value; viewer?.setLight(state.light); });
$('#play-pause').addEventListener('click', () => { state.paused = !state.paused; viewer?.setPaused(state.paused); $('#play-pause').textContent = state.paused ? '播放动作' : '暂停动作'; $('#play-pause').setAttribute('aria-pressed', String(!state.paused)); $('#play-pause').classList.toggle('is-active', !state.paused); });
$('#reset-camera').addEventListener('click', () => { viewer?.setView('iso'); state.view = 'iso'; $$('[data-view]').forEach(button => { button.classList.toggle('is-active', button.dataset.view === 'iso'); button.setAttribute('aria-pressed', String(button.dataset.view === 'iso')); }); });
$('#capture').addEventListener('click', async () => {
  if (!viewer) return;
  try {
    await viewer.capture();
    toast('模型截图已保存。');
  } catch (error) { console.error('Character screenshot:', error); toast('截图失败，请重试。'); }
});
$$('[data-review]').forEach(button => button.addEventListener('click', () => { saveReview(state.selectedVariantId, { status: button.dataset.review }); $$('[data-review]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); }));
$('#review-notes').addEventListener('input', event => {
  const id = state.selectedVariantId;
  const notes = event.target.value;
  $('#note-length').textContent = `${notes.length} / 3000`;
  saveReview(id, { notes });
});
$('#retry').addEventListener('click', loadCatalog);
$('#clear-search').addEventListener('click', () => { state.query = ''; state.category = 'all'; $('#catalog-search').value = ''; applyFilters(); });
document.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (event.key === '/') { event.preventDefault(); $('#catalog-search').focus(); }
  if (event.key === 'Escape' && state.focusId) { state.focusId = null; renderBoard(); }
});
window.addEventListener('pagehide', event => { if (!event.persisted) { viewer?.dispose(); catalog?.dispose?.(); } });
window.__characterAdmin = { state, get catalog() { return catalog; }, get viewer() { return viewer; }, get reviews() { return reviews; }, get stats() { return stats; }, selectGroup, selectVariant, focusVariant, visibleGroups, visibleVariants, applyFilters, renderBoard, reload: loadCatalog };
loadCatalog();
