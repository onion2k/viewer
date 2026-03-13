const path = require('node:path');
const { BrowserWindow, dialog, ipcMain } = require('electron');

const MAX_RECENT_FOLDERS = 12;

function normalizeRecentFolders(settings) {
  const entries = [];
  if (Array.isArray(settings?.recentFolders)) {
    for (const value of settings.recentFolders) {
      if (typeof value === 'string' && value.length > 0) {
        entries.push(value);
      }
    }
  }
  if (typeof settings?.lastFolder === 'string' && settings.lastFolder.length > 0) {
    entries.unshift(settings.lastFolder);
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    deduped.push(entry);
    if (deduped.length >= MAX_RECENT_FOLDERS) {
      break;
    }
  }
  return deduped;
}

function registerViewerIpcHandlers({ settingsStore, imageService, watchFolder }) {
  const { readSettings, updateSettings } = settingsStore;

  async function rememberRecentFolder(folderPath) {
    const settings = await readSettings();
    const currentRecent = normalizeRecentFolders(settings);
    const nextRecent = [folderPath, ...currentRecent.filter((entry) => entry !== folderPath)].slice(0, MAX_RECENT_FOLDERS);
    await updateSettings({
      lastFolder: folderPath,
      recentFolders: nextRecent,
    });
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
    await rememberRecentFolder(folderPath);
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

  ipcMain.handle('viewer:openFolder', async (event, folderPath) => {
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      return null;
    }
    const exists = await imageService.isDirectory(folderPath);
    if (!exists) {
      return null;
    }
    await rememberRecentFolder(folderPath);
    watchFolder(event.sender, folderPath);
    return imageService.buildFolderPayload(folderPath);
  });

  ipcMain.handle('viewer:getRecentFolders', async () => {
    const settings = await readSettings();
    return normalizeRecentFolders(settings);
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

  ipcMain.handle('viewer:getOutputDestinations', async () => {
    const settings = await readSettings();
    const raw = settings.outputDestinations;
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    const destinations = {};
    if (typeof raw.output1 === 'string' && raw.output1.length > 0) {
      destinations.output1 = raw.output1;
    }
    if (typeof raw.output2 === 'string' && raw.output2.length > 0) {
      destinations.output2 = raw.output2;
    }
    return destinations;
  });

  ipcMain.handle('viewer:setOutputDestination', async (_event, outputKey, folderPath) => {
    if ((outputKey !== 'output1' && outputKey !== 'output2') || typeof folderPath !== 'string' || folderPath.length === 0) {
      return null;
    }
    const settings = await readSettings();
    const previous = settings.outputDestinations && typeof settings.outputDestinations === 'object'
      ? settings.outputDestinations
      : {};
    const nextOutputDestinations = {
      ...previous,
      [outputKey]: folderPath,
    };
    await updateSettings({ outputDestinations: nextOutputDestinations });
    return nextOutputDestinations;
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
