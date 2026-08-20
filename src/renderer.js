const $ = selector => document.querySelector(selector);
const i18n = {
  ru: { scanned: count => `Найдено локальных приложений: ${count}`, empty: 'Не удалось найти ярлыки приложений. Откройте «Проводник» или обновите каталог.', refresh: 'Каталог приложений обновлён', launched: 'Открываем: ', unavailable: 'Этот ярлык больше недоступен. Обновите каталог.', wallpaper: 'Обои рабочего стола изменены', resetWallpaper: 'Стандартный фон восстановлен', session: 'Завершение сеанса доступно через обычное меню Windows.' },
  en: { scanned: count => `Local applications found: ${count}`, empty: 'No application shortcuts were found. Open Explorer or refresh the catalog.', refresh: 'Application catalog refreshed', launched: 'Opening: ', unavailable: 'This shortcut is no longer available. Refresh the catalog.', wallpaper: 'Desktop wallpaper changed', resetWallpaper: 'Default wallpaper restored', session: 'Use the regular Windows menu to sign out.' }
};
let settings = { theme:'violet', language:'ru', reduceMotion:false, showIcons:true, showWidgets:true, iconSize:'comfortable', autoHide:false, centerApps:true, dockStyle:'floating', wallpaperPath:'', wallpaperDim:42, pinnedIds:[] };
let catalog = { desktop: [], apps: [], system: [] };
let allItems = [];
let draggedId = null;

function tr(key, ...args) { const value = (i18n[settings.language] || i18n.ru)[key]; return typeof value === 'function' ? value(...args) : value; }
function getItem(id) { return allItems.find(item => item.id === id); }
function localFileHref(filePath) { return `file:///${encodeURI(filePath.replace(/\\/g, '/')).replace(/#/g, '%23')}`; }
function safeFileUrl(filePath) { return `url("${localFileHref(filePath)}")`; }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' })[char]); }
function visualIcon(item, className) {
  const fallback = escapeHTML(item.icon || '◩');
  const native = item.iconPath ? `<img src="${localFileHref(item.iconPath)}" alt="" />` : fallback;
  return `<span class="${className} ${item.tone || 'silver'}">${native}</span>`;
}
function openOverlay(node) { node.classList.remove('hidden'); node.animate([{ opacity:0, transform:'translate(-50%, 15px) scale(.985)' },{ opacity:1, transform:'translate(-50%, 0) scale(1)' }],{ duration:230, easing:'cubic-bezier(.2,.8,.2,1)' }); }
function closeOverlay(node) { node.classList.add('hidden'); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(window.__toast); window.__toast = setTimeout(() => node.classList.remove('show'), 2800); }

function applySettings() {
  document.body.classList.toggle('theme-red', settings.theme === 'red');
  document.body.classList.toggle('theme-ocean', settings.theme === 'ocean');
  document.body.classList.toggle('reduce-motion', settings.reduceMotion === true);
  document.body.classList.toggle('icons-hidden', settings.showIcons === false);
  document.body.classList.toggle('widgets-hidden', settings.showWidgets === false);
  document.body.classList.toggle('icon-compact', settings.iconSize === 'compact');
  document.body.classList.toggle('icon-large', settings.iconSize === 'large');
  document.documentElement.lang = settings.language === 'en' ? 'en' : 'ru';
  document.title = settings.language === 'en' ? 'Windows 12 Launcher' : 'Windows 12 Лаунчер';
  $('#wallpaper-layer').classList.toggle('has-custom', Boolean(settings.wallpaperPath));
  if (settings.wallpaperPath) $('#wallpaper-layer').style.setProperty('--wallpaper-image', safeFileUrl(settings.wallpaperPath));
  else $('#wallpaper-layer').style.removeProperty('--wallpaper-image');
  $('#wallpaper-layer').style.setProperty('--wallpaper-dim', (Math.max(10, Math.min(80, settings.wallpaperDim || 42)) / 100).toFixed(2));
  $('#icons-toggle').checked = settings.showIcons !== false;
  $('#widgets-toggle').checked = settings.showWidgets !== false;
  $('#autohide-toggle').checked = settings.autoHide === true;
  $('#center-toggle').checked = settings.centerApps !== false;
  $('#icon-size').value = settings.iconSize || 'comfortable';
  $('#dock-style').value = settings.dockStyle || 'floating';
  $('#taskbar').classList.toggle('wide', settings.dockStyle === 'wide');
  $('#taskbar').classList.toggle('autohide', settings.autoHide === true);
  $('#taskbar').parentElement.classList.toggle('left', settings.centerApps === false);
  document.querySelectorAll('.theme-option').forEach(button => button.classList.toggle('active', button.dataset.theme === settings.theme));
  document.querySelectorAll('.language-switch button').forEach(button => button.classList.toggle('active', button.dataset.language === settings.language));
}
async function persist(patch) { settings = await window.windows12.settings.write({ ...settings, ...patch }); applySettings(); return settings; }

function desktopIconMarkup(item) {
  const name = escapeHTML(item.name);
  return `<button class="desktop-icon" data-launch="${item.id}" title="Открыть: ${name}">${visualIcon(item, 'desktop-icon-symbol')}<span class="desktop-icon-label">${name}</span></button>`;
}
function appMarkup(item) {
  const name = escapeHTML(item.name);
  return `<button class="app-item" data-launch="${item.id}" title="Открыть: ${name}">${visualIcon(item, 'app-icon')}<b>${name}</b></button>`;
}
function bindLaunchButtons(root = document) { root.querySelectorAll('[data-launch]').forEach(button => { button.addEventListener('click', () => launch(button.dataset.launch)); }); }
function renderDesktop() {
  const entries = catalog.desktop || [];
  const midpoint = Math.ceil(entries.length / 2);
  $('#desktop-left').innerHTML = entries.slice(0, midpoint).map(desktopIconMarkup).join('');
  $('#desktop-right').innerHTML = entries.slice(midpoint).map(desktopIconMarkup).join('');
  bindLaunchButtons($('#desktop-left')); bindLaunchButtons($('#desktop-right'));
  const realShortcuts = entries.filter(item => item.kind === 'app');
  $('#desktop-empty-state').classList.toggle('show', realShortcuts.length === 0);
}
function filteredApps(filter = '') {
  const value = filter.trim().toLocaleLowerCase();
  const source = allItems.filter(item => item.kind === 'app' || item.id.startsWith('folder:'));
  return value ? source.filter(item => item.name.toLocaleLowerCase().includes(value)) : source.slice(0, 30);
}
function renderApps(filter = '') {
  const listed = filteredApps(filter);
  $('#app-grid').innerHTML = listed.map(appMarkup).join('');
  bindLaunchButtons($('#app-grid'));
  $('#catalog-status').textContent = listed.length ? tr('scanned', allItems.filter(item => item.kind === 'app').length) : tr('empty');
}
function initialPinned() {
  const candidates = [
    getItem('folder:home'), getItem('folder:documents'), getItem('folder:downloads'),
    ...allItems.filter(item => item.kind === 'app').slice(0, 4)
  ].filter(Boolean);
  return candidates.map(item => item.id);
}
function renderPinned() {
  const valid = new Set(allItems.map(item => item.id));
  const ids = (settings.pinnedIds || []).filter(id => valid.has(id));
  const finalIds = ids.length ? ids : initialPinned();
  if (!ids.length && finalIds.length) { settings.pinnedIds = finalIds; window.windows12.settings.write(settings); }
  $('#task-pinned').innerHTML = finalIds.map(id => {
    const item = getItem(id);
    return `<button class="task-app active" draggable="true" data-pin="${item.id}" title="${escapeHTML(item.name)}">${visualIcon(item, 'task-icon')}</button>`;
  }).join('');
  $('#task-pinned').querySelectorAll('.task-app').forEach(button => {
    button.addEventListener('click', () => launch(button.dataset.pin));
    button.addEventListener('dragstart', event => { draggedId = button.dataset.pin; button.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
    button.addEventListener('dragend', () => { draggedId = null; button.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); });
    button.addEventListener('dragover', event => { event.preventDefault(); if (draggedId && draggedId !== button.dataset.pin) button.classList.add('drop-target'); });
    button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
    button.addEventListener('drop', async event => {
      event.preventDefault(); const targetId = button.dataset.pin;
      if (!draggedId || draggedId === targetId) return;
      const order = [...finalIds]; const from = order.indexOf(draggedId); const to = order.indexOf(targetId);
      order.splice(from, 1); order.splice(to, 0, draggedId);
      await persist({ pinnedIds: order }); renderPinned();
    });
  });
}
async function launch(id) {
  const item = getItem(id);
  if (!item) { toast(tr('unavailable')); return; }
  const result = await window.windows12.catalog.launch(id);
  if (result && result.ok) toast(`${tr('launched')}${item.name}`);
  else toast(result?.message || tr('unavailable'));
}
async function refreshCatalog(showToast = true) {
  $('#catalog-status').textContent = 'Сканируем локальные ярлыки…';
  try {
    catalog = await window.windows12.catalog.read();
    const byId = new Map(); [...(catalog.system || []), ...(catalog.desktop || []), ...(catalog.apps || [])].forEach(item => byId.set(item.id, item));
    allItems = [...byId.values()].sort((a,b) => a.name.localeCompare(b.name, settings.language === 'en' ? 'en' : 'ru'));
    renderDesktop(); renderApps($('#app-search').value); renderPinned();
    if (showToast) toast(tr('refresh'));
  } catch { $('#catalog-status').textContent = 'Не удалось получить каталог Windows. Попробуйте обновить его.'; toast('Не удалось прочитать локальные ярлыки Windows.'); }
}
async function updateStats() {
  try {
    const stats = await window.windows12.system.stats();
    $('#memory-value').textContent = `${stats.memory}%`; $('#dock-memory').textContent = `${stats.memory}%`;
    $('#memory-meter').style.width = `${stats.memory}%`; $('#cpu-value').textContent = `${stats.cpus} ядер`;
    $('#system-name').textContent = stats.hostname || 'Локальный компьютер';
  } catch { /* локальные показатели необязательны для интерфейса */ }
}
function updateClock() {
  const locale = settings.language === 'en' ? 'en-US' : 'ru-RU'; const now = new Date();
  const time = new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(now);
  $('#clock').textContent = time; $('#hero-clock').textContent = time;
  $('#hero-date').textContent = new Intl.DateTimeFormat(locale,{weekday:'long',day:'numeric',month:'long'}).format(now);
  $('#tray-date').textContent = new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
}
async function chooseWallpaper() {
  const selected = await window.windows12.wallpaper.choose();
  if (selected) { await persist({ wallpaperPath: selected }); toast(tr('wallpaper')); }
}

$('#task-start').addEventListener('click', () => $('#start-menu').classList.contains('hidden') ? openOverlay($('#start-menu')) : closeOverlay($('#start-menu')));
$('#dock-start').addEventListener('click', () => $('#start-menu').classList.contains('hidden') ? openOverlay($('#start-menu')) : closeOverlay($('#start-menu')));
$('#command-button').addEventListener('click', () => { openOverlay($('#start-menu')); $('#app-search').focus(); });
$('#dock-search').addEventListener('click', () => { openOverlay($('#start-menu')); $('#app-search').focus(); });
$('#close-start').addEventListener('click', () => closeOverlay($('#start-menu')));
$('#open-settings').addEventListener('click', () => { closeOverlay($('#start-menu')); openOverlay($('#settings-panel')); });
$('#open-settings-toolbar').addEventListener('click', () => openOverlay($('#settings-panel')));
$('#close-settings').addEventListener('click', () => closeOverlay($('#settings-panel')));
$('#refresh-catalog').addEventListener('click', () => refreshCatalog());
$('#refresh-catalog-menu').addEventListener('click', () => refreshCatalog());
$('#minimize').addEventListener('click', () => window.windows12.window.minimize());
$('#maximize').addEventListener('click', () => window.windows12.window.maximize());
$('#close').addEventListener('click', () => window.windows12.window.close());
$('#app-search').addEventListener('input', event => renderApps(event.target.value));
$('#change-wallpaper').addEventListener('click', chooseWallpaper); $('#choose-wallpaper').addEventListener('click', chooseWallpaper);
$('#reset-wallpaper').addEventListener('click', async () => { await persist({ wallpaperPath: '' }); toast(tr('resetWallpaper')); });
$('#hide-widgets').addEventListener('click', () => persist({ showWidgets: false }));
$('#dock-stats').addEventListener('click', () => { if (settings.showWidgets === false) persist({ showWidgets: true }); else $('#glance-stack').animate([{transform:'translateX(0)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:280}); });
$('#dock-clock').addEventListener('click', () => { if (settings.showWidgets === false) persist({ showWidgets: true }); });
document.querySelectorAll('[data-system]').forEach(button => button.addEventListener('click', () => launch(button.dataset.system)));
$('#power-button').addEventListener('click', () => toast(tr('session')));
document.querySelector('.theme-options').addEventListener('click', event => { const button = event.target.closest('.theme-option'); if (button) persist({ theme: button.dataset.theme }); });
$('#icons-toggle').addEventListener('change', event => persist({ showIcons: event.target.checked }));
$('#widgets-toggle').addEventListener('change', event => persist({ showWidgets: event.target.checked }));
$('#autohide-toggle').addEventListener('change', event => persist({ autoHide: event.target.checked }));
$('#center-toggle').addEventListener('change', event => persist({ centerApps: event.target.checked }));
$('#icon-size').addEventListener('change', event => persist({ iconSize: event.target.value }));
$('#dock-style').addEventListener('change', event => persist({ dockStyle: event.target.value }));
document.querySelector('.language-switch').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; persist({ language: button.dataset.language }).then(() => { updateClock(); renderApps($('#app-search').value); }); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeOverlay($('#start-menu')); closeOverlay($('#settings-panel')); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openOverlay($('#start-menu')); $('#app-search').focus(); } });

(async function init() {
  settings = { ...settings, ...await window.windows12.settings.read() };
  applySettings(); updateClock(); await refreshCatalog(false); await updateStats();
  setInterval(updateClock, 30_000); setInterval(updateStats, 8_000);
  if (!localStorage.getItem('windows12-first-run-v3')) { $('#onboarding').classList.remove('hidden'); setTimeout(() => { $('#onboarding').classList.add('hidden'); localStorage.setItem('windows12-first-run-v3', 'done'); }, 3000); }
})();
