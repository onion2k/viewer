const path = require('node:path');
const { BrowserWindow, dialog, ipcMain } = require('electron');

function registerViewerIpcHandlers({ settingsStore, imageService, watchFolder }) {
  const { readSettings, updateSettings } = settingsStore;

  ipcMain.handle('viewer:pickFolder', async (event) => {
    const result = await dialog.showOpenDialog({
      title: 'Select image folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const folderPath = result.filePaths[0];
    await updateSettings({ lastFolder: folderPath });
    watchFolder(event.sender, folderPath);
    return imageService.buildFolderPayload(folderPath);
  });

  ipcMain.handle('viewer:loadLastFolder', async (event) => {
    const settings = await readSettings();
    const folderPath = settings.lastFolder;

    if (!folderPath) {
      return null;
    }

    const exists = await imageService.isDirectory(folderPath);
    if (!exists) {
      return null;
    }

    watchFolder(event.sender, folderPath);
    return imageService.buildFolderPayload(folderPath);
  });

  ipcMain.handle('viewer:loadFolder', async (event, folderPath) => {
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      return null;
    }
    const exists = await imageService.isDirectory(folderPath);
    if (!exists) {
      return null;
    }
    watchFolder(event.sender, folderPath);
    return imageService.buildFolderPayload(folderPath);
  });

  ipcMain.handle('viewer:readImage', async (_event, imagePath) => {
    return imageService.readImageDataUrl(imagePath);
  });

  ipcMain.handle('viewer:readExif', async (_event, imagePath) => {
    return imageService.readExifData(imagePath);
  });

  ipcMain.handle('viewer:deleteImage', async (_event, imagePath) => {
    const deletedPath = await imageService.deleteImageFile(imagePath);
    return imageService.buildFolderPayload(path.dirname(deletedPath));
  });

  ipcMain.handle('viewer:moveImage', async (event, imagePath) => {
    const settings = await readSettings();
    const destinationFolder = settings.moveTargetFolder;
    if (!destinationFolder) {
      return null;
    }

    return imageService.copyImageFile(imagePath, destinationFolder);
  });

  ipcMain.handle('viewer:changeMoveTargetFolder', async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: 'Select destination folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const destinationFolder = result.filePaths[0];
    await updateSettings({ moveTargetFolder: destinationFolder });
    return destinationFolder;
  });

  ipcMain.handle('viewer:pickDestinationFolder', async (event, title) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: typeof title === 'string' && title.length > 0 ? title : 'Select destination folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('viewer:listWorkflowFolders', async (_event, rootPath) => {
    return imageService.listWorkflowFolders(rootPath);
  });

  ipcMain.handle('viewer:moveImageToFolder', async (_event, imagePath, destinationFolder) => {
    return imageService.moveImageToFolder(imagePath, destinationFolder);
  });

  ipcMain.handle('viewer:bulkMoveImages', async (_event, imagePaths, destinationFolder) => {
    return imageService.bulkMoveImages(imagePaths, destinationFolder);
  });
}

module.exports = {
  registerViewerIpcHandlers,
};
