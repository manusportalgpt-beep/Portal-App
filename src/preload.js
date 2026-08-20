const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windows12', {
  settings: { read: () => ipcRenderer.invoke('settings:read'), write: settings => ipcRenderer.invoke('settings:write', settings) },
  catalog: { read: () => ipcRenderer.invoke('catalog:read'), launch: id => ipcRenderer.invoke('catalog:launch', id), reveal: id => ipcRenderer.invoke('catalog:reveal', id) },
  files: { list: folderId => ipcRenderer.invoke('files:list', folderId), gallery: () => ipcRenderer.invoke('files:gallery'), open: id => ipcRenderer.invoke('files:open', id), reveal: id => ipcRenderer.invoke('files:reveal', id) },
  notes: { read: () => ipcRenderer.invoke('notes:read'), write: notes => ipcRenderer.invoke('notes:write', notes) },
  system: { stats: () => ipcRenderer.invoke('system:stats') },
  wallpaper: { choose: () => ipcRenderer.invoke('wallpaper:choose') },
  window: { minimize: () => ipcRenderer.invoke('window:minimize'), maximize: () => ipcRenderer.invoke('window:maximize'), close: () => ipcRenderer.invoke('window:close') }
});
