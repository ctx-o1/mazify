const elementIds = [
  "themeBtn",
  "imageCard",
  "dropzone",
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
  "adjustments",
  "regenBtn",
  "copyBtn",
  "copyStatus",
  "downloadBtn",
  "mazeCanvas",
  "wash",
  "busyVeil",
];

export function getControls() {
  return Object.fromEntries(
    elementIds.map((id) => [id, document.getElementById(id)]),
  );
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

export function setBusy(controls, isBusy) {
  controls.busyVeil.classList.toggle("show", isBusy);
}

export function setControlsEnabled(controls, enabled) {
  controls.regenBtn.disabled = !enabled;
  controls.copyBtn.disabled = !enabled;
  controls.downloadBtn.disabled = !enabled;
}

let copyFeedbackTimer;
export function showCopyFeedback(controls, label, announcement) {
  clearTimeout(copyFeedbackTimer);
  controls.copyBtn.textContent = label;
  controls.copyStatus.textContent = announcement;
  copyFeedbackTimer = setTimeout(() => {
    controls.copyBtn.textContent = "Copy";
    controls.copyStatus.textContent = "";
  }, 1800);
}

export function playDevelopAnimation(controls) {
  controls.mazeCanvas.classList.remove("developed");
  void controls.mazeCanvas.offsetWidth;
  controls.mazeCanvas.classList.add("developed");

  controls.wash.classList.remove("run");
  void controls.wash.offsetWidth;
  controls.wash.classList.add("run");
}

export function bindControls(
  controls,
  {
    onFile,
    onRebuild,
    onRecarve,
    onDraw,
    onCopy,
    onDownload,
    onThemeChange,
  },
) {
  let rebuildTimer;
  let dragDepth = 0;

  const scheduleRebuild = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(onRebuild, 160);
  };

  const openFilePicker = () => controls.fileInput.click();
  controls.dropzone.addEventListener("click", openFilePicker);
  controls.replaceBtn.addEventListener("click", openFilePicker);
  controls.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  });

  controls.imageCard.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    controls.imageCard.classList.add("drag");
  });
  controls.imageCard.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  controls.imageCard.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) controls.imageCard.classList.remove("drag");
  });
  controls.imageCard.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    controls.imageCard.classList.remove("drag");
    const [file] = event.dataTransfer?.files || [];
    if (file) onFile(file);
  });
  controls.fileInput.addEventListener("change", () => {
    const [file] = controls.fileInput.files || [];
    if (file) onFile(file);
    controls.fileInput.value = "";
  });

  controls.colsRange.addEventListener("input", () => {
    controls.colsVal.textContent = controls.colsRange.value;
    scheduleRebuild();
  });
  controls.resRange.addEventListener("input", () => {
    controls.resVal.textContent = controls.resRange.value;
    scheduleRebuild();
  });
  controls.contrastRange.addEventListener("input", () => {
    controls.contrastVal.textContent = Number.parseFloat(
      controls.contrastRange.value,
    ).toFixed(1);
    scheduleRebuild();
  });
  controls.invertToggle.addEventListener("change", onRebuild);
  controls.solutionToggle.addEventListener("change", onDraw);
  controls.structureToggle.addEventListener("change", onDraw);
  controls.colorToggle.addEventListener("change", onDraw);
  controls.regenBtn.addEventListener("click", onRecarve);
  controls.copyBtn.addEventListener("click", onCopy);
  controls.downloadBtn.addEventListener("click", onDownload);
  controls.themeBtn.addEventListener("click", onThemeChange);

  document.addEventListener("pointerdown", (event) => {
    if (
      controls.adjustments.open &&
      !controls.adjustments.contains(event.target)
    ) {
      controls.adjustments.open = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") controls.adjustments.open = false;
  });
}
