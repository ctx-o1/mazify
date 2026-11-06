const elementIds = [
  "band",
  "sideBtn",
  "photoNote",
  "fileInput",
  "replaceBtn",
  "colsRange",
  "colsVal",
  "resRange",
  "resVal",
  "contrastRange",
  "contrastVal",
  "invertToggle",
  "solutionToggle",
  "structureToggle",
  "colorToggle",
  "regenBtn",
  "copyBtn",
  "copyStatus",
  "downloadBtn",
  "photoCanvas",
  "tonesCanvas",
  "graphCanvas",
  "mazeCanvas",
  "carveCanvas",
  "morphCanvas",
  "morphTag",
];

export function getControls() {
  return {
    ...Object.fromEntries(
      elementIds.map((id) => [id, document.getElementById(id)]),
    ),
    handles: Array.from(document.querySelectorAll(".handle")),
    stepButtons: Array.from(document.querySelectorAll("[data-show]")),
  };
}

export function showFocus(controls, name) {
  for (const button of controls.stepButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.show === name));
  }
  controls.sideBtn.setAttribute("aria-pressed", String(name === "all"));
}

export function readMazeOptions(controls) {
  return {
    cols: Number.parseInt(controls.colsRange.value, 10),
    maxRes: Number.parseInt(controls.resRange.value, 10),
    minRes: 1,
    contrast: Number.parseFloat(controls.contrastRange.value),
    invert: controls.invertToggle.checked,
  };
}

export function readViewOptions(controls) {
  return {
    showSolution: controls.solutionToggle.checked,
    showStructure: controls.structureToggle.checked,
    useColors: controls.colorToggle.checked,
  };
}

export function setControlsEnabled(controls, enabled) {
  controls.regenBtn.disabled = !enabled;
  controls.copyBtn.disabled = !enabled;
  controls.downloadBtn.disabled = !enabled;
}

export function showSource(controls, fileLabel) {
  controls.photoNote.textContent =
    fileLabel === "preset" || fileLabel === "base-image.jpg"
      ? "Example image"
      : fileLabel;
}

let copyFeedbackTimer;
export function showCopyFeedback(controls, label, announcement) {
  clearTimeout(copyFeedbackTimer);
  controls.copyBtn.textContent = label;
  controls.copyStatus.textContent = announcement;
  copyFeedbackTimer = setTimeout(() => {
    controls.copyBtn.textContent = "Copy image";
    controls.copyStatus.textContent = "";
  }, 1800);
}

export function bindControls(
  controls,
  {
    onFile,
    onRebuild,
    onRecarve,
    onDraw,
    onSolution,
    onFocus,
    onCopy,
    onDownload,
  },
) {
  let rebuildTimer;
  let dragDepth = 0;

  const scheduleRebuild = (from) => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => onRebuild(from), 180);
  };

  const openFilePicker = () => controls.fileInput.click();
  for (const button of controls.stepButtons) {
    button.addEventListener("click", () => onFocus(button.dataset.show));
  }
  controls.sideBtn.addEventListener("click", () => onFocus("all"));
  controls.replaceBtn.addEventListener("click", openFilePicker);

  const hasFiles = (event) =>
    Array.from(event.dataTransfer?.types || []).includes("Files");

  const resetDrag = () => {
    dragDepth = 0;
    document.body.classList.remove("dragging");
  };

  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    document.body.classList.add("dragging");
  }, true);
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    document.body.classList.add("dragging");
    event.dataTransfer.dropEffect = "copy";
  }, true);
  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) resetDrag();
  }, true);
  window.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!hasFiles(event) && files.length === 0) return;
    event.preventDefault();
    resetDrag();
    const file = files.find((candidate) => candidate.type.startsWith("image/"));
    if (file) onFile(file);
  }, true);
  window.addEventListener("dragend", resetDrag, true);
  window.addEventListener("blur", resetDrag);
  controls.fileInput.addEventListener("change", () => {
    const [file] = controls.fileInput.files || [];
    if (file) onFile(file);
    controls.fileInput.value = "";
  });

  controls.colsRange.addEventListener("input", () => {
    controls.colsVal.textContent = controls.colsRange.value;
    scheduleRebuild("tones");
  });
  controls.contrastRange.addEventListener("input", () => {
    controls.contrastVal.textContent = Number.parseFloat(
      controls.contrastRange.value,
    ).toFixed(1);
    scheduleRebuild("tones");
  });
  controls.resRange.addEventListener("input", () => {
    const value = controls.resRange.value;
    controls.resVal.textContent = `${value} × ${value}`;
    scheduleRebuild("graph");
  });
  controls.invertToggle.addEventListener("change", () => onRebuild("tones"));
  controls.solutionToggle.addEventListener("change", onSolution);
  controls.structureToggle.addEventListener("change", onDraw);
  controls.colorToggle.addEventListener("change", onDraw);
  controls.regenBtn.addEventListener("click", onRecarve);
  controls.copyBtn.addEventListener("click", onCopy);
  controls.downloadBtn.addEventListener("click", onDownload);
}
