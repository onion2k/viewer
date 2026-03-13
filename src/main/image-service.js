const fsp = require('node:fs/promises');
const path = require('node:path');
const exifr = require('exifr');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const WORKFLOW_FOLDER_KEYS = ['inbox', 'selected', 'rejects', 'hold'];

function isSupportedImage(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension);
}

function isHiddenFile(filePath) {
  return path.basename(filePath).startsWith('.');
}

function inferMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.png') {
    return 'image/png';
  }
  return 'application/octet-stream';
}

async function isDirectory(dirPath) {
  try {
    const stats = await fsp.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function buildFolderPayload(folderPath) {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true });

  const imageEntries = entries
    .filter((entry) => entry.isFile() && !isHiddenFile(entry.name) && isSupportedImage(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: path.join(folderPath, entry.name),
    }));

  const images = await Promise.all(
    imageEntries.map(async (entry) => {
      let createdAtMs = 0;

      try {
        const stats = await fsp.stat(entry.path);
        if (Number.isFinite(stats.birthtimeMs) && stats.birthtimeMs > 0) {
          createdAtMs = stats.birthtimeMs;
        } else if (Number.isFinite(stats.ctimeMs) && stats.ctimeMs > 0) {
          createdAtMs = stats.ctimeMs;
        } else if (Number.isFinite(stats.mtimeMs) && stats.mtimeMs > 0) {
          createdAtMs = stats.mtimeMs;
        }
      } catch {
        createdAtMs = 0;
      }

      return {
        ...entry,
        createdAtMs,
      };
    }),
  );

  return {
    folderName: path.basename(folderPath) || 'selected folder',
    folderPath: path.normalize(folderPath),
    images,
  };
}

async function readImageDataUrl(imagePath) {
  if (typeof imagePath !== 'string' || !isSupportedImage(imagePath)) {
    throw new Error('Unsupported image format');
  }

  const bytes = await fsp.readFile(imagePath);
  const mimeType = inferMimeType(imagePath);
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function deleteImageFile(imagePath) {
  if (typeof imagePath !== 'string' || !isSupportedImage(imagePath)) {
    throw new Error('Unsupported image format');
  }

  const normalizedPath = path.normalize(imagePath);

  let stats;
  try {
    stats = await fsp.stat(normalizedPath);
  } catch {
    throw new Error('Image file does not exist');
  }

  if (!stats.isFile()) {
    throw new Error('Path is not a file');
  }

  await fsp.unlink(normalizedPath);
  return normalizedPath;
}

async function resolveCopyDestination(destinationFolder, fileName) {
  const parsed = path.parse(fileName);
  let candidateName = fileName;
  let candidatePath = path.join(destinationFolder, candidateName);
  let suffix = 1;

  while (true) {
    try {
      await fsp.access(candidatePath);
      candidateName = `${parsed.name} (${suffix})${parsed.ext}`;
      candidatePath = path.join(destinationFolder, candidateName);
      suffix += 1;
    } catch {
      return {
        fileName: candidateName,
        fullPath: candidatePath,
      };
    }
  }
}

async function resolveMoveDestination(destinationFolder, fileName) {
  return resolveCopyDestination(destinationFolder, fileName);
}

async function copyImageFile(imagePath, destinationFolder) {
  if (typeof imagePath !== 'string' || !isSupportedImage(imagePath)) {
    throw new Error('Unsupported image format');
  }

  const sourcePath = path.normalize(imagePath);
  const sourceStats = await fsp.stat(sourcePath).catch(() => null);
  if (!sourceStats || !sourceStats.isFile()) {
    throw new Error('Image file does not exist');
  }

  const destination = await resolveCopyDestination(destinationFolder, path.basename(sourcePath));
  await fsp.copyFile(sourcePath, destination.fullPath);

  return {
    destinationFolder,
    copiedAs: destination.fileName,
  };
}

async function moveImageToFolder(imagePath, destinationFolder) {
  if (typeof imagePath !== 'string' || !isSupportedImage(imagePath)) {
    throw new Error('Unsupported image format');
  }
  if (typeof destinationFolder !== 'string' || destinationFolder.length === 0) {
    throw new Error('Destination folder is required');
  }

  const sourcePath = path.normalize(imagePath);
  const sourceStats = await fsp.stat(sourcePath).catch(() => null);
  if (!sourceStats || !sourceStats.isFile()) {
    throw new Error('Image file does not exist');
  }

  const destinationStats = await fsp.stat(destinationFolder).catch(() => null);
  if (!destinationStats || !destinationStats.isDirectory()) {
    throw new Error('Destination folder does not exist');
  }

  const destination = await resolveMoveDestination(destinationFolder, path.basename(sourcePath));
  try {
    await fsp.rename(sourcePath, destination.fullPath);
  } catch (error) {
    if (!error || error.code !== 'EXDEV') {
      throw error;
    }
    // Cross-device move (different volume/filesystem) requires copy + delete.
    await fsp.copyFile(sourcePath, destination.fullPath);
    await fsp.unlink(sourcePath);
  }

  return {
    sourcePath,
    destinationPath: destination.fullPath,
    destinationFolder,
    fileName: destination.fileName,
  };
}

async function countImagesInFolder(folderPath) {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (isHiddenFile(entry.name)) {
      continue;
    }
    if (isSupportedImage(entry.name)) {
      count += 1;
    }
  }
  return count;
}

async function listWorkflowFolders(rootPath) {
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new Error('Root folder is required');
  }

  const normalizedRoot = path.normalize(rootPath);
  const rootStats = await fsp.stat(normalizedRoot).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    throw new Error('Root folder does not exist');
  }

  const entries = await fsp.readdir(normalizedRoot, { withFileTypes: true });
  const directoryEntries = entries.filter((entry) => entry.isDirectory());
  const directoriesByLowerName = new Map(
    directoryEntries.map((entry) => [entry.name.toLowerCase(), path.join(normalizedRoot, entry.name)]),
  );

  const explicitInboxPath = directoriesByLowerName.get('inbox');
  const sourceFolderPath = explicitInboxPath || normalizedRoot;
  const sourceCount = await countImagesInFolder(sourceFolderPath);
  const folders = [];
  for (const key of WORKFLOW_FOLDER_KEYS) {
    const folderPath =
      key === 'inbox'
        ? sourceFolderPath
        : directoriesByLowerName.get(key) || path.join(normalizedRoot, key);
    const exists = await isDirectory(folderPath);
    const count = exists ? await countImagesInFolder(folderPath) : 0;
    folders.push({
      key,
      name: key === 'inbox' && !explicitInboxPath ? 'inbox (root)' : path.basename(folderPath),
      path: folderPath,
      count,
      exists,
    });
  }

  return {
    rootPath: normalizedRoot,
    sourceFolderPath,
    sourceCount,
    folders,
  };
}

async function bulkMoveImages(imagePaths, destinationFolder) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    return {
      moved: [],
      failed: [],
    };
  }

  const moved = [];
  const failed = [];
  for (const imagePath of imagePaths) {
    try {
      const result = await moveImageToFolder(imagePath, destinationFolder);
      moved.push(result);
    } catch (error) {
      failed.push({
        imagePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    moved,
    failed,
  };
}

function stringifyExifValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyExifValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

async function readExifData(imagePath) {
  if (typeof imagePath !== 'string' || !isSupportedImage(imagePath)) {
    throw new Error('Unsupported image format');
  }

  const normalizedPath = path.normalize(imagePath);
  let parsed;
  try {
    parsed = await exifr.parse(normalizedPath, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      icc: false,
    });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return [];
    }
    throw error;
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  return Object.entries(parsed)
    .filter(([key]) => key !== 'MakerNote')
    .map(([key, value]) => ({
      key,
      value: stringifyExifValue(value),
    }))
    .filter((entry) => entry.value.length > 0)
    .sort((left, right) => left.key.localeCompare(right.key));
}

module.exports = {
  isSupportedImage,
  isDirectory,
  buildFolderPayload,
  listWorkflowFolders,
  readImageDataUrl,
  readExifData,
  deleteImageFile,
  copyImageFile,
  moveImageToFolder,
  bulkMoveImages,
};
