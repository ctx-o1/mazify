import "./styles/base.css";
import "./styles/maze.css";
import "./styles/controls.css";

import {
  createMaze,
  createMazeExport,
  createPresetImage,
  drawMaze,
  randomSeed,
  recarveMaze,
} from "./maze.js";
import {
  bindControls,
  getControls,
  playDevelopAnimation,
  readMazeOptions,
  readViewOptions,
  setBusy,
  setControlsEnabled,
  showCopyFeedback,
} from "./controls.js";
import { renderMazeEdge } from "./edge.js";

const controls = getControls();
const state = {
  source: createPresetImage(),
  fileLabel: "preset",
  maze: null,
  seed: randomSeed(),
};

const THEME_KEY = "laberinto-theme";
const THEME_NAMES = {
  oxide: "Oxide Archive",
  charcoal: "Charcoal Contact Sheet",
};
const BUILD_DELAY_MS = 20;
const EDGE_RESIZE_DELAY_MS = 120;

let buildTimer;
let edgeResizeTimer;

function rebuildEdge() {
  renderMazeEdge(controls.mazeCardClip, controls.imageCard);
}

function draw() {
  if (!state.maze) return;
  drawMaze(controls.mazeCanvas, state.maze, readViewOptions(controls));
}

function savedTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === "charcoal" ? theme : "oxide";
  } catch {
    return "oxide";
  }
}

function applyTheme(theme) {
  const nextTheme = theme === "oxide" ? "charcoal" : "oxide";
  document.documentElement.dataset.theme = theme;
  controls.themeBtn.setAttribute(
    "aria-label",
    `Switch to ${THEME_NAMES[nextTheme]} theme`,
  );
  controls.themeBtn.title = `Switch to ${THEME_NAMES[nextTheme]}`;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The selected theme still applies when storage is unavailable.
  }
  draw();
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme || "oxide";
  applyTheme(currentTheme === "oxide" ? "charcoal" : "oxide");
}

function finishBuild(maze) {
  state.maze = maze;
  state.seed = maze.seed;
  draw();
  setControlsEnabled(controls, true);
  setBusy(controls, false);
  playDevelopAnimation(controls);
}

function scheduleBuild(buildMaze) {
  clearTimeout(buildTimer);
  setBusy(controls, true);
  setControlsEnabled(controls, false);
  buildTimer = setTimeout(() => {
    buildTimer = undefined;
    try {
      finishBuild(buildMaze());
    } catch (error) {
      setControlsEnabled(controls, Boolean(state.maze));
      setBusy(controls, false);
      console.error("Maze generation failed.", error);
    }
  }, BUILD_DELAY_MS);
}

function rebuild({ newSeed = false } = {}) {
  const source = state.source;
  const options = readMazeOptions(controls);
  const seed = newSeed ? randomSeed() : state.seed;
  scheduleBuild(() => createMaze(source, options, seed));
}

function recarve() {
  if (!state.maze) {
    rebuild({ newSeed: true });
    return;
  }

  const maze = state.maze;
  scheduleBuild(() => recarveMaze(maze));
}

function loadImageFile(file) {
  if (!file.type.startsWith("image/")) return;

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.source = image;
    state.fileLabel = file.name;
    document.body.classList.add("has-image");
    URL.revokeObjectURL(url);
    rebuild({ newSeed: true });
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}

function download() {
  if (!state.maze) return;

  const canvas = createMazeExport(
    state.maze,
    readViewOptions(controls),
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
      readViewOptions(controls),
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
  onCopy: copy,
  onDownload: download,
  onThemeChange: toggleTheme,
});

controls.regenBtn.addEventListener("click", rebuildEdge);
window.addEventListener("resize", () => {
  draw();
  clearTimeout(edgeResizeTimer);
  edgeResizeTimer = setTimeout(rebuildEdge, EDGE_RESIZE_DELAY_MS);
});
applyTheme(savedTheme());
document.body.classList.add("has-image");
setControlsEnabled(controls, false);
rebuildEdge();
rebuild({ newSeed: true });
