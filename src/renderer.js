const apps = [
  { name: 'Проводник', icon: '▣', color: 'blue', path: '.' },
  { name: 'Настройки', icon: '⚙', color: 'purple', action: 'settings' },
  { name: 'Браузер', icon: '◉', color: 'cyan', url: 'https://www.bing.com' },
  { name: 'Терминал', icon: '>_', color: 'dark' },
  { name: 'Заметки', icon: '✎', color: 'yellow' },
  { name: 'Фото', icon: '✦', color: 'pink' },
  { name: 'Музыка', icon: '♫', color: 'orange' },
  { name: 'Калькулятор', icon: '＋', color: 'green' },
  { name: 'Календарь', icon: '□', color: 'red' },
  { name: 'Помощь', icon: '?', color: 'gray' }
];
const $ = (s) => document.querySelector(s);
const app = $('#app');
let settings = { theme: 'violet', language: 'ru', reduceMotion: false };

function openPanel(panel) { panel.classList.remove('hidden'); panel.animate([{opacity:0, transform:'translate(-50%, 16px)'},{opacity:1, transform:'translate(-50%, 0)'}], {duration:280, easing:'cubic-bezier(.2,.8,.2,1)'}); }
function closePanel(panel) { panel.classList.add('hidden'); }
function renderApps(filter = '') {
  const grid = $('#app-grid');
  grid.innerHTML = apps.filter(a => a.name.toLowerCase().includes(filter.toLowerCase())).map((a, i) => `<button class="app-item" data-app="${i}"><span class="app-icon file-icon ${a.color}">${a.icon}</span><b>${a.name}</b></button>`).join('');
  grid.querySelectorAll('[data-app]').forEach(btn => btn.addEventListener('click', () => launchApp(apps[Number(btn.dataset.app)])));
}
function renderPinned() {
  $('#task-pinned').innerHTML = apps.slice(0, 5).map((a, i) => `<button class="task-app" title="${a.name}" data-task="${i}"><span class="file-icon ${a.color}">${a.icon}</span></button>`).join('');
  $('#task-pinned').querySelectorAll('[data-task]').forEach(btn => btn.addEventListener('click', () => launchApp(apps[Number(btn.dataset.task)])));
}
function launchApp(item) {
  if (item.action === 'settings') { closePanel($('#start-menu')); openPanel($('#settings-panel')); return; }
  if (item.path) window.windows12.shell.openPath(item.path);
  else if (item.url) window.windows12.shell.openExternal(item.url);
  else showToast(`${item.name} готов к запуску на Windows`);
}
function showToast(text) {
  let toast = $('.toast'); if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = text; toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function applySettings() {
  document.body.classList.toggle('theme-red', settings.theme === 'red');
  document.body.classList.toggle('reduce-motion', settings.reduceMotion);
  document.querySelectorAll('.theme-option').forEach(el => el.classList.toggle('active', el.dataset.theme === settings.theme));
  $('#motion-toggle').checked = !settings.reduceMotion;
}
async function persist(patch) { settings = await window.windows12.settings.write({...settings, ...patch}); applySettings(); }
function updateClock() { $('#clock').textContent = new Intl.DateTimeFormat(settings.language === 'ru' ? 'ru-RU' : 'en-US', {hour:'2-digit', minute:'2-digit'}).format(new Date()); }

$('#open-start').addEventListener('click', () => openPanel($('#start-menu')));
$('#task-start').addEventListener('click', () => $('#start-menu').classList.contains('hidden') ? openPanel($('#start-menu')) : closePanel($('#start-menu')));
$('#close-start').addEventListener('click', () => closePanel($('#start-menu')));
$('#open-settings').addEventListener('click', () => openPanel($('#settings-panel')));
$('#close-settings').addEventListener('click', () => closePanel($('#settings-panel')));
$('#minimize').addEventListener('click', () => window.windows12.window.minimize());
$('#close').addEventListener('click', () => window.windows12.window.close());
$('#open-home').addEventListener('click', () => window.windows12.shell.openPath('.'));
$('#app-search').addEventListener('input', e => renderApps(e.target.value));
$('.theme-options').addEventListener('click', e => { const option = e.target.closest('.theme-option'); if (option) persist({theme: option.dataset.theme}); });
$('#motion-toggle').addEventListener('change', e => persist({reduceMotion: !e.target.checked}));
$('.language-switch').addEventListener('click', e => { const btn = e.target.closest('button'); if (!btn) return; $('.language-switch .active').classList.remove('active'); btn.classList.add('active'); settings.language = btn.textContent === 'English' ? 'en' : 'ru'; persist({language: settings.language}); updateClock(); showToast(settings.language === 'ru' ? 'Русский язык активен' : 'English mode is active'); });
document.querySelectorAll('.file-row').forEach(row => row.addEventListener('click', () => window.windows12.shell.openPath(row.dataset.path)));

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePanel($('#start-menu')); closePanel($('#settings-panel')); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPanel($('#start-menu')); $('#app-search').focus(); } });
(async function init() {
  settings = await window.windows12.settings.read();
  renderApps(); renderPinned(); applySettings(); updateClock(); setInterval(updateClock, 30000);
  const firstRunKey = 'windows12-first-run';
  if (!localStorage.getItem(firstRunKey)) { $('#onboarding').classList.remove('hidden'); setTimeout(() => { $('#onboarding').classList.add('hidden'); localStorage.setItem(firstRunKey, 'done'); }, 3300); }
  try { const info = await window.windows12.system.info(); $('#system-caption').textContent = `Локальный режим · ${info.arch === 'x64' ? '64-битная система' : 'локальная система'}`; } catch {}
})();
