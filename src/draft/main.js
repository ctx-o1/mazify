import "./draft.css";

import { createMaze, randomSeed, recarveMaze } from "../maze.js";
import { edgeKey, wallsOf } from "./walls.js";

// Public domain, served by Wikimedia Commons with CORS enabled so the
// canvas can read its pixels.
const PAINTING = {
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg/1920px-Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg",
  // Adam's fingertip and God's, as fractions of the picture: the maze runs
  // the long way between two hands that almost touch.
  entry: { x: 0.373, y: 0.469 },
  exit: { x: 0.385, y: 0.449 },
};

// Light areas get the dense corridors, so on a dark wall the maze glows
// where the painting is bright.
const MAZE_OPTIONS = { cols: 96, maxRes: 3, minRes: 1, contrast: 1.5, invert: true };
const SEEDS_TO_TRY = 10;
const INSET = 6;
const HOLD_MS = 1800;
const TAIL = 70;

// The transformation is one timeline:
// 0-1 pixelate, 1-2 drain to tones, 2-3 burst into points, 3-4 link up,
// 4-4.25 wall every room in, 4.25-5.75 carve, 5.75-6.25 settle.
const END = 6.25;
// [timeline position, milliseconds to get there from the previous one]
const PACE = [
  [0, 0],
  [1, 1500],
  [2, 1100],
  [3, 1100],
  [4, 1000],
  [4.25, 450],
  [5.75, 3400],
  [6.25, 900],
];

const hero = document.getElementById("hero");
const credit = document.getElementById("credit");
const chooseBtn = document.getElementById("chooseBtn");
const fileInput = document.getElementById("fileInput");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const ease = (t) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

let scene = null;
let geometry = null;
let t = 0;
let playing = null;
let holdTimer;

// ============================================================
// colour
// ============================================================
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
}

function toHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}

// Paint pigment lifted to glow on a dark wall: hue kept, saturation nudged
// up, and lightness following the paint so shadows dim and flesh glows.
// Quantised so strokes batch by colour.
function glowColor(r, g, b) {
  const [h, s, l] = toHsl(r, g, b);
  const hue = Math.round(h / 10) * 10;
  const sat = Math.round(Math.min(0.85, s * 1.15) * 10) * 10;
  const light = Math.round((0.16 + 0.74 * l) * 40) * 2.5;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

// ============================================================
// scene: everything the timeline needs, prepared once per maze
// ============================================================
function prepare(source, maze) {
  const { cols, rows, graph } = maze;
  const nodes = graph.nodes;
  const n = nodes.length;

  const sample = document.createElement("canvas");
  sample.width = cols;
  sample.height = rows;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(source, 0, 0, cols, rows);
  const pixels = sctx.getImageData(0, 0, cols, rows).data;

  const wall = hexRgb(token("--wall-deep"));
  const parchment = hexRgb(token("--parchment"));
  const span = Math.max(1, maze.maxRes - maze.minRes);
  const delayOf = (r, c) => (r / rows + c / cols) / 2;

  const cells = [];
  const glow = [];
  for (let r = 0; r < rows; r++) {
    const glowRow = [];
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const from = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const level = (graph.cellRes[r][c] - maze.minRes) / span;
      const alpha = 0.05 + 0.85 * level;
      const to = wall.map((w, k) => Math.round(w * (1 - alpha) + parchment[k] * alpha));
      cells.push({ r, c, delay: delayOf(r, c), from, to, toCss: `rgb(${to.join(", ")})` });
      glowRow.push(glowColor(...from));
    }
    glow.push(glowRow);
  }

  const points = nodes.map((node) => {
    const c = Math.min(cols - 1, Math.floor(node.x));
    const r = Math.min(rows - 1, Math.floor(node.y));
    return { node, cx: c + 0.5, cy: r + 0.5, delay: delayOf(r, c) };
  });

  const links = graph.allEdges.map(([a, b]) => {
    const mx = (nodes[a].x + nodes[b].x) / 2;
    const my = (nodes[a].y + nodes[b].y) / 2;
    return { a: nodes[a], b: nodes[b], mx, my, delay: (my / rows + mx / cols) / 2 };
  });

  // Each wall remembers the step of the walk that knocks it through.
  const knockStep = new Map();
  maze.treeEdges.forEach(([a, b], i) => knockStep.set(edgeKey(n, a, b), i));
  const groups = new Map();
  for (const segment of wallsOf(graph).segments) {
    const knock =
      segment.key >= 0 && knockStep.has(segment.key) ? knockStep.get(segment.key) : Infinity;
    const col = Math.max(0, Math.min(cols - 1, Math.floor((segment.x1 + segment.x2) / 2)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((segment.y1 + segment.y2) / 2)));
    const color = glow[row][col];
    if (!groups.has(color)) groups.set(color, []);
    groups.get(color).push({ ...segment, knock });
  }

  return {
    source,
    maze,
    cells,
    points,
    links,
    wallGroups: Array.from(groups, ([color, segments]) => ({ color, segments })),
    colors: {
      gold: token("--gold"),
      comet: token("--comet"),
      linkRgb: hexRgb(token("--gold")).join(", "),
    },
  };
}

// ============================================================
// painting one moment of the timeline
// ============================================================
function measure() {
  const { cols, rows } = scene.maze;
  const width = hero.clientWidth;
  const height = hero.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  hero.width = Math.round(width * dpr);
  hero.height = Math.round(height * dpr);

  const cellSize = Math.min((width - INSET * 2) / cols, (height - INSET * 2) / rows);
  geometry = {
    width,
    height,
    dpr,
    cellSize,
    ox: (width - cols * cellSize) / 2,
    oy: (height - rows * cellSize) / 2,
    lineWidth: Math.min(3.4, Math.max(1, (cellSize / scene.maze.maxRes) * 0.6)),
  };
}

function staggered(progress, delay) {
  return ease((progress - delay * 0.45) / 0.55);
}

function drawLinks(ctx, cs, alpha, grow = 1) {
  ctx.strokeStyle = `rgba(${scene.colors.linkRgb}, ${alpha})`;
  ctx.lineWidth = 0.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const link of scene.links) {
    const k = grow >= 1 ? 1 : staggered(grow, link.delay);
    if (k <= 0) continue;
    ctx.moveTo((link.mx + (link.a.x - link.mx) * k) * cs, (link.my + (link.a.y - link.my) * k) * cs);
    ctx.lineTo((link.mx + (link.b.x - link.mx) * k) * cs, (link.my + (link.b.y - link.my) * k) * cs);
  }
  ctx.stroke();
}

function drawPoints(ctx, cs, progress, alpha) {
  const dot = Math.min(2.4, Math.max(1, (cs / scene.maze.maxRes) * 0.3));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = scene.colors.gold;
  for (const point of scene.points) {
    const k = staggered(progress, point.delay);
    if (k <= 0) continue;
    const x = (point.cx + (point.node.x - point.cx) * k) * cs;
    const y = (point.cy + (point.node.y - point.cy) * k) * cs;
    ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
  }
  ctx.globalAlpha = 1;
}

function drawWallsUntil(ctx, cs, knocked, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = geometry.lineWidth;
  ctx.lineCap = "square";
  for (const group of scene.wallGroups) {
    ctx.strokeStyle = group.color;
    ctx.beginPath();
    for (const s of group.segments) {
      if (s.knock < knocked) continue;
      ctx.moveTo(s.x1 * cs, s.y1 * cs);
      ctx.lineTo(s.x2 * cs, s.y2 * cs);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawComet(ctx, cs, knocked) {
  const edges = scene.maze.treeEdges;
  const nodes = scene.maze.graph.nodes;
  if (!knocked || knocked >= edges.length) return;
  ctx.save();
  ctx.strokeStyle = scene.colors.comet;
  ctx.lineWidth = Math.max(1.5, geometry.lineWidth * 0.7);
  ctx.lineCap = "round";
  ctx.shadowColor = scene.colors.comet;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let i = Math.max(0, knocked - TAIL); i < knocked; i++) {
    const [a, b] = edges[i];
    ctx.moveTo(nodes[a].x * cs, nodes[a].y * cs);
    ctx.lineTo(nodes[b].x * cs, nodes[b].y * cs);
  }
  ctx.stroke();
  const head = nodes[edges[knocked - 1][1]];
  ctx.fillStyle = scene.colors.comet;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(head.x * cs, head.y * cs, geometry.lineWidth + 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnds(ctx, cs, alpha) {
  const nodes = scene.maze.graph.nodes;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = scene.colors.comet;
  ctx.shadowColor = scene.colors.comet;
  ctx.shadowBlur = 12;
  for (const id of [scene.maze.graph.entranceId, scene.maze.graph.exitId]) {
    const node = nodes[id];
    ctx.beginPath();
    ctx.arc(node.x * cs, node.y * cs, geometry.lineWidth + 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const mosaic = document.createElement("canvas");
const mosaicCtx = mosaic.getContext("2d");

function paint(ctx, g, at) {
  const { maze, source } = scene;
  const { cols, rows } = maze;
  const cs = g.cellSize;
  const width = cols * cs;
  const height = rows * cs;
  const gap = cs > 6 ? 1.5 : cs > 3 ? 1 : 0;

  ctx.save();
  ctx.translate(g.ox, g.oy);

  if (at < 1) {
    // The painting, then pixelating down to the grid.
    if (at <= 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, width, height);
    } else {
      const start = Math.max(cols, Math.round(width / 2));
      const across = Math.max(cols, Math.round(start * Math.pow(cols / start, ease(at))));
      const down = Math.max(1, Math.round((across * rows) / cols));
      mosaic.width = across;
      mosaic.height = down;
      mosaicCtx.drawImage(source, 0, 0, across, down);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mosaic, 0, 0, across, down, 0, 0, width, height);
    }
  } else if (at < 2) {
    // Each square drains from its paint colour to its tone.
    const p = at - 1;
    for (const cell of scene.cells) {
      const k = staggered(p, cell.delay);
      const [r, gr, b] = cell.from.map((v, i) => Math.round(v + (cell.to[i] - v) * k));
      const inset = gap * k;
      ctx.fillStyle = `rgb(${r}, ${gr}, ${b})`;
      ctx.fillRect(cell.c * cs + inset / 2, cell.r * cs + inset / 2, cs - inset, cs - inset);
    }
  } else if (at < 3) {
    // Squares collapse into the points they will hold.
    const p = at - 2;
    for (const cell of scene.cells) {
      const size = (cs - gap) * (1 - staggered(p, cell.delay));
      if (size < 0.3) continue;
      ctx.fillStyle = cell.toCss;
      ctx.fillRect((cell.c + 0.5) * cs - size / 2, (cell.r + 0.5) * cs - size / 2, size, size);
    }
    drawPoints(ctx, cs, p, 1);
  } else if (at < 4) {
    // Links grow between neighbouring points.
    const p = at - 3;
    drawPoints(ctx, cs, 1, 1 - ease(p));
    drawLinks(ctx, cs, 0.85, p);
  } else if (at < 4.25) {
    // Every room is walled in.
    drawLinks(ctx, cs, 0.85 - 0.4 * ease((at - 4) / 0.25));
    drawWallsUntil(ctx, cs, 0, ease((at - 4) / 0.25));
  } else if (at < 5.75) {
    // The walk knocks through one wall per step.
    const knocked = Math.round(maze.treeEdges.length * ease((at - 4.25) / 1.5));
    drawLinks(ctx, cs, 0.45);
    drawWallsUntil(ctx, cs, knocked);
    drawComet(ctx, cs, knocked);
  } else {
    // The scaffolding fades and the two ends light up.
    const p = clamp01((at - 5.75) / 0.5);
    if (p < 1) drawLinks(ctx, cs, 0.45 * (1 - ease(p)));
    drawWallsUntil(ctx, cs, Infinity);
    drawEnds(ctx, cs, ease(p));
  }

  ctx.restore();
}

function render() {
  if (!scene || !geometry) return;
  const ctx = hero.getContext("2d");
  ctx.setTransform(geometry.dpr, 0, 0, geometry.dpr, 0, 0);
  ctx.clearRect(0, 0, geometry.width, geometry.height);
  paint(ctx, geometry, t);
}

// ============================================================
// playback
// ============================================================

// Milliseconds the autoplay spends per unit of timeline around `at`.
function paceAt(at) {
  for (let i = 1; i < PACE.length; i++) {
    const [to, ms] = PACE[i];
    if (at < to) return ms / (to - PACE[i - 1][0]);
  }
  return 600;
}

function stop() {
  if (playing) cancelAnimationFrame(playing);
  playing = null;
  clearTimeout(holdTimer);
}

function play() {
  stop();
  if (reducedMotion.matches) {
    t = END;
    render();
    return;
  }
  let last = performance.now();
  const tick = (now) => {
    t = Math.min(END, t + (now - last) / paceAt(t));
    last = now;
    render();
    playing = t < END ? requestAnimationFrame(tick) : null;
  };
  playing = requestAnimationFrame(tick);
}

function replay() {
  stop();
  t = 0;
  render();
  holdTimer = setTimeout(play, reducedMotion.matches ? 0 : HOLD_MS);
}

hero.addEventListener("click", () => {
  if (!playing) replay();
});

// ============================================================
// pictures
// ============================================================

// Tries a few walks and keeps the one with the longest way through.
function bestMaze(source, ends) {
  const options = { ...MAZE_OPTIONS, ...ends };
  let best = createMaze(source, options, randomSeed());
  for (let i = 1; i < SEEDS_TO_TRY; i++) {
    const next = recarveMaze(best);
    if (next.solutionEdges.length > best.solutionEdges.length) best = next;
  }
  return best;
}

function hang(source, ends = {}) {
  stop();
  const aspect = (source.naturalWidth || source.width) / (source.naturalHeight || source.height);
  document.documentElement.style.setProperty("--aspect", String(aspect));
  requestAnimationFrame(() => {
    scene = prepare(source, bestMaze(source, ends));
    measure();
    replay();
  });
}

function loadPainting() {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => hang(image, { entry: PAINTING.entry, exit: PAINTING.exit });
  image.onerror = () => {
    credit.textContent = "The painting could not be loaded.";
  };
  image.src = PAINTING.url;
}

function loadFile(file) {
  if (!file?.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    credit.textContent = `${file.name}.`;
    hang(image);
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  loadFile(fileInput.files?.[0]);
  fileInput.value = "";
});

let dragDepth = 0;
document.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  document.body.classList.add("dragging");
});
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove("dragging");
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove("dragging");
  loadFile(event.dataTransfer?.files?.[0]);
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!scene) return;
    measure();
    render();
  }, 120);
});

loadPainting();
