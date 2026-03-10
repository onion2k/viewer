# Viewer (Electron)

This project is an Electron desktop app for browsing JPG/PNG images in a local folder.

# OSX Permission

After extracting the app to Applications run `xattr -dr com.apple.quarantine /Applications/Viewer.app` to allow permission for it to run or OSX will claim it's broken.

## Project structure

- `src/main/main.js`: Electron app bootstrap/lifecycle wiring
- `src/main/ipc-handlers.js`: IPC endpoint registration
- `src/main/image-service.js`: image file operations and payload building
- `src/main/settings-store.js`: persisted settings read/write/update
- `src/main/folder-watchers.js`: folder watch manager for live refresh
- `src/main/window.js`: BrowserWindow creation
- `src/preload/preload.js`: secure renderer API bridge (`window.electronAPI`)
- `src/renderer/index.html`: renderer markup
- `src/renderer/styles.css`: renderer styles
- `src/renderer/renderer.js`: renderer behavior/state

## Install

```bash
cd /Users/christopherneale/projects/viewer
npm install
```

## Run

```bash
npm start
```

## Build for sharing (macOS)

```bash
npm run dist
```

Build output is written to `dist/`:

- `.dmg` installer
- `.zip` app bundle

If you only want an unpacked app folder for quick local testing:

```bash
npm run pack
```

That output appears under `dist/mac*/`.

## Sharing notes

- These builds are unsigned by default.
- On another Mac, users may need to right-click the app and choose **Open** the first time.
- For frictionless distribution, add Apple code signing + notarization later.

## Notes

- Use **Select Folder** to choose a directory.
- The app remembers your last selected folder.
- Navigation works with on-screen arrows and keyboard left/right keys.
