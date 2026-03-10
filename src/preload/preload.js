const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('viewer:pickFolder'),
  loadLastFolder: () => ipcRenderer.invoke('viewer:loadLastFolder'),
  loadFolder: (folderPath) => ipcRenderer.invoke('viewer:loadFolder', folderPath),
  readImage: (imagePath) => ipcRenderer.invoke('viewer:readImage', imagePath),
  readExif: (imagePath) => ipcRenderer.invoke('viewer:readExif', imagePath),
  deleteImage: (imagePath) => ipcRenderer.invoke('viewer:deleteImage', imagePath),
  moveImage: (imagePath) => ipcRenderer.invoke('viewer:moveImage', imagePath),
  changeMoveTargetFolder: () => ipcRenderer.invoke('viewer:changeMoveTargetFolder'),
  listWorkflowFolders: (rootPath) => ipcRenderer.invoke('viewer:listWorkflowFolders', rootPath),
  moveImageToFolder: (imagePath, destinationFolder) =>
    ipcRenderer.invoke('viewer:moveImageToFolder', imagePath, destinationFolder),
  bulkMoveImages: (imagePaths, destinationFolder) =>
    ipcRenderer.invoke('viewer:bulkMoveImages', imagePaths, destinationFolder),
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
