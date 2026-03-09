const fs = require('node:fs');

function createFolderWatcherManager({ buildFolderPayload }) {
  const folderWatchers = new Map();

  function stopFolderWatcher(webContentsId) {
    const existing = folderWatchers.get(webContentsId);
    if (!existing) {
      return;
    }

    if (existing.timer) {
      clearTimeout(existing.timer);
    }
    existing.watcher.close();
    folderWatchers.delete(webContentsId);
  }

  function watchFolder(webContents, folderPath) {
    const webContentsId = webContents.id;
    stopFolderWatcher(webContentsId);

    let timer = null;
    const watcher = fs.watch(folderPath, () => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(async () => {
        try {
          if (webContents.isDestroyed()) {
            stopFolderWatcher(webContentsId);
            return;
          }

          const payload = await buildFolderPayload(folderPath);
          webContents.send('viewer:folderUpdated', payload);
        } catch {
          // Ignore transient file system errors while files are being written.
        }
      }, 250);

      const watched = folderWatchers.get(webContentsId);
      if (watched) {
        watched.timer = timer;
      }
    });

    watcher.on('error', () => {
      stopFolderWatcher(webContentsId);
    });

    folderWatchers.set(webContentsId, {
      folderPath,
      watcher,
      timer: null,
    });
  }

  return {
    watchFolder,
    stopFolderWatcher,
  };
}

module.exports = {
  createFolderWatcherManager,
};
