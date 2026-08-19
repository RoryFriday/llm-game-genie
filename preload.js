const { contextBridge, ipcRenderer } = require('electron');

// Only what the overlay UI needs is exposed - no direct Node/Electron access.
contextBridge.exposeInMainWorld('copilot', {
  ask: (prompt) => ipcRenderer.invoke('ask-copilot', prompt),
  getCurrentGame: () => ipcRenderer.invoke('get-current-game'),
  getCurrentProvider: () => ipcRenderer.invoke('get-current-provider'),
  resize: (width, height) => ipcRenderer.invoke('resize-overlay', { width, height }),
});
