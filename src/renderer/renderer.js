const selectFolderBtn = document.getElementById("selectFolderBtn");
const folderInput = document.getElementById("folderInput");
const statusText = document.getElementById("statusText");
const imageEl = document.getElementById("imageEl");
const leftPreviewEl = document.getElementById("leftPreviewEl");
const rightPreviewEl = document.getElementById("rightPreviewEl");
const filenameEl = document.getElementById("filenameEl");
const dataFilenameEl = document.getElementById("dataFilenameEl");
const imageTabBtn = document.getElementById("imageTabBtn");
const dataTabBtn = document.getElementById("dataTabBtn");
const imageTabPanel = document.getElementById("imageTabPanel");
const dataTabPanel = document.getElementById("dataTabPanel");
const actualSizeBtn = document.getElementById("actualSizeBtn");
const coverSizeBtn = document.getElementById("coverSizeBtn");
const fitSizeBtn = document.getElementById("fitSizeBtn");
const exifPanel = document.getElementById("exifPanel");
const exifBody = document.getElementById("exifBody");
const deleteBtn = document.getElementById("deleteBtn");
const moveBtn = document.getElementById("moveBtn");
const changeMoveFolderBtn = document.getElementById("changeMoveFolderBtn");
const firstBtn = document.getElementById("firstBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const lastBtn = document.getElementById("lastBtn");
const orderSelect = document.getElementById("orderSelect");

const electronApi = window.electronAPI;
const hasElectronBackend =
  !!electronApi &&
  typeof electronApi.pickFolder === "function" &&
  typeof electronApi.loadLastFolder === "function" &&
  typeof electronApi.readImage === "function" &&
  typeof electronApi.readExif === "function" &&
  typeof electronApi.deleteImage === "function" &&
  typeof electronApi.moveImage === "function" &&
  typeof electronApi.changeMoveTargetFolder === "function" &&
  typeof electronApi.onFolderUpdated === "function";

let imageItems = [];
let currentIndex = 0;
let currentObjectUrl = null;
let leftPreviewObjectUrl = null;
let rightPreviewObjectUrl = null;
let renderRequestId = 0;
let currentSortOrder = "created-desc";
let isDeleting = false;
let isMoving = false;
let activeTab = "image";
let imageSizeMode = "fit";
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

init().catch((error) => {
  console.error(error);
  setStatus("Initialization failed. Try reloading.");
});

async function init() {
  updateNavigation();
  selectFolderBtn.addEventListener("click", onSelectFolder);
  folderInput.addEventListener("change", onFolderInputChange);
  firstBtn.addEventListener("click", () => navigateToIndex(0));
  prevBtn.addEventListener("click", () => navigate(-1));
  nextBtn.addEventListener("click", () => navigate(1));
  lastBtn.addEventListener("click", () => navigateToIndex(imageItems.length - 1));
  deleteBtn.addEventListener("click", onDeleteImage);
  moveBtn.addEventListener("click", onMoveImage);
  changeMoveFolderBtn.addEventListener("click", onChangeMoveFolder);
  orderSelect.addEventListener("change", onSortOrderChange);
  imageTabBtn.addEventListener("click", () => setActiveTab("image"));
  dataTabBtn.addEventListener("click", () => setActiveTab("data"));
  actualSizeBtn.addEventListener("click", () => setImageSizeMode("actual"));
  coverSizeBtn.addEventListener("click", () => setImageSizeMode("cover"));
  fitSizeBtn.addEventListener("click", () => setImageSizeMode("fit"));
  updateImageSizeMode();
  updateTabState();

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigate(1);
    }
  });
  if (!hasElectronBackend) {
    setStatus("Select a folder to load JPG/PNG images.");
    return;
  }

  electronApi.onFolderUpdated((payload) => {
    applyFolderPayload(payload, { preserveCurrentImage: true, isRefresh: true });
  });

  setStatus("Checking saved folder...");
  const payload = await electronApi.loadLastFolder();
  if (!payload) {
    setStatus("No folder selected.");
    return;
  }

  await applyFolderPayload(payload);
}

async function onSelectFolder() {
  if (!hasElectronBackend) {
    folderInput.click();
    return;
  }

  try {
    const payload = await electronApi.pickFolder();
    if (!payload) {
      return;
    }
    await applyFolderPayload(payload);
  } catch (error) {
    console.error(error);
    setStatus("Unable to select folder.");
  }
}

async function applyFolderPayload(payload, options = {}) {
  const preserveCurrentImage = !!options.preserveCurrentImage;
  const isRefresh = !!options.isRefresh;
  const preferredIndex = Number.isInteger(options.preferredIndex) ? options.preferredIndex : null;
  const statusPrefix = typeof options.statusPrefix === "string" ? options.statusPrefix : "";
  const previousKey = preserveCurrentImage && imageItems[currentIndex] ? imageItems[currentIndex].key : null;

  imageItems = (payload.images || []).map((item) => ({
    key: item.path,
    name: item.name,
    path: item.path,
    createdAtMs: Number.isFinite(item.createdAtMs) ? item.createdAtMs : 0,
    mode: "electron",
  }));
  sortImageItems();

  if (previousKey) {
    const existingIndex = imageItems.findIndex((item) => item.key === previousKey);
    currentIndex = existingIndex >= 0 ? existingIndex : 0;
  } else if (preferredIndex !== null) {
    const maxIndex = Math.max(imageItems.length - 1, 0);
    currentIndex = Math.min(Math.max(preferredIndex, 0), maxIndex);
  } else {
    currentIndex = 0;
  }

  if (imageItems.length === 0) {
    clearImage();
    if (statusPrefix) {
      setStatus(statusPrefix + " No JPG or PNG files found in " + payload.folderName + ".");
    } else if (isRefresh) {
      setStatus("Folder updated. No JPG or PNG files found in " + payload.folderName + ".");
    } else {
      setStatus("No JPG or PNG files found in " + payload.folderName + ".");
    }
    return;
  }

  if (statusPrefix) {
    setStatus(statusPrefix + " Loaded " + imageItems.length + " image(s) from " + payload.folderName + ".");
  } else if (isRefresh) {
    setStatus("Folder updated. Loaded " + imageItems.length + " image(s) from " + payload.folderName + ".");
  } else {
    setStatus("Loaded " + imageItems.length + " image(s) from " + payload.folderName + ".");
  }
  await renderCurrentImage();
}

function onFolderInputChange(event) {
  const fileList = event.target.files;
  if (!fileList || fileList.length === 0) {
    return;
  }

  const files = Array.from(fileList).filter((file) => {
    if (file.name.startsWith(".")) {
      return false;
    }
    return isSupportedImage(file.name) || file.type === "image/jpeg" || file.type === "image/png";
  });

  imageItems = files
    .map((file, index) => ({
      key: file.webkitRelativePath || file.name + "-" + index,
      name: file.name,
      file,
      createdAtMs: Number.isFinite(file.lastModified) ? file.lastModified : 0,
      mode: "browser",
    }));

  sortImageItems();

  currentIndex = 0;

  const firstPath = fileList[0].webkitRelativePath || "";
  const folderName = firstPath.includes("/") ? firstPath.split("/")[0] : "selected folder";

  if (imageItems.length === 0) {
    clearImage();
    setStatus("No JPG or PNG files found in " + folderName + ".");
    folderInput.value = "";
    return;
  }

  setStatus("Loaded " + imageItems.length + " image(s) from " + folderName + ".");
  renderCurrentImage();
  folderInput.value = "";
}

function onSortOrderChange() {
  currentSortOrder = orderSelect.value;
  sortImageItems();
  currentIndex = 0;

  if (imageItems.length === 0) {
    clearImage();
    return;
  }

  renderCurrentImage();
}

async function onDeleteImage() {
  if (isDeleting || imageItems.length === 0) {
    return;
  }

  const item = imageItems[currentIndex];
  if (!item || item.mode !== "electron" || !hasElectronBackend) {
    setStatus("Delete is only available for folders opened by the desktop app.");
    return;
  }

  isDeleting = true;
  updateNavigation();

  const deletedName = trimFilenameForStatus(item.name);
  const nextIndex = currentIndex;

  try {
    const payload = await electronApi.deleteImage(item.path);
    await applyFolderPayload(payload, {
      preferredIndex: nextIndex,
      statusPrefix: "Deleted " + deletedName + ".",
    });
  } catch (error) {
    console.error(error);
    setStatus("Failed to delete " + deletedName + ".");
  } finally {
    isDeleting = false;
    updateNavigation();
  }
}

async function onMoveImage() {
  if (isMoving || imageItems.length === 0) {
    return;
  }

  const item = imageItems[currentIndex];
  if (!item || item.mode !== "electron" || !hasElectronBackend) {
    setStatus("Move is only available for folders opened by the desktop app.");
    return;
  }
  const displayName = trimFilenameForStatus(item.name);

  isMoving = true;
  updateNavigation();

  try {
    const result = await electronApi.moveImage(item.path);
    if (!result) {
      setStatus("Move canceled.");
      return;
    }

    setStatus("Copied " + displayName + " to " + result.destinationFolder + " as " + result.copiedAs + ".");
  } catch (error) {
    console.error(error);
    setStatus("Failed to copy " + displayName + ".");
  } finally {
    isMoving = false;
    updateNavigation();
  }
}

async function onChangeMoveFolder() {
  if (!hasElectronBackend || isMoving || isDeleting) {
    return;
  }

  try {
    const destinationFolder = await electronApi.changeMoveTargetFolder();
    if (!destinationFolder) {
      setStatus("Change move folder canceled.");
      return;
    }

    setStatus("Move destination set to " + destinationFolder + ".");
  } catch (error) {
    console.error(error);
    setStatus("Failed to change move folder.");
  }
}

function sortImageItems() {
  imageItems.sort((left, right) => {
    if (currentSortOrder === "created-desc") {
      const delta = (right.createdAtMs || 0) - (left.createdAtMs || 0);
      return delta !== 0 ? delta : nameCollator.compare(left.name, right.name);
    }

    if (currentSortOrder === "created-asc") {
      const delta = (left.createdAtMs || 0) - (right.createdAtMs || 0);
      return delta !== 0 ? delta : nameCollator.compare(left.name, right.name);
    }

    if (currentSortOrder === "name-desc") {
      return nameCollator.compare(right.name, left.name);
    }

    return nameCollator.compare(left.name, right.name);
  });
}

async function renderCurrentImage() {
  if (imageItems.length === 0) {
    clearImage();
    return;
  }

  const requestId = ++renderRequestId;
  const item = imageItems[currentIndex];
  const previousObjectUrl = currentObjectUrl;
  const previousLeftPreviewObjectUrl = leftPreviewObjectUrl;
  const previousRightPreviewObjectUrl = rightPreviewObjectUrl;
  let nextObjectUrl = null;
  let nextLeftPreviewObjectUrl = null;
  let nextRightPreviewObjectUrl = null;
  let exifEntries = [];
  let leftPreviewSrc = "";
  let rightPreviewSrc = "";
  const leftItem = imageItems[currentIndex - 1] || null;
  const rightItem = imageItems[currentIndex + 1] || null;

  try {
    let src = "";
    if (item.mode === "electron") {
      const requests = [
        electronApi.readImage(item.path),
        leftItem ? electronApi.readImage(leftItem.path) : Promise.resolve(""),
        rightItem ? electronApi.readImage(rightItem.path) : Promise.resolve(""),
        electronApi.readExif(item.path).catch((error) => {
          console.error(error);
          return [];
        }),
      ];
      const [currentSrc, leftSrc, rightSrc, exif] = await Promise.all(requests);
      src = currentSrc;
      leftPreviewSrc = leftSrc;
      rightPreviewSrc = rightSrc;
      exifEntries = exif;
    } else {
      nextObjectUrl = URL.createObjectURL(item.file);
      src = nextObjectUrl;

      if (leftItem && leftItem.file) {
        nextLeftPreviewObjectUrl = URL.createObjectURL(leftItem.file);
        leftPreviewSrc = nextLeftPreviewObjectUrl;
      }

      if (rightItem && rightItem.file) {
        nextRightPreviewObjectUrl = URL.createObjectURL(rightItem.file);
        rightPreviewSrc = nextRightPreviewObjectUrl;
      }
    }

    if (requestId !== renderRequestId) {
      revokeObjectUrls(nextObjectUrl, nextLeftPreviewObjectUrl, nextRightPreviewObjectUrl);
      return;
    }

    imageEl.src = src;
    imageEl.style.display = "block";
    filenameEl.textContent = item.name;
    filenameEl.style.display = "block";
    dataFilenameEl.textContent = item.name;
    dataFilenameEl.style.display = "block";
    renderPreviewImage(leftPreviewEl, leftPreviewSrc, leftItem ? leftItem.name : "");
    renderPreviewImage(rightPreviewEl, rightPreviewSrc, rightItem ? rightItem.name : "");
    renderExifEntries(exifEntries);
    currentObjectUrl = nextObjectUrl;
    leftPreviewObjectUrl = nextLeftPreviewObjectUrl;
    rightPreviewObjectUrl = nextRightPreviewObjectUrl;
    revokeObjectUrls(previousObjectUrl, previousLeftPreviewObjectUrl, previousRightPreviewObjectUrl);
    updateNavigation();
  } catch (error) {
    if (requestId !== renderRequestId) {
      revokeObjectUrls(nextObjectUrl, nextLeftPreviewObjectUrl, nextRightPreviewObjectUrl);
      return;
    }

    revokeObjectUrls(nextObjectUrl, nextLeftPreviewObjectUrl, nextRightPreviewObjectUrl);
    currentObjectUrl = null;
    leftPreviewObjectUrl = null;
    rightPreviewObjectUrl = null;
    imageEl.removeAttribute("src");
    imageEl.style.display = "none";
    filenameEl.textContent = item.name;
    filenameEl.style.display = "block";
    dataFilenameEl.textContent = item.name;
    dataFilenameEl.style.display = "block";
    renderPreviewImage(leftPreviewEl, "", "");
    renderPreviewImage(rightPreviewEl, "", "");
    renderExifEntries([]);
    revokeObjectUrls(previousObjectUrl, previousLeftPreviewObjectUrl, previousRightPreviewObjectUrl);
    updateNavigation();
    console.error(error);
    setStatus("Failed to read " + item.name + ".");
  }
}

function renderPreviewImage(element, src, name) {
  if (!src) {
    element.removeAttribute("src");
    element.removeAttribute("alt");
    element.dataset.hasImage = "0";
    syncPreviewVisibilityFor(element);
    return;
  }

  element.src = src;
  element.alt = name ? "Preview: " + name : "Preview image";
  element.dataset.hasImage = "1";
  syncPreviewVisibilityFor(element);
}

function navigate(direction) {
  if (imageItems.length === 0) {
    return;
  }
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= imageItems.length) {
    return;
  }
  currentIndex = nextIndex;
  renderCurrentImage();
}

function navigateToIndex(index) {
  if (imageItems.length === 0) {
    return;
  }

  const targetIndex = Math.min(Math.max(index, 0), imageItems.length - 1);
  if (targetIndex === currentIndex) {
    return;
  }

  currentIndex = targetIndex;
  renderCurrentImage();
}

function updateNavigation() {
  const hasImages = imageItems.length > 0;
  const currentItem = hasImages ? imageItems[currentIndex] : null;
  firstBtn.disabled = !hasImages || currentIndex === 0;
  prevBtn.disabled = !hasImages || currentIndex === 0;
  nextBtn.disabled = !hasImages || currentIndex === imageItems.length - 1;
  lastBtn.disabled = !hasImages || currentIndex === imageItems.length - 1;
  deleteBtn.disabled = isDeleting || isMoving || !currentItem || currentItem.mode !== "electron";
  moveBtn.disabled = isMoving || isDeleting || !currentItem || currentItem.mode !== "electron";
  changeMoveFolderBtn.disabled = !hasElectronBackend || isMoving || isDeleting;
}

function clearImage() {
  renderRequestId += 1;
  revokeObjectUrls(currentObjectUrl, leftPreviewObjectUrl, rightPreviewObjectUrl);
  currentObjectUrl = null;
  leftPreviewObjectUrl = null;
  rightPreviewObjectUrl = null;
  imageEl.removeAttribute("src");
  imageEl.style.display = "none";
  renderPreviewImage(leftPreviewEl, "", "");
  renderPreviewImage(rightPreviewEl, "", "");
  filenameEl.textContent = "";
  filenameEl.style.display = "none";
  dataFilenameEl.textContent = "";
  dataFilenameEl.style.display = "none";
  renderExifEntries([]);
  updateNavigation();
}

function setStatus(text) {
  statusText.textContent = text;
}

function isSupportedImage(name) {
  return /\.(jpe?g|png)$/i.test(name);
}

function trimFilenameForStatus(filename) {
  const maxLength = 30;
  if (typeof filename !== "string" || filename.length <= maxLength) {
    return filename;
  }

  const extensionIndex = filename.lastIndexOf(".");
  const hasExtension = extensionIndex > 0 && extensionIndex < filename.length - 1;
  const extension = hasExtension ? filename.slice(extensionIndex) : "";
  const availableForBase = Math.max(maxLength - extension.length - 1, 8);
  const baseName = hasExtension ? filename.slice(0, extensionIndex) : filename;
  return baseName.slice(0, availableForBase) + "…" + extension;
}

function renderExifEntries(entries) {
  exifBody.replaceChildren();

  if (!Array.isArray(entries) || entries.length === 0) {
    exifPanel.style.display = "none";
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("tr");
    const keyCell = document.createElement("th");
    keyCell.scope = "row";
    keyCell.textContent = entry.key;

    const valueCell = document.createElement("td");
    const parsedJson = tryParseJson(entry.value);
    if (parsedJson && (Array.isArray(parsedJson) || typeof parsedJson === "object")) {
      valueCell.appendChild(buildJsonTree(parsedJson));
    } else {
      valueCell.textContent = entry.value;
    }

    row.appendChild(keyCell);
    row.appendChild(valueCell);
    exifBody.appendChild(row);
  }

  exifPanel.style.display = "block";
}

function tryParseJson(text) {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function buildJsonTree(value) {
  const root = document.createElement("div");
  root.className = "json-tree";
  root.appendChild(createJsonTreeNode(value, "value", true));
  return root;
}

function createJsonTreeNode(value, label, expanded) {
  const item = document.createElement("div");
  item.className = "json-tree-item";

  const cascadedJson = typeof value === "string" ? tryParseJson(value) : null;
  if (cascadedJson && (Array.isArray(cascadedJson) || typeof cascadedJson === "object")) {
    return createJsonTreeNode(cascadedJson, label, expanded);
  }

  const isArray = Array.isArray(value);
  const isObject = value && typeof value === "object" && !isArray;
  if (!isArray && !isObject) {
    const leaf = document.createElement("span");
    leaf.className = "json-tree-leaf";
    leaf.textContent = label + ": " + formatJsonLeaf(value);
    item.appendChild(leaf);
    return item;
  }

  const details = document.createElement("details");
  if (expanded) {
    details.open = true;
  }

  const summary = document.createElement("summary");
  const count = isArray ? value.length : Object.keys(value).length;
  summary.textContent = label + " (" + count + ")";
  details.appendChild(summary);

  const children = document.createElement("div");
  children.className = "json-tree-children";
  if (isArray) {
    value.forEach((child, index) => {
      children.appendChild(createJsonTreeNode(child, "[" + index + "]", false));
    });
  } else {
    Object.entries(value).forEach(([key, child]) => {
      children.appendChild(createJsonTreeNode(child, key, false));
    });
  }

  details.appendChild(children);
  item.appendChild(details);
  return item;
}

function formatJsonLeaf(value) {
  if (typeof value === "string") {
    return '"' + value + '"';
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}

function setActiveTab(tab) {
  if (tab !== "image" && tab !== "data") {
    return;
  }

  activeTab = tab;
  updateTabState();
}

function setImageSizeMode(mode) {
  if (mode !== "actual" && mode !== "cover" && mode !== "fit") {
    return;
  }

  imageSizeMode = mode;
  updateImageSizeMode();
}

function updateImageSizeMode() {
  imageTabPanel.dataset.sizeMode = imageSizeMode;
  actualSizeBtn.setAttribute("aria-pressed", String(imageSizeMode === "actual"));
  coverSizeBtn.setAttribute("aria-pressed", String(imageSizeMode === "cover"));
  fitSizeBtn.setAttribute("aria-pressed", String(imageSizeMode === "fit"));
}

function updateTabState() {
  const isImageTab = activeTab === "image";
  imageTabBtn.setAttribute("aria-selected", String(isImageTab));
  dataTabBtn.setAttribute("aria-selected", String(!isImageTab));
  imageTabPanel.hidden = !isImageTab;
  dataTabPanel.hidden = isImageTab;
  actualSizeBtn.disabled = !isImageTab;
  coverSizeBtn.disabled = !isImageTab;
  fitSizeBtn.disabled = !isImageTab;
  syncPreviewVisibility();
}

function syncPreviewVisibility() {
  syncPreviewVisibilityFor(leftPreviewEl);
  syncPreviewVisibilityFor(rightPreviewEl);
}

function syncPreviewVisibilityFor(element) {
  const hasImage = element.dataset.hasImage === "1";
  element.style.display = hasImage && activeTab === "image" ? "block" : "none";
}

function revokeObjectUrls(...urls) {
  for (const url of urls) {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
