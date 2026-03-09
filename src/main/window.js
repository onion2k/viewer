const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WINDOW_BOUNDS = {
  width: 1200,
  height: 800,
};

function toFiniteNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function sanitizeWindowBounds(rawBounds) {
  if (!rawBounds || typeof rawBounds !== 'object') {
    return {};
  }

  const width = toFiniteNumber(rawBounds.width);
  const height = toFiniteNumber(rawBounds.height);
  const x = toFiniteNumber(rawBounds.x);
  const y = toFiniteNumber(rawBounds.y);

  const bounds = {};
  if (width !== null && width >= 300) {
    bounds.width = width;
  }
  if (height !== null && height >= 200) {
    bounds.height = height;
  }
  if (x !== null) {
    bounds.x = x;
  }
  if (y !== null) {
    bounds.y = y;
  }

  return bounds;
}

function getPersistableBounds(window) {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function setupDevRendererReload(window) {
  if (!window || window.isDestroyed()) {
    return () => {};
  }

  const rendererDir = path.join(__dirname, '../renderer');
  let debounceTimer = null;

  const watcher = fs.watch(
    rendererDir,
    {
      recursive: true,
    },
    (_eventType, fileName) => {
      if (!fileName || fileName.startsWith('.')) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (!window.isDestroyed()) {
          window.webContents.reloadIgnoringCache();
        }
      }, 80);
    },
  );

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    watcher.close();
  };
}

async function createMainWindow({ onClosed, settingsStore }) {
  const settings = await settingsStore.readSettings();
  const restoredBounds = sanitizeWindowBounds(settings.windowBounds);

  const window = new BrowserWindow({
    ...DEFAULT_WINDOW_BOUNDS,
    ...restoredBounds,
    backgroundColor: '#2f2f2f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(__dirname, '../renderer/index.html'));

  let saveTimer = null;
  const persistBoundsSoon = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      const bounds = getPersistableBounds(window);
      settingsStore.updateSettings({ windowBounds: bounds }).catch(() => {});
    }, 150);
  };

  window.on('move', persistBoundsSoon);
  window.on('resize', persistBoundsSoon);
  window.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    const bounds = getPersistableBounds(window);
    settingsStore.updateSettings({ windowBounds: bounds }).catch(() => {});
  });

  const webContentsId = window.webContents.id;
  const disableDevReload = app.isPackaged ? () => {} : setupDevRendererReload(window);
  window.on('closed', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    disableDevReload();
    onClosed(webContentsId);
  });

  return window;
}

module.exports = {
  createMainWindow,
};
