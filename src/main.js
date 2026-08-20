const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let mainWindow;
let launchCatalog = new Map();
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const defaultSettings = {
  theme: 'violet', language: 'ru', reduceMotion: false, showIcons: true,
  showWidgets: false, iconSize: 'comfortable', autoHide: false,
  centerApps: true, dockStyle: 'floating', wallpaperPath: '', wallpaperDim: 42,
  focusMode: false, pinnedIds: []
};

function readSettings() {
  try { return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }; }
  catch { return { ...defaultSettings }; }
}
function sanitizeSettings(input = {}) {
  const previous = readSettings();
  const result = { ...previous };
  if (['violet', 'red', 'ocean'].includes(input.theme)) result.theme = input.theme;
  if (['ru', 'en'].includes(input.language)) result.language = input.language;
  ['reduceMotion', 'showIcons', 'showWidgets', 'autoHide', 'centerApps', 'focusMode'].forEach(key => {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  });
  if (['compact', 'comfortable', 'large'].includes(input.iconSize)) result.iconSize = input.iconSize;
  if (['floating', 'wide'].includes(input.dockStyle)) result.dockStyle = input.dockStyle;
  if (typeof input.wallpaperPath === 'string' && (input.wallpaperPath === '' || path.isAbsolute(input.wallpaperPath))) result.wallpaperPath = input.wallpaperPath;
  if (Number.isInteger(input.wallpaperDim) && input.wallpaperDim >= 10 && input.wallpaperDim <= 80) result.wallpaperDim = input.wallpaperDim;
  if (Array.isArray(input.pinnedIds)) result.pinnedIds = input.pinnedIds.filter(value => typeof value === 'string').slice(0, 14);
  return result;
}
function saveSettings(settings) {
  const safeSettings = sanitizeSettings(settings);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(safeSettings, null, 2), 'utf8');
  return safeSettings;
}
function safeStat(file) { try { return fs.statSync(file); } catch { return null; } }
function makeId(file) { return crypto.createHash('sha256').update(file).digest('hex').slice(0, 18); }
function labelFor(file) { return path.basename(file, path.extname(file)).replace(/\.lnk$/i, '') || path.basename(file); }
function fallbackIcon(name) {
  const value = name.toLowerCase();
  if (/(steam|game|roblox|discord|epic|battle)/.test(value)) return '◈';
  if (/(chrome|edge|firefox|browser|брауз)/.test(value)) return '◉';
  if (/(code|visual studio|idea|studio)/.test(value)) return '</>';
  if (/(word|excel|powerpoint|office)/.test(value)) return '▤';
  if (/(music|spotify|музык)/.test(value)) return '♫';
  if (/(photo|paint|фото|image)/.test(value)) return '◫';
  return '◩';
}
function toneFor(name) {
  const value = name.toLowerCase();
  if (/(steam|game|roblox|discord|battle)/.test(value)) return 'violet';
  if (/(chrome|edge|firefox|browser|брауз)/.test(value)) return 'blue';
  if (/(code|studio|terminal|терминал)/.test(value)) return 'teal';
  if (/(word|excel|office)/.test(value)) return 'blue';
  return 'silver';
}
async function iconDataFor(file) {
  try {
    const image = await app.getFileIcon(file, { size: 'normal' });
    return image && !image.isEmpty() ? image.toDataURL() : '';
  } catch { return ''; }
}
async function collectEntries(root, limit = 120, maxDepth = 4) {
  const files = [];
  function walk(dir, depth) {
    if (files.length >= limit || depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= limit) break;
      if (entry.name.startsWith('.')) continue;
      const itemPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(itemPath, depth + 1); continue; }
      if (/\.(lnk|url|exe)$/i.test(entry.name)) files.push(itemPath);
    }
  }
  walk(root, 0);
  return Promise.all(files.map(async itemPath => ({
    id: makeId(itemPath), name: labelFor(itemPath), path: itemPath,
    icon: fallbackIcon(itemPath), iconData: await iconDataFor(itemPath),
    tone: toneFor(itemPath), kind: 'app'
  })));
}
function knownFolders() {
  return [
    { id: 'folder:desktop', name: 'Рабочий стол', path: app.getPath('desktop'), icon: '▧', tone: 'folder', kind: 'folder', iconData: '' },
    { id: 'folder:documents', name: 'Документы', path: app.getPath('documents'), icon: '▤', tone: 'folder', kind: 'folder', iconData: '' },
    { id: 'folder:downloads', name: 'Загрузки', path: app.getPath('downloads'), icon: '↓', tone: 'folder', kind: 'folder', iconData: '' },
    { id: 'folder:home', name: 'Этот компьютер', path: app.getPath('home'), icon: '▣', tone: 'blue', kind: 'folder', iconData: '' }
  ];
}
async function refreshCatalog() {
  const appData = process.env.APPDATA || path.join(app.getPath('appData'), 'Roaming');
  const programData = process.env.ProgramData || (process.platform === 'win32' ? 'C:\\ProgramData' : '');
  const publicDir = process.env.PUBLIC || (process.platform === 'win32' ? 'C:\\Users\\Public' : '');
  const desktopRoots = [app.getPath('desktop'), publicDir && path.join(publicDir, 'Desktop')].filter(Boolean);
  const startRoots = [
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    programData && path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ].filter(Boolean);
  const desktopApps = (await Promise.all(desktopRoots.map(dir => collectEntries(dir, 50, 1)))).flat();
  const seen = new Set(desktopApps.map(item => item.path.toLowerCase()));
  const startApps = (await Promise.all(startRoots.map(dir => collectEntries(dir, 160, 4)))).flat().filter(item => !seen.has(item.path.toLowerCase()));
  const system = knownFolders();
  const all = [...system, ...desktopApps, ...startApps];
  launchCatalog = new Map(all.map(item => [item.id, item]));
  return { desktop: [...system.slice(0, 1), ...desktopApps.slice(0, 27), ...system.slice(1, 3)], apps: startApps.slice(0, 180), system };
}
function systemStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const memory = total ? Math.round(((total - free) / total) * 100) : 0;
  return { memory, cpus: os.cpus().length, hostname: os.hostname(), platform: process.platform, arch: process.arch };
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, frame: false,
    transparent: true, backgroundColor: '#00000000', show: false, title: 'Windows 12 Launcher',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.maximize(); mainWindow.show(); });
}
app.whenReady().then(() => {
  ipcMain.handle('settings:read', () => readSettings());
  ipcMain.handle('settings:write', (_event, settings) => saveSettings(settings));
  ipcMain.handle('catalog:read', () => refreshCatalog());
  ipcMain.handle('catalog:launch', (_event, id) => {
    const item = launchCatalog.get(id);
    if (!item || !safeStat(item.path)) return { ok: false, message: 'Этот ярлык больше недоступен. Обновите каталог приложений.' };
    return shell.openPath(item.path).then(error => error ? { ok: false, message: error } : { ok: true });
  });
  ipcMain.handle('system:stats', () => systemStats());
  ipcMain.handle('wallpaper:choose', async () => {
    const answer = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите обои рабочего стола', properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    });
    return answer.canceled ? '' : answer.filePaths[0];
  });
  ipcMain.handle('window:minimize', () => mainWindow.minimize());
  ipcMain.handle('window:close', () => mainWindow.close());
  ipcMain.handle('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
