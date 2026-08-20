const $ = selector => document.querySelector(selector);
const i18n = {
  ru: {
    scanning: 'Обновляем локальные ярлыки…', found: count => `Найдено приложений: ${count}`, empty: 'Приложения не найдены. Обновите каталог или добавьте ярлыки в Windows Start Menu.',
    refreshed: 'Каталог приложений обновлён', opening: name => `Открываем: ${name}`, unavailable: 'Этот ярлык больше недоступен. Обновите каталог.',
    wallpaper: 'Новые обои установлены', reset: 'Стандартный фон восстановлен', focusOn: 'Режим фокуса включён', focusOff: 'Режим фокуса выключен'
  },
  en: {
    scanning: 'Refreshing local shortcuts…', found: count => `Applications found: ${count}`, empty: 'No applications found. Refresh the catalog or add shortcuts to the Windows Start Menu.',
    refreshed: 'Application catalog refreshed', opening: name => `Opening: ${name}`, unavailable: 'This shortcut is no longer available. Refresh the catalog.',
    wallpaper: 'New wallpaper applied', reset: 'Default wallpaper restored', focusOn: 'Focus mode enabled', focusOff: 'Focus mode disabled'
  }
};
let settings = { theme:'violet', language:'ru', reduceMotion:false, showIcons:true, showWidgets:false, iconSize:'comfortable', autoHide:false, centerApps:true, dockStyle:'floating', wallpaperPath:'', wallpaperDim:42, focusMode:false, pinnedIds:[] };
let catalog = { desktop: [], apps: [], system: [] };
let allItems = [];
let draggedId = null;

function tr(key, ...args) { const value = (i18n[settings.language] || i18n.ru)[key]; return typeof value === 'function' ? value(...args) : value; }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' })[char]); }
function getItem(id) { return allItems.find(item => item.id === id); }
function fileUrl(pathValue) { return `file:///${encodeURI(pathValue.replace(/\\/g, '/')).replace(/#/g, '%23')}`; }
function safeWallpaper(pathValue) { return `url("${fileUrl(pathValue)}")`; }
function visualIcon(item, className) {
  const fallback = escapeHTML(item.icon || '◩');
  const icon = item.iconData ? `<img src="${item.iconData}" alt="" />` : fallback;
  return `<span class="${className} ${item.tone || 'silver'}">${icon}</span>`;
}
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => node.classList.remove('show'), 2600); }
function openOverlay(node) { node.classList.remove('hidden'); node.animate([{opacity:0,filter:'blur(3px)'},{opacity:1,filter:'blur(0)'}],{duration:210,easing:'cubic-bezier(.2,.8,.2,1)'}); }
function closeOverlay(node) { node.classList.add('hidden'); }

function updateThemeLabel() {
  const labels = { violet:'Полярный фиолетовый', ocean:'Северный океан', red:'Красная ночь' };
  $('#theme-label').textContent = labels[settings.theme] || labels.violet;
}
function applySettings() {
  document.body.classList.toggle('theme-ocean', settings.theme === 'ocean');
  document.body.classList.toggle('theme-red', settings.theme === 'red');
  document.body.classList.toggle('icons-hidden', settings.showIcons === false);
  document.body.classList.toggle('focus-active', settings.focusMode === true);
  document.body.classList.toggle('icon-compact', settings.iconSize === 'compact');
  document.body.classList.toggle('icon-large', settings.iconSize === 'large');
  document.body.classList.toggle('reduce-motion', settings.reduceMotion === true);
  document.body.classList.toggle('atmosphere-muted', settings.showWidgets === false);
  const wallpaper = $('#wallpaper-layer');
  wallpaper.classList.toggle('has-custom', Boolean(settings.wallpaperPath));
  if (settings.wallpaperPath) wallpaper.style.setProperty('--wallpaper-image', safeWallpaper(settings.wallpaperPath));
  else wallpaper.style.removeProperty('--wallpaper-image');
  wallpaper.style.setProperty('--wallpaper-dim', (Math.max(10, Math.min(80, settings.wallpaperDim || 42)) / 100).toFixed(2));
  $('#taskbar').classList.toggle('wide', settings.dockStyle === 'wide');
  $('#taskbar').classList.toggle('autohide', settings.autoHide === true);
  $('#taskbar').parentElement.classList.toggle('left', settings.centerApps === false);
  $('#focus-label').classList.toggle('hidden', settings.focusMode !== true);
  $('#icons-toggle').checked = settings.showIcons !== false;
  $('#focus-toggle').checked = settings.focusMode === true;
  $('#autohide-toggle').checked = settings.autoHide === true;
  $('#center-toggle').checked = settings.centerApps !== false;
  $('#icon-size').value = settings.iconSize || 'comfortable';
  $('#dock-style').value = settings.dockStyle || 'floating';
  $('#wallpaper-dim').value = settings.wallpaperDim || 42;
  $('#dim-value').textContent = `${settings.wallpaperDim || 42}%`;
  document.querySelectorAll('[data-theme]').forEach(button => button.classList.toggle('active', button.dataset.theme === settings.theme));
  document.querySelectorAll('[data-language]').forEach(button => button.classList.toggle('active', button.dataset.language === settings.language));
  $('#quick-focus').classList.toggle('active', settings.focusMode === true);
  $('#quick-icons').classList.toggle('active', settings.showIcons !== false);
  $('#quick-widgets').classList.toggle('active', settings.showWidgets === true);
  updateThemeLabel();
}
async function persist(patch) { settings = await window.windows12.settings.write({ ...settings, ...patch }); applySettings(); return settings; }

function desktopMarkup(item) {
  const name = escapeHTML(item.name);
  return `<button class="desktop-icon" data-launch="${item.id}" title="Открыть: ${name}">${visualIcon(item, 'desktop-icon-symbol')}<span class="desktop-icon-label">${name}</span></button>`;
}
function appMarkup(item) {
  const name = escapeHTML(item.name);
  return `<button class="app-item" data-launch="${item.id}" title="Открыть: ${name}">${visualIcon(item, 'app-glyph')}<b>${name}</b></button>`;
}
function bindLaunch(root) { root.querySelectorAll('[data-launch]').forEach(button => button.addEventListener('click', () => launch(button.dataset.launch))); }
function renderDesktop() {
  const visible = catalog.desktop || [];
  $('#desktop-icons').innerHTML = visible.map(desktopMarkup).join('');
  bindLaunch($('#desktop-icons'));
  $('#empty-state').classList.toggle('show', visible.filter(item => item.kind === 'app').length === 0);
}
function appsForQuery(query = '') {
  const needle = query.trim().toLocaleLowerCase();
  const base = [...(catalog.apps || []), ...(catalog.system || [])];
  const unique = [...new Map(base.map(item => [item.id, item])).values()];
  return needle ? unique.filter(item => item.name.toLocaleLowerCase().includes(needle)).slice(0, 40) : unique.slice(0, 30);
}
function renderApps(query = '') {
  const entries = appsForQuery(query);
  $('#app-grid').innerHTML = entries.map(appMarkup).join('');
  bindLaunch($('#app-grid'));
  const count = allItems.filter(item => item.kind === 'app').length;
  $('#catalog-status').textContent = entries.length ? tr('found', count) : tr('empty');
}
function defaultPins() {
  return [getItem('folder:home'), getItem('folder:documents'), getItem('folder:downloads'), ...allItems.filter(item => item.kind === 'app').slice(0, 4)].filter(Boolean).map(item => item.id);
}
function renderDock() {
  const allowed = new Set(allItems.map(item => item.id));
  const stored = (settings.pinnedIds || []).filter(id => allowed.has(id));
  const ids = stored.length ? stored : defaultPins();
  if (!stored.length && ids.length) { settings.pinnedIds = ids; window.windows12.settings.write(settings); }
  $('#task-pinned').innerHTML = ids.map(id => {
    const item = getItem(id); const name = escapeHTML(item.name);
    return `<button class="dock-app active" draggable="true" data-pin="${item.id}" title="${name}">${visualIcon(item, 'dock-icon')}</button>`;
  }).join('');
  $('#task-pinned').querySelectorAll('.dock-app').forEach(button => {
    button.addEventListener('click', () => launch(button.dataset.pin));
    button.addEventListener('dragstart', event => { draggedId = button.dataset.pin; button.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
    button.addEventListener('dragend', () => { draggedId = null; document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); button.classList.remove('dragging'); });
    button.addEventListener('dragover', event => { event.preventDefault(); if (draggedId && draggedId !== button.dataset.pin) button.classList.add('drop-target'); });
    button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
    button.addEventListener('drop', async event => { event.preventDefault(); const target = button.dataset.pin; if (!draggedId || draggedId === target) return; const order = [...ids]; order.splice(order.indexOf(draggedId), 1); order.splice(order.indexOf(target), 0, draggedId); await persist({ pinnedIds: order }); renderDock(); });
  });
}
async function launch(id) {
  const item = getItem(id);
  if (!item) { toast(tr('unavailable')); return; }
  const result = await window.windows12.catalog.launch(id);
  toast(result?.ok ? tr('opening', item.name) : (result?.message || tr('unavailable')));
}
async function refreshCatalog(showToast = true) {
  $('#catalog-status').textContent = tr('scanning');
  try {
    catalog = await window.windows12.catalog.read();
    const map = new Map(); [...(catalog.system || []), ...(catalog.desktop || []), ...(catalog.apps || [])].forEach(item => map.set(item.id, item));
    allItems = [...map.values()].sort((a,b) => a.name.localeCompare(b.name, settings.language === 'en' ? 'en' : 'ru'));
    renderDesktop(); renderApps($('#app-search').value); renderDock(); if (showToast) toast(tr('refreshed'));
  } catch { $('#catalog-status').textContent = 'Не удалось получить локальный каталог Windows.'; toast('Не удалось прочитать локальные ярлыки.'); }
}
async function updateStats() {
  try { const stats = await window.windows12.system.stats(); $('#dock-memory').textContent = `${stats.memory}%`; } catch { $('#dock-memory').textContent = '—%'; }
}
function updateClock() {
  const locale = settings.language === 'en' ? 'en-US' : 'ru-RU'; const now = new Date();
  $('#clock').textContent = new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(now);
  $('#tray-date').textContent = new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
}
async function chooseWallpaper() { const selection = await window.windows12.wallpaper.choose(); if (selection) { await persist({ wallpaperPath: selection }); toast(tr('wallpaper')); } }
async function toggleFocus() { await persist({ focusMode: !settings.focusMode }); toast(settings.focusMode ? tr('focusOn') : tr('focusOff')); }
function openStart() { closeOverlay($('#control-center')); openOverlay($('#start-menu')); setTimeout(() => $('#app-search').focus(), 0); }
function openControl() { closeOverlay($('#start-menu')); openOverlay($('#control-center')); }
function openSettings() { closeOverlay($('#control-center')); closeOverlay($('#start-menu')); openOverlay($('#settings-panel')); }

$('#dock-start').addEventListener('click', () => $('#start-menu').classList.contains('hidden') ? openStart() : closeOverlay($('#start-menu')));
$('#dock-search').addEventListener('click', openStart);
$('#control-button').addEventListener('click', () => $('#control-center').classList.contains('hidden') ? openControl() : closeOverlay($('#control-center')));
$('#close-start').addEventListener('click', () => closeOverlay($('#start-menu')));
$('#close-control').addEventListener('click', () => closeOverlay($('#control-center')));
$('#close-settings').addEventListener('click', () => closeOverlay($('#settings-panel')));
$('#open-settings').addEventListener('click', openSettings); $('#open-settings-control').addEventListener('click', openSettings);
$('#refresh-catalog').addEventListener('click', () => refreshCatalog());
$('#minimize').addEventListener('click', () => window.windows12.window.minimize()); $('#maximize').addEventListener('click', () => window.windows12.window.maximize()); $('#close').addEventListener('click', () => window.windows12.window.close());
$('#app-search').addEventListener('input', event => renderApps(event.target.value));
$('#app-search').addEventListener('keydown', event => { if (event.key === 'Enter') { const first = appsForQuery(event.target.value)[0]; if (first) launch(first.id); } });
document.querySelectorAll('[data-system]').forEach(button => button.addEventListener('click', () => launch(button.dataset.system)));
$('#toggle-focus-from-start').addEventListener('click', toggleFocus); $('#quick-focus').addEventListener('click', toggleFocus);
$('#quick-icons').addEventListener('click', () => persist({ showIcons: settings.showIcons === false }));
$('#quick-widgets').addEventListener('click', () => persist({ showWidgets: settings.showWidgets === false }));
$('#quick-wallpaper').addEventListener('click', chooseWallpaper); $('#choose-wallpaper').addEventListener('click', chooseWallpaper);
$('#reset-wallpaper').addEventListener('click', async () => { await persist({ wallpaperPath: '' }); toast(tr('reset')); });
$('#wallpaper-dim').addEventListener('input', event => { settings.wallpaperDim = Number(event.target.value); applySettings(); });
$('#wallpaper-dim').addEventListener('change', event => persist({ wallpaperDim: Number(event.target.value) }));
document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => persist({ theme: button.dataset.theme })));
$('#icons-toggle').addEventListener('change', event => persist({ showIcons: event.target.checked })); $('#focus-toggle').addEventListener('change', event => persist({ focusMode: event.target.checked }));
$('#autohide-toggle').addEventListener('change', event => persist({ autoHide: event.target.checked })); $('#center-toggle').addEventListener('change', event => persist({ centerApps: event.target.checked }));
$('#icon-size').addEventListener('change', event => persist({ iconSize: event.target.value })); $('#dock-style').addEventListener('change', event => persist({ dockStyle: event.target.value }));
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', async () => { await persist({ language: button.dataset.language }); updateClock(); renderApps($('#app-search').value); }));
document.querySelectorAll('.settings-tabs button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.settings-tabs button').forEach(node => node.classList.toggle('active', node === button)); document.querySelectorAll('.settings-view').forEach(node => node.classList.toggle('active', node.dataset.view === button.dataset.tab)); }));
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeOverlay($('#start-menu')); closeOverlay($('#control-center')); closeOverlay($('#settings-panel')); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openStart(); } });

(async function init() {
  settings = { ...settings, ...await window.windows12.settings.read() };
  applySettings(); updateClock(); await refreshCatalog(false); await updateStats();
  setInterval(updateClock, 30_000); setInterval(updateStats, 8_000);
  if (!localStorage.getItem('windows12-onboarding-v4')) { $('#onboarding').classList.remove('hidden'); setTimeout(() => { $('#onboarding').classList.add('hidden'); localStorage.setItem('windows12-onboarding-v4', 'done'); }, 2900); }
})();
