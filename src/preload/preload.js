const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('viewer:pickFolder'),
  loadLastFolder: () => ipcRenderer.invoke('viewer:loadLastFolder'),
  readImage: (imagePath) => ipcRenderer.invoke('viewer:readImage', imagePath),
  readExif: (imagePath) => ipcRenderer.invoke('viewer:readExif', imagePath),
  deleteImage: (imagePath) => ipcRenderer.invoke('viewer:deleteImage', imagePath),
  moveImage: (imagePath) => ipcRenderer.invoke('viewer:moveImage', imagePath),
  changeMoveTargetFolder: () => ipcRenderer.invoke('viewer:changeMoveTargetFolder'),
  onFolderUpdated: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('viewer:folderUpdated', listener);

    return () => {
      ipcRenderer.removeListener('viewer:folderUpdated', listener);
    };
  },
});
