const path = require('node:path');
const { BrowserWindow, dialog, ipcMain } = require('electron');

function registerViewerIpcHandlers({ settingsStore, imageService, watchFolder }) {
  const { readSettings, updateSettings } = settingsStore;

  async function changeMoveTargetFolder(event) {
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
  }

  async function ensureMoveTargetFolder(event) {
    const settings = await readSettings();
    const remembered = settings.moveTargetFolder;

    if (typeof remembered === 'string' && remembered.length > 0) {
      const exists = await imageService.isDirectory(remembered);
      if (exists) {
        return remembered;
      }
    }

    return changeMoveTargetFolder(event);
  }

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
    const destinationFolder = await ensureMoveTargetFolder(event);
    if (!destinationFolder) {
      return null;
    }

    return imageService.copyImageFile(imagePath, destinationFolder);
  });

  ipcMain.handle('viewer:changeMoveTargetFolder', async (event) => {
    const destinationFolder = await changeMoveTargetFolder(event);
    return destinationFolder;
  });
}

module.exports = {
  registerViewerIpcHandlers,
};
