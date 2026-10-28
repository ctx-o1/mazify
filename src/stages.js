import {
  MAZE_INSET,
  cssVar,
  drawMaze,
  fitCanvas,
  mazeLineWidth,
  strokeMazeEdges,
} from "./maze.js";

import { stageWipeAnimation } from "./animations/stage-wipe.js";
import { createTimeline, ease } from "./animations/timing.js";

export const STAGES = ["photo", "tones", "graph", "maze"];
const SIDE_BY_SIDE = [25, 50, 75];
const FOCUS_BOUNDS = {
  photo: [100, 100, 100],
  tones: [0, 100, 100],
  graph: [0, 0, 100],
  maze: [0, 0, 0],
};
const TAIL_LENGTH = 64;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function strokeEdges(ctx, nodes, edges, cellSize, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const [a, b] of edges) {
    ctx.moveTo(nodes[a].x * cellSize, nodes[a].y * cellSize);
    ctx.lineTo(nodes[b].x * cellSize, nodes[b].y * cellSize);
  }
  ctx.stroke();
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function matchOverlay(overlay, canvas) {
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.style.width = canvas.style.width;
  overlay.style.height = canvas.style.height;
  return overlay.getContext("2d");
}

// ============================================================
// plates — every stage shares the maze's geometry so the strips line up
// ============================================================
function drawPhoto(canvas, source, maze) {
  const { ctx, width, height } = fitCanvas(canvas, maze, MAZE_INSET);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
}

function drawTones(canvas, maze) {
  const { ctx, cellSize } = fitCanvas(canvas, maze, MAZE_INSET);
  const span = Math.max(1, maze.maxRes - maze.minRes);
  const gap = cellSize > 6 ? 1.5 : cellSize > 3 ? 1 : 0;
  ctx.fillStyle = cssVar("--ink");
  for (let r = 0; r < maze.rows; r++) {
    for (let c = 0; c < maze.cols; c++) {
      const level = (maze.graph.cellRes[r][c] - maze.minRes) / span;
      ctx.globalAlpha = 0.07 + 0.9 * level;
      ctx.fillRect(
        c * cellSize + gap / 2,
        r * cellSize + gap / 2,
        cellSize - gap,
        cellSize - gap,
      );
    }
  }
  ctx.globalAlpha = 1;
}

function drawGraph(canvas, maze) {
  const { ctx, cellSize } = fitCanvas(canvas, maze, MAZE_INSET);
  strokeEdges(
    ctx,
    maze.graph.nodes,
    maze.graph.allEdges,
    cellSize,
    cssVar("--blue"),
    0.7,
  );
}

// Replays the depth-first walk on top of a faint copy of the graph, with a
// vermilion comet on the overlay marking where the walk is right now.
async function carve(canvas, overlay, maze, view, token, duration, tween) {
  const { ctx, cellSize, dpr } = fitCanvas(canvas, maze, MAZE_INSET);
  const octx = matchOverlay(overlay, canvas);
  const lineWidth = view.lineWidth?.(maze, cellSize) ?? mazeLineWidth(maze, cellSize);
  const nodes = maze.graph.nodes;
  const edges = maze.treeEdges;
  const total = edges.length;
  const signal = cssVar("--signal");

  strokeEdges(ctx, nodes, maze.graph.allEdges, cellSize, cssVar("--underlay"), 0.7);

  let drawn = 0;
  const finished = await tween(
    duration,
    (progress) => {
      const next = Math.round(total * ease(progress));
      if (next > drawn) {
        strokeMazeEdges(
          ctx,
          maze,
          edges.slice(drawn, next),
          cellSize,
          view.useColors,
          lineWidth,
        );
        drawn = next;
      }

      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (progress >= 1 || !drawn) return;

      octx.setTransform(dpr, 0, 0, dpr, MAZE_INSET * dpr, MAZE_INSET * dpr);
      const tail = edges.slice(Math.max(0, drawn - TAIL_LENGTH), drawn);
      strokeEdges(octx, nodes, tail, cellSize, signal, lineWidth + 1.2);
      const head = nodes[edges[drawn - 1][1]];
      octx.fillStyle = signal;
      octx.beginPath();
      octx.arc(head.x * cellSize, head.y * cellSize, lineWidth * 2 + 3, 0, Math.PI * 2);
      octx.fill();
    },
    token,
  );

  if (finished) clearCanvas(overlay);
  return finished;
}

async function traceSolution(canvas, overlay, maze, view, token, tween) {
  drawMaze(canvas, maze, { ...view, showSolution: false });
  const octx = matchOverlay(overlay, canvas);
  const dpr = canvas.width / parseFloat(canvas.style.width);
  const cellSize = (parseFloat(canvas.style.width) - MAZE_INSET * 2) / maze.cols;
  const lineWidth = mazeLineWidth(maze, cellSize) + 1;
  const edges = maze.solutionEdges;
  const signal = cssVar("--ember");

  octx.setTransform(dpr, 0, 0, dpr, MAZE_INSET * dpr, MAZE_INSET * dpr);
  let drawn = 0;
  const finished = await tween(
    Math.min(1800, Math.max(700, edges.length * 2)),
    (progress) => {
      const next = Math.round(edges.length * ease(progress));
      if (next <= drawn) return;
      strokeEdges(
        octx,
        maze.graph.nodes,
        edges.slice(Math.max(0, drawn - 1), next),
        cellSize,
        signal,
        lineWidth,
      );
      drawn = next;
    },
    token,
  );

  if (finished) {
    clearCanvas(overlay);
    drawMaze(canvas, maze, view);
  }
  return finished;
}

// ============================================================
// the band: four stacked layers clipped into strips by three dividers
// ============================================================
function createBand(band, handles, onFocusChange) {
  let bounds = [100, 100, 100];

  function write(next, { instant = false } = {}) {
    bounds = next.slice();
    band.classList.toggle("is-instant", instant);
    bounds.forEach((value, i) => {
      band.style.setProperty(`--b${i + 1}`, `${value}%`);
      handles[i].setAttribute("aria-valuenow", Math.round(value));
    });
    if (instant) {
      void band.offsetWidth;
      band.classList.remove("is-instant");
    }
  }

  function setFocus(name) {
    band.dataset.focus = name;
    onFocusChange(name);
  }

  function focus(name, options) {
    if (name === "all") write(SIDE_BY_SIDE, options);
    else write(FOCUS_BOUNDS[name], options);
    setFocus(name);
  }

  function moveHandle(index, value) {
    const min = index === 0 ? 0 : bounds[index - 1];
    const max = index === 2 ? 100 : bounds[index + 1];
    const next = bounds.slice();
    next[index] = Math.min(max, Math.max(min, value));
    write(next, { instant: true });
    if (band.dataset.focus !== "all") setFocus("all");
  }

  handles.forEach((handle, index) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      band.classList.add("is-dragging");
      const move = (moveEvent) => {
        const rect = band.getBoundingClientRect();
        moveHandle(index, ((moveEvent.clientX - rect.left) / rect.width) * 100);
      };
      const stop = () => {
        band.classList.remove("is-dragging");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    });
    handle.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 10 : 2;
      if (event.key === "ArrowLeft") moveHandle(index, bounds[index] - step);
      else if (event.key === "ArrowRight") moveHandle(index, bounds[index] + step);
      else return;
      event.preventDefault();
    });
  });

  return {
    focus,
    write,
    get focused() {
      return band.dataset.focus;
    },
  };
}

// ============================================================
// renderer
// ============================================================
export function createRenderer({
  canvases,
  overlay,
  band,
  handles,
  morphTag,
  onFocusChange,
  animation = stageWipeAnimation,
}) {
  const { nextRun, tween, wait } = createTimeline();
  const strip = createBand(band, handles, onFocusChange);
  let displayedState;
  let displayedView;

  const drawStatic = {
    photo: (state) => drawPhoto(canvases.photo, state.source, state.maze),
    tones: (state) => drawTones(canvases.tones, state.maze),
    graph: (state) => drawGraph(canvases.graph, state.maze),
    maze: (state, view) => drawMaze(canvases.maze, state.maze, view),
  };

  function drawAll(state, view) {
    displayedState = state;
    displayedView = view;
    for (const name of STAGES) drawStatic[name](state, view);
  }

  function renderStatic(state, view) {
    nextRun();
    band.classList.remove("is-morphing");
    band.dataset.animation = "idle";
    if (!state.maze) return;
    clearCanvas(overlay);
    drawAll(state, view);
  }

  async function finishMaze(state, view, token, duration) {
    const finished = await carve(canvases.maze, overlay, state.maze, view, token, duration, tween);
    if (!finished) return false;
    drawStatic.maze(state, { ...view, showSolution: false });
    if (view.showSolution) {
      return traceSolution(canvases.maze, overlay, state.maze, view, token, tween);
    }
    return true;
  }

  async function intro(state, view) {
    if (!state.maze) return;
    if (reducedMotion.matches) {
      renderStatic(state, view);
      strip.focus("maze", { instant: true });
      band.dataset.animation = "finished";
      return;
    }

    const token = nextRun();
    band.classList.remove("is-morphing");
    band.dataset.animation = "running";
    clearCanvas(overlay);
    drawAll(state, view);
    clearCanvas(canvases.maze);
    strip.focus("photo", { instant: true });

    const finished = await animation.play({
      state,
      canvases,
      band,
      strip,
      token,
      tween,
      wait: (duration) => wait(duration, token),
      onPhase: (name) => {
        morphTag.textContent = name[0].toUpperCase() + name.slice(1);
        onFocusChange(name);
      },
      finishMaze: () => finishMaze(
        state,
        view,
        token,
        Math.min(3400, Math.max(2000, state.maze.treeEdges.length / 3)),
      ),
    });
    if (!finished) return;
    strip.focus("maze", { instant: true });
    band.dataset.animation = "finished";
  }

  // Settings changed: redraw the early stages and carve again in place.
  async function update(state, view) {
    if (!state.maze) return;
    const token = nextRun();
    band.classList.remove("is-morphing");
    clearCanvas(overlay);
    drawAll(state, view);
    if (reducedMotion.matches) return;
    await finishMaze(state, view, token, 1500);
  }

  async function recarve(state, view) {
    if (!state.maze) return;
    if (strip.focused === "photo" || strip.focused === "tones" || strip.focused === "graph") {
      strip.focus("maze");
    }
    await update(state, view);
  }

  async function revealSolution(state, view) {
    if (!state.maze) return;
    const token = nextRun();
    displayedView = view;
    band.classList.remove("is-morphing");
    clearCanvas(overlay);
    if (reducedMotion.matches || !view.showSolution) {
      drawStatic.maze(state, view);
      return;
    }
    await traceSolution(canvases.maze, overlay, state.maze, view, token, tween);
  }

  return {
    intro,
    update,
    recarve,
    renderStatic,
    revealSolution,
    focus: (name) => {
      if (displayedState) renderStatic(displayedState, displayedView);
      strip.focus(name);
    },
    get focused() {
      return strip.focused;
    },
  };
}
