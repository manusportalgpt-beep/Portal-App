const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('windows12', {
  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: (settings) => ipcRenderer.invoke('settings:write', settings)
  },
  shell: {
    openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  window: { minimize: () => ipcRenderer.invoke('window:minimize'), close: () => ipcRenderer.invoke('window:close') },
  system: { info: () => ipcRenderer.invoke('system:info') }
});
