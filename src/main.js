import "./styles/base.css";
import "./styles/maze.css";
import "./styles/controls.css";

import {
  createMaze,
  createMazeExport,
  createPresetImage,
  randomSeed,
  recarveMaze,
} from "./maze.js";
import {
  bindControls,
  getControls,
  readMazeOptions,
  readViewOptions,
  setControlsEnabled,
  showCopyFeedback,
  showFocus,
  showSource,
} from "./controls.js";
import { createRenderer } from "./stages.js";
import { stageWipeAnimation } from "./animations/stage-wipe.js";
import { imageMorphAnimation } from "./animations/image-morph.js";

const parameters = new URLSearchParams(window.location.search);
const animation = parameters.get("animation") === "wipe"
  ? stageWipeAnimation
  : imageMorphAnimation;
const isAnimationPreview = parameters.get("preview") === "1";
if (isAnimationPreview) await import("./styles/animation-preview.css");

function nextSeed() {
  return isAnimationPreview ? 271828182 : randomSeed();
}

const controls = getControls();
const app = document.querySelector(".app");
controls.band.dataset.variant = animation.name;
const state = {
  source: createPresetImage(),
  fileLabel: "preset",
  maze: null,
  seed: nextSeed(),
};

const renderer = createRenderer({
  canvases: {
    photo: controls.photoCanvas,
    tones: controls.tonesCanvas,
    graph: controls.graphCanvas,
    maze: controls.mazeCanvas,
    morph: controls.morphCanvas,
  },
  overlay: controls.carveCanvas,
  band: controls.band,
  handles: controls.handles,
  morphTag: controls.morphTag,
  animation,
  onFocusChange: (name) => showFocus(controls, name),
  onIntroEnd: () => app.classList.add("controls-ready"),
});

function viewOptions() {
  return { ...readViewOptions(controls), lineWidth: animation.lineWidth };
}

const BUILD_DELAY_MS = 20;

let buildTimer;
let resizeTimer;

function draw() {
  if (controls.band.dataset.animation === "running") {
    renderer.intro(state, viewOptions());
  } else {
    renderer.renderStatic(state, viewOptions());
  }
}

function finishBuild(maze, from) {
  state.maze = maze;
  state.seed = maze.seed;
  document.documentElement.style.setProperty(
    "--aspect",
    String(maze.cols / maze.rows),
  );
  showSource(controls, state.fileLabel);
  setControlsEnabled(controls, true);
  const view = viewOptions();
  if (from === "photo") {
    app.classList.remove("controls-ready");
    renderer.intro(state, view);
  }
  else if (from === "maze") renderer.recarve(state, view);
  else renderer.update(state, view);
}

function scheduleBuild(buildMaze, from) {
  clearTimeout(buildTimer);
  setControlsEnabled(controls, false);
  buildTimer = setTimeout(() => {
    buildTimer = undefined;
    try {
      finishBuild(buildMaze(), from);
    } catch (error) {
      setControlsEnabled(controls, Boolean(state.maze));
      console.error("Maze generation failed.", error);
    }
  }, BUILD_DELAY_MS);
}

function rebuild(from = "photo", { newSeed = false } = {}) {
  const source = state.source;
  const options = {
    ...readMazeOptions(controls),
    colorForPixel: animation.colorForPixel,
  };
  const seed = newSeed ? nextSeed() : state.seed;
  scheduleBuild(() => createMaze(source, options, seed), from);
}

function recarve() {
  if (!state.maze) {
    rebuild("photo", { newSeed: true });
    return;
  }

  const maze = state.maze;
  scheduleBuild(() => recarveMaze(maze), "maze");
}

function loadImageFile(file) {
  if (!file.type.startsWith("image/")) return;

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.source = image;
    state.fileLabel = file.name;
    URL.revokeObjectURL(url);
    rebuild("photo", { newSeed: true });
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}

function download() {
  if (!state.maze) return;

  const canvas = createMazeExport(
    state.maze,
    viewOptions(),
  );
  const safeLabel =
    state.fileLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 24) || "maze";
  const link = document.createElement("a");
  link.download = `mazeprint-${safeLabel}-${state.seed.toString(16)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create a PNG image."));
    }, "image/png");
  });
}

async function copy() {
  if (!state.maze) return;

  controls.copyBtn.disabled = true;
  try {
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      throw new Error("Image clipboard access is unavailable.");
    }

    const canvas = createMazeExport(
      state.maze,
      viewOptions(),
    );
    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    showCopyFeedback(controls, "Copied", "Maze copied to clipboard.");
  } catch {
    showCopyFeedback(
      controls,
      "Copy failed",
      "The maze could not be copied to the clipboard.",
    );
  } finally {
    controls.copyBtn.disabled = false;
  }
}

bindControls(controls, {
  onFile: loadImageFile,
  onRebuild: rebuild,
  onRecarve: recarve,
  onDraw: draw,
  onSolution: () =>
    renderer.revealSolution(state, viewOptions()),
  onFocus: (name) => renderer.focus(name),
  onCopy: copy,
  onDownload: download,
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 120);
});
setControlsEnabled(controls, false);
const sampleImage = new Image();
sampleImage.src = `${import.meta.env.BASE_URL}examples/birth-of-venus.jpg`;
try {
  await sampleImage.decode();
  if (state.fileLabel === "preset") {
    state.source = sampleImage;
    state.fileLabel = "The Birth of Venus · Sandro Botticelli";
  }
} catch (error) {
  console.error("Could not load the sample painting.", error);
}
rebuild("photo", { newSeed: true });
