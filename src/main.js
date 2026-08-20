const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let mainWindow;
let launchCatalog = new Map();
let fileCatalog = new Map();
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const notesPath = path.join(app.getPath('userData'), 'notes.json');
const defaultSettings = {
  theme: 'violet', language: 'ru', reduceMotion: false, showIcons: true,
  showWidgets: false, iconSize: 'comfortable', autoHide: false, centerApps: true,
  dockStyle: 'floating', wallpaperPath: '', wallpaperDim: 42, focusMode: false,
  cinemaMode: false, pinnedIds: [], recentIds: []
};

function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJSON(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
function readSettings() { return { ...defaultSettings, ...readJSON(settingsPath, {}) }; }
function sanitizeSettings(input = {}) {
  const result = { ...readSettings() };
  if (['violet', 'red', 'ocean', 'aurora'].includes(input.theme)) result.theme = input.theme;
  if (['ru', 'en'].includes(input.language)) result.language = input.language;
  ['reduceMotion', 'showIcons', 'showWidgets', 'autoHide', 'centerApps', 'focusMode', 'cinemaMode'].forEach(key => { if (typeof input[key] === 'boolean') result[key] = input[key]; });
  if (['compact', 'comfortable', 'large'].includes(input.iconSize)) result.iconSize = input.iconSize;
  if (['floating', 'wide'].includes(input.dockStyle)) result.dockStyle = input.dockStyle;
  if (typeof input.wallpaperPath === 'string' && (input.wallpaperPath === '' || path.isAbsolute(input.wallpaperPath))) result.wallpaperPath = input.wallpaperPath;
  if (Number.isInteger(input.wallpaperDim) && input.wallpaperDim >= 10 && input.wallpaperDim <= 80) result.wallpaperDim = input.wallpaperDim;
  if (Array.isArray(input.pinnedIds)) result.pinnedIds = input.pinnedIds.filter(value => typeof value === 'string').slice(0, 16);
  if (Array.isArray(input.recentIds)) result.recentIds = input.recentIds.filter(value => typeof value === 'string').slice(0, 10);
  return result;
}
function saveSettings(settings) { const safe = sanitizeSettings(settings); writeJSON(settingsPath, safe); return safe; }
function safeStat(file) { try { return fs.statSync(file); } catch { return null; } }
function makeId(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 20); }
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
  try { const image = await app.getFileIcon(file, { size: 'normal' }); return image && !image.isEmpty() ? image.toDataURL() : ''; }
  catch { return ''; }
}
function previewFor(file) {
  try {
    const stat = safeStat(file);
    if (!stat || stat.size > 15 * 1024 * 1024 || !/\.(png|jpe?g|webp|bmp)$/i.test(file)) return '';
    const image = nativeImage.createFromPath(file);
    return image && !image.isEmpty() ? image.resize({ width: 320, height: 240, quality: 'good' }).toDataURL() : '';
  } catch { return ''; }
}
async function collectEntries(root, limit = 160, maxDepth = 4) {
  const files = [];
  function walk(dir, depth) {
    if (files.length >= limit || depth > maxDepth) return;
    let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= limit) break;
      if (entry.name.startsWith('.')) continue;
      const itemPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(itemPath, depth + 1); continue; }
      if (/\.(lnk|url|exe)$/i.test(entry.name)) files.push(itemPath);
    }
  }
  walk(root, 0);
  return Promise.all(files.map(async itemPath => ({ id: makeId(itemPath), name: labelFor(itemPath), path: itemPath, icon: fallbackIcon(itemPath), iconData: await iconDataFor(itemPath), tone: toneFor(itemPath), kind: 'app' })));
}
function knownFolders() {
  return [
    { id: 'folder:desktop', name: 'Рабочий стол', path: app.getPath('desktop'), icon: '▧', tone: 'folder', kind: 'folder', iconData: '' },
    { id: 'folder:documents', name: 'Документы', path: app.getPath('documents'), icon: '▤', tone: 'folder', kind: 'folder', iconData: '' },
    { id: 'folder:downloads', name: 'Загрузки', path: app.getPath('downloads'), icon: '↓', tone: 'folder', kind: 'folder', iconData: '' },
    { id: 'folder:pictures', name: 'Изображения', path: app.getPath('pictures'), icon: '◫', tone: 'violet', kind: 'folder', iconData: '' },
    { id: 'folder:home', name: 'Этот компьютер', path: app.getPath('home'), icon: '▣', tone: 'blue', kind: 'folder', iconData: '' }
  ];
}
async function refreshCatalog() {
  const appData = process.env.APPDATA || path.join(app.getPath('appData'), 'Roaming');
  const programData = process.env.ProgramData || (process.platform === 'win32' ? 'C:\\ProgramData' : '');
  const publicDir = process.env.PUBLIC || (process.platform === 'win32' ? 'C:\\Users\\Public' : '');
  const desktopRoots = [app.getPath('desktop'), publicDir && path.join(publicDir, 'Desktop')].filter(Boolean);
  const startRoots = [path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), programData && path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')].filter(Boolean);
  const desktopApps = (await Promise.all(desktopRoots.map(dir => collectEntries(dir, 50, 1)))).flat();
  const seen = new Set(desktopApps.map(item => item.path.toLowerCase()));
  const startApps = (await Promise.all(startRoots.map(dir => collectEntries(dir, 180, 4)))).flat().filter(item => !seen.has(item.path.toLowerCase()));
  const system = knownFolders(); const all = [...system, ...desktopApps, ...startApps];
  launchCatalog = new Map(all.map(item => [item.id, item]));
  return { desktop: [...system.slice(0, 1), ...desktopApps.slice(0, 30), ...system.slice(1, 4)], apps: startApps.slice(0, 180), system };
}
function rememberRecent(id) { const settings = readSettings(); settings.recentIds = [id, ...settings.recentIds.filter(value => value !== id)].slice(0, 10); saveSettings(settings); }
function safeFolder(folderId) { return knownFolders().find(folder => folder.id === folderId); }
async function directoryItems(folderId, limit = 96) {
  const folder = safeFolder(folderId);
  if (!folder || !safeStat(folder.path)?.isDirectory()) return { ok: false, message: 'Эта локальная папка недоступна.' };
  let entries = []; try { entries = fs.readdirSync(folder.path, { withFileTypes: true }); } catch { return { ok: false, message: 'Не удалось прочитать папку.' }; }
  const filtered = entries.filter(entry => !entry.name.startsWith('.')).sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'ru')).slice(0, limit);
  const items = await Promise.all(filtered.map(async entry => {
    const entryPath = path.join(folder.path, entry.name); const stat = safeStat(entryPath); const id = `entry:${makeId(entryPath)}`;
    const item = { id, name: entry.name, type: entry.isDirectory() ? 'folder' : path.extname(entry.name).replace('.', '').toUpperCase() || 'Файл', isDirectory: entry.isDirectory(), size: stat?.size || 0, modified: stat?.mtimeMs || 0, iconData: entry.isDirectory() ? '' : await iconDataFor(entryPath), preview: entry.isDirectory() ? '' : previewFor(entryPath) };
    fileCatalog.set(id, { path: entryPath, parentFolderId: folderId, isDirectory: entry.isDirectory() }); return item;
  }));
  return { ok: true, folder: { id: folder.id, name: folder.name }, items };
}
async function galleryItems(limit = 72) {
  const pictures = safeFolder('folder:pictures');
  if (!pictures || !safeStat(pictures.path)?.isDirectory()) return { ok: true, items: [] };
  let entries = []; try { entries = fs.readdirSync(pictures.path, { withFileTypes: true }); } catch { return { ok: true, items: [] }; }
  const images = entries.filter(entry => entry.isFile() && /\.(png|jpe?g|webp|bmp)$/i.test(entry.name)).slice(0, limit);
  const items = images.map(entry => { const entryPath = path.join(pictures.path, entry.name); const id = `entry:${makeId(entryPath)}`; fileCatalog.set(id, { path: entryPath, parentFolderId: pictures.id, isDirectory: false }); return { id, name: entry.name, preview: previewFor(entryPath), modified: safeStat(entryPath)?.mtimeMs || 0 }; });
  return { ok: true, items };
}
function readNotes() { const list = readJSON(notesPath, []); return Array.isArray(list) ? list.filter(note => note && typeof note.id === 'string' && typeof note.text === 'string').slice(0, 50) : []; }
function writeNotes(input) {
  if (!Array.isArray(input)) return readNotes();
  const notes = input.slice(0, 50).map(note => ({ id: typeof note.id === 'string' ? note.id.slice(0, 60) : makeId(`${Date.now()}${Math.random()}`), text: typeof note.text === 'string' ? note.text.slice(0, 6000) : '', updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.now() }));
  writeJSON(notesPath, notes); return notes;
}
function systemStats() {
  const total = os.totalmem(); const free = os.freemem(); const memory = total ? Math.round(((total - free) / total) * 100) : 0;
  return { memory, memoryTotalGb: Math.round(total / 1024 / 1024 / 1024), cpus: os.cpus().length, hostname: os.hostname(), platform: process.platform, arch: process.arch, uptimeHours: Math.round(os.uptime() / 3600) };
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 980, minHeight: 640, frame: false, transparent: true, backgroundColor: '#00000000', show: false, title: 'Windows 12 Prism', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.maximize(); mainWindow.show(); });
}
app.whenReady().then(() => {
  ipcMain.handle('settings:read', () => readSettings()); ipcMain.handle('settings:write', (_event, settings) => saveSettings(settings));
  ipcMain.handle('catalog:read', () => refreshCatalog());
  ipcMain.handle('catalog:launch', (_event, id) => { const item = launchCatalog.get(id); if (!item || !safeStat(item.path)) return { ok: false, message: 'Этот ярлык больше недоступен. Обновите каталог приложений.' }; rememberRecent(id); return shell.openPath(item.path).then(error => error ? { ok: false, message: error } : { ok: true }); });
  ipcMain.handle('catalog:reveal', (_event, id) => { const item = launchCatalog.get(id); if (!item || !safeStat(item.path)) return { ok: false, message: 'Этот ярлык больше недоступен.' }; shell.showItemInFolder(item.path); return { ok: true }; });
  ipcMain.handle('files:list', (_event, folderId) => directoryItems(folderId));
  ipcMain.handle('files:gallery', () => galleryItems());
  ipcMain.handle('files:open', (_event, id) => { const item = fileCatalog.get(id); if (!item || !safeStat(item.path)) return { ok:false, message:'Файл больше недоступен.' }; return shell.openPath(item.path).then(error => error ? { ok:false, message:error } : { ok:true }); });
  ipcMain.handle('files:reveal', (_event, id) => { const item = fileCatalog.get(id); if (!item || !safeStat(item.path)) return { ok:false, message:'Файл больше недоступен.' }; shell.showItemInFolder(item.path); return { ok:true }; });
  ipcMain.handle('notes:read', () => readNotes()); ipcMain.handle('notes:write', (_event, notes) => writeNotes(notes));
  ipcMain.handle('system:stats', () => systemStats());
  ipcMain.handle('wallpaper:choose', async () => { const answer = await dialog.showOpenDialog(mainWindow, { title:'Выберите обои рабочего стола', properties:['openFile'], filters:[{ name:'Изображения', extensions:['png','jpg','jpeg','webp','bmp'] }] }); return answer.canceled ? '' : answer.filePaths[0]; });
  ipcMain.handle('window:minimize', () => mainWindow.minimize()); ipcMain.handle('window:close', () => mainWindow.close()); ipcMain.handle('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); }); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
