const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const imageService = require('./image-service');
const { createFolderWatcherManager } = require('./folder-watchers');
const { registerViewerIpcHandlers } = require('./ipc-handlers');
const { createSettingsStore } = require('./settings-store');
const { createMainWindow } = require('./window');

const settingsStore = createSettingsStore(path.join(app.getPath('userData'), 'settings.json'));
const watcherManager = createFolderWatcherManager({
  buildFolderPayload: imageService.buildFolderPayload,
});

registerViewerIpcHandlers({
  settingsStore,
  imageService,
  watchFolder: watcherManager.watchFolder,
});

function openMainWindow() {
  return createMainWindow({
    onClosed: watcherManager.stopFolderWatcher,
    settingsStore,
  });
}

app.whenReady().then(async () => {
  await openMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void openMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
