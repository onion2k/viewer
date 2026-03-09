const fsp = require('node:fs/promises');
const path = require('node:path');
const exifr = require('exifr');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

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

  const parsed = await exifr.parse(imagePath, {
    tiff: true,
    exif: true,
    gps: true,
    iptc: true,
    xmp: true,
    icc: false,
  });

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
  readImageDataUrl,
  readExifData,
  deleteImageFile,
  copyImageFile,
};
