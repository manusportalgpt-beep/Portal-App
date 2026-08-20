const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const defaultSettings = { theme: 'violet', language: 'ru', accent: 'violet', reduceMotion: false, dockSize: 'comfortable' };

function readSettings() {
  try { return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }; }
  catch { return defaultSettings; }
}
function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ ...defaultSettings, ...settings }, null, 2), 'utf8');
  return readSettings();
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640,
    frame: false, transparent: true, backgroundColor: '#00000000', show: false,
    title: 'Windows 12 Launcher',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}
app.whenReady().then(() => {
  ipcMain.handle('settings:read', () => readSettings());
  ipcMain.handle('settings:write', (_event, settings) => saveSettings(settings));
  ipcMain.handle('shell:openPath', (_event, target) => {
    const known = { home: os.homedir(), desktop: path.join(os.homedir(), 'Desktop'), documents: path.join(os.homedir(), 'Documents'), downloads: path.join(os.homedir(), 'Downloads') };
    return shell.openPath(known[target] || target || os.homedir());
  });
  ipcMain.handle('shell:openExternal', (_event, url) => /^https?:\/\//i.test(url) ? shell.openExternal(url) : 'blocked');
  ipcMain.handle('window:minimize', () => mainWindow.minimize());
  ipcMain.handle('window:close', () => mainWindow.close());
  ipcMain.handle('system:info', () => ({ platform: process.platform, arch: process.arch, hostname: os.hostname(), home: os.homedir() }));
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
