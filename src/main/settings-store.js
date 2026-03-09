const fsp = require('node:fs/promises');
const path = require('node:path');

function createSettingsStore(settingsFilePath) {
  async function readSettings() {
    try {
      const raw = await fsp.readFile(settingsFilePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function writeSettings(settings) {
    await fsp.mkdir(path.dirname(settingsFilePath), { recursive: true });
    await fsp.writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
  }

  async function updateSettings(patch) {
    const current = await readSettings();
    const next = {
      ...current,
      ...patch,
    };

    await writeSettings(next);
    return next;
  }

  return {
    readSettings,
    writeSettings,
    updateSettings,
  };
}

module.exports = {
  createSettingsStore,
};
