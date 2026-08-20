const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windows12', {
  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: (settings) => ipcRenderer.invoke('settings:write', settings)
  },
  catalog: {
    read: () => ipcRenderer.invoke('catalog:read'),
    launch: (id) => ipcRenderer.invoke('catalog:launch', id)
  },
  system: { stats: () => ipcRenderer.invoke('system:stats') },
  wallpaper: { choose: () => ipcRenderer.invoke('wallpaper:choose') },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  }
});
