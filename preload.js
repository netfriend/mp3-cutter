const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('open-file'),
  getLaunchFile: () => ipcRenderer.invoke('get-launch-file'),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  exportMp3: (options) => ipcRenderer.invoke('export-mp3', options),
  registerContextMenu: () => ipcRenderer.invoke('register-context-menu'),
  unregisterContextMenu: () => ipcRenderer.invoke('unregister-context-menu'),
  onFileOpened: (callback) => {
    const listener = (_event, file) => callback(file);
    ipcRenderer.on('file-opened', listener);
    return () => ipcRenderer.removeListener('file-opened', listener);
  },
});
