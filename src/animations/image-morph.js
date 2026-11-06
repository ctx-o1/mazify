import {
  MAZE_INSET,
  cssVar,
  fitCanvas,
} from "../maze.js";
import { clamp01, ease } from "./timing.js";

const STAGGER = 0.45;

function parseHex(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
}

// Progress for one element in a staggered wave: `delay` 0 starts first,
// 1 starts last, and every element takes the same share of the timeline.
function staggered(progress, delay) {
  return ease(clamp01((progress - delay * STAGGER) / (1 - STAGGER)));
}

function clearFrame(ctx, width, height) {
  ctx.clearRect(-MAZE_INSET, -MAZE_INSET, width + MAZE_INSET * 2, height + MAZE_INSET * 2);
}

// Photo -> tones -> points -> links, all on one full-frame canvas.
// `onPhase` names the stage each part arrives at.
async function morph(canvas, source, maze, token, onPhase, tween, wait) {
  const { ctx, width, height, cellSize } = fitCanvas(canvas, maze, MAZE_INSET);
  const { cols, rows, graph } = maze;
  const nodes = graph.nodes;
  const ink = parseHex(cssVar("--ink"));
  const sheet = parseHex(cssVar("--sheet"));
  const blue = cssVar("--blue");
  const span = Math.max(1, maze.maxRes - maze.minRes);
  const gap = cellSize > 6 ? 1.5 : cellSize > 3 ? 1 : 0;
  const cellDelay = (r, c) => (r / rows + c / cols) / 2;

  // 1. The photo pixelates down to the tone grid.
  onPhase("photo");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  const mosaic = document.createElement("canvas");
  const mctx = mosaic.getContext("2d", { willReadFrequently: true });
  const startCols = Math.max(cols, Math.round(width / 2));
  if (!(await wait(250))) return false;
  let ok = await tween(
    1200,
    (progress) => {
      const n = Math.max(
        cols,
        Math.round(startCols * Math.pow(cols / startCols, ease(progress))),
      );
      const m = Math.max(1, Math.round((n * rows) / cols));
      mosaic.width = n;
      mosaic.height = m;
      mctx.fillStyle = "#fff";
      mctx.fillRect(0, 0, n, m);
      mctx.drawImage(source, 0, 0, n, m);
      clearFrame(ctx, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mosaic, 0, 0, n, m, 0, 0, width, height);
    },
    token,
  );
  if (!ok) return false;

  // 2. Each square drains from its photo colour to its tone.
  onPhase("tones");
  const pixels = mctx.getImageData(0, 0, cols, rows).data;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const level = (graph.cellRes[r][c] - maze.minRes) / span;
      const alpha = 0.07 + 0.9 * level;
      cells.push({
        r,
        c,
        delay: cellDelay(r, c),
        from: [pixels[i], pixels[i + 1], pixels[i + 2]],
        to: sheet.map((s, k) => s * (1 - alpha) + ink[k] * alpha),
      });
    }
  }

  ok = await tween(
    1000,
    (progress) => {
      clearFrame(ctx, width, height);
      for (const cell of cells) {
        const t = staggered(progress, cell.delay);
        const [r, g, b] = cell.from.map((v, k) => Math.round(v + (cell.to[k] - v) * t));
        const inset = gap * t;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(
          cell.c * cellSize + inset / 2,
          cell.r * cellSize + inset / 2,
          cellSize - inset,
          cellSize - inset,
        );
      }
    },
    token,
  );
  if (!ok || !(await wait(220))) return false;

  // 3. Squares collapse while their points burst out from the centre.
  onPhase("graph");
  const dot = Math.min(2.4, Math.max(1, (cellSize / maze.maxRes) * 0.32));
  const points = nodes.map((node) => {
    const c = Math.min(cols - 1, Math.floor(node.x));
    const r = Math.min(rows - 1, Math.floor(node.y));
    return { node, cx: c + 0.5, cy: r + 0.5, delay: cellDelay(r, c) };
  });

  const drawPoints = (progress, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = blue;
    for (const point of points) {
      const t = staggered(progress, point.delay);
      if (t <= 0) continue;
      const x = (point.cx + (point.node.x - point.cx) * t) * cellSize;
      const y = (point.cy + (point.node.y - point.cy) * t) * cellSize;
      ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
  };

  ok = await tween(
    1100,
    (progress) => {
      clearFrame(ctx, width, height);
      for (const cell of cells) {
        const t = staggered(progress, cell.delay);
        const size = (cellSize - gap) * (1 - t);
        if (size < 0.3) continue;
        ctx.fillStyle = `rgb(${cell.to.map(Math.round).join(", ")})`;
        ctx.fillRect(
          (cell.c + 0.5) * cellSize - size / 2,
          (cell.r + 0.5) * cellSize - size / 2,
          size,
          size,
        );
      }
      drawPoints(progress);
    },
    token,
  );
  if (!ok) return false;

  // 4. Links grow out from their midpoints until the graph is whole.
  const links = graph.allEdges.map(([a, b]) => {
    const mx = (nodes[a].x + nodes[b].x) / 2;
    const my = (nodes[a].y + nodes[b].y) / 2;
    return {
      a: nodes[a],
      b: nodes[b],
      mx,
      my,
      delay: (my / rows + mx / cols) / 2,
    };
  });

  ok = await tween(
    1000,
    (progress) => {
      clearFrame(ctx, width, height);
      drawPoints(1, 1 - ease(progress));
      ctx.strokeStyle = blue;
      ctx.lineWidth = 0.7;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const link of links) {
        const t = staggered(progress, link.delay);
        if (t <= 0) continue;
        ctx.moveTo(
          (link.mx + (link.a.x - link.mx) * t) * cellSize,
          (link.my + (link.a.y - link.my) * t) * cellSize,
        );
        ctx.lineTo(
          (link.mx + (link.b.x - link.mx) * t) * cellSize,
          (link.my + (link.b.y - link.my) * t) * cellSize,
        );
      }
      ctx.stroke();
    },
    token,
  );
  return ok;
}

// Turns a photo colour into an ink that still reads on paper: hue is kept,
// saturation is pushed up, and lightness is squeezed into a dark band so
// light regions stay legible. Quantised so strokes can be batched by colour.
function inkColor(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }

  const h = Math.round(hue / 10) * 10;
  const s = Math.round(Math.min(1, saturation * 1.3) * 10) * 10;
  const l = Math.round((0.17 + 0.28 * lightness) * 40) * 2.5;
  return `hsl(${h} ${s}% ${l}%)`;
}

export const imageMorphAnimation = {
  name: "morph",
  colorForPixel: inkColor,

  lineWidth(maze, cellSize, max = 3.4) {
    const corridor = cellSize / Math.max(1, maze.maxRes);
    return Math.min(max, Math.max(1, corridor * 0.6));
  },

  async play({
    state,
    canvases,
    band,
    strip,
    token,
    onPhase,
    tween,
    wait,
    finishMaze,
  }) {
    band.classList.add("is-morphing");
    const morphed = await morph(
      canvases.morph,
      state.source,
      state.maze,
      token,
      onPhase,
      tween,
      wait,
    );
    if (!morphed) return false;

    strip.focus("maze", { instant: true });
    band.classList.remove("is-morphing");
    if (!(await finishMaze())) return false;
    return wait(500);
  },
};
