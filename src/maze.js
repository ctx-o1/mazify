function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ============================================================
// resolution mapping
// ============================================================
function resFor(brightness, minRes, maxRes, invert) {
  const t = invert ? brightness : 1 - brightness; // t=1 -> dense
  const r = Math.round(minRes + t * (maxRes - minRes));
  return Math.max(1, r);
}

// ============================================================
// graph construction
// ============================================================
function buildGraph(brightness, cols, rows, opts) {
  const { minRes, maxRes, invert, contrast } = opts;
  const cellRes = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const adjustedBrightness = Math.min(
        1,
        Math.max(0, 0.5 + (brightness[r][c] - 0.5) * contrast),
      );
      row.push(
        resFor(adjustedBrightness, minRes, maxRes, invert),
      );
    }
    cellRes.push(row);
  }

  const nodes = [];
  const cellNodeIndex = [];
  for (let r = 0; r < rows; r++) {
    const rowArr = [];
    for (let c = 0; c < cols; c++) {
      const res = cellRes[r][c];
      const grid = [];
      for (let j = 0; j < res; j++) {
        const gridRow = [];
        for (let i = 0; i < res; i++) {
          const x = c + (i + 0.5) / res;
          const y = r + (j + 0.5) / res;
          const id = nodes.length;
          nodes.push({ x, y });
          gridRow.push(id);
        }
        grid.push(gridRow);
      }
      rowArr.push(grid);
    }
    cellNodeIndex.push(rowArr);
  }

  const n = nodes.length;
  const edgeSeen = new Set();
  const adjacency = new Array(n);
  for (let i = 0; i < n; i++) adjacency[i] = [];
  const allEdges = [];

  function addEdge(a, b) {
    if (a === b) return;
    const key = a < b ? a * n + b : b * n + a;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    adjacency[a].push(b);
    adjacency[b].push(a);
    allEdges.push([a, b]);
  }

  function connectBoundaries(boundaryA, boundaryB) {
    for (let i = 0; i < boundaryA.length; i++) {
      const ratio = (i + 0.5) / boundaryA.length;
      const target = Math.min(
        boundaryB.length - 1,
        Math.floor(ratio * boundaryB.length),
      );
      addEdge(boundaryA[i], boundaryB[target]);
    }

    for (let i = 0; i < boundaryB.length; i++) {
      const ratio = (i + 0.5) / boundaryB.length;
      const target = Math.min(
        boundaryA.length - 1,
        Math.floor(ratio * boundaryA.length),
      );
      addEdge(boundaryA[target], boundaryB[i]);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const grid = cellNodeIndex[r][c];
      const res = grid.length;
      for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
          const id = grid[j][i];
          if (i + 1 < res) addEdge(id, grid[j][i + 1]);
          if (j + 1 < res) addEdge(id, grid[j + 1][i]);
        }
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const gridA = cellNodeIndex[r][c];
      const gridB = cellNodeIndex[r][c + 1];
      const rightEdge = gridA.map((row) => row[row.length - 1]);
      const leftEdge = gridB.map((row) => row[0]);
      connectBoundaries(rightEdge, leftEdge);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const gridA = cellNodeIndex[r][c];
      const gridB = cellNodeIndex[r + 1][c];
      const bottomEdge = gridA[gridA.length - 1];
      const topEdge = gridB[0];
      connectBoundaries(bottomEdge, topEdge);
    }
  }

  const lastCellRes = cellNodeIndex[rows - 1][cols - 1].length;
  const entranceId = cellNodeIndex[0][0][0][0];
  const exitId =
    cellNodeIndex[rows - 1][cols - 1][lastCellRes - 1][lastCellRes - 1];

  return {
    nodes,
    adjacency,
    allEdges,
    cellRes,
    cellNodeIndex,
    cols,
    rows,
    entranceId,
    exitId,
  };
}

function carveMaze(graph, startId, rng) {
  const n = graph.nodes.length;
  const visited = new Uint8Array(n);
  const parent = new Int32Array(n).fill(-1);
  const treeEdges = [];
  const shuffledAdj = new Array(n);
  const ptr = new Int32Array(n);

  function getShuffled(id) {
    if (!shuffledAdj[id])
      shuffledAdj[id] = shuffleInPlace(
        graph.adjacency[id].slice(),
        rng,
      );
    return shuffledAdj[id];
  }

  visited[startId] = 1;
  const stack = [startId];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const arr = getShuffled(cur);
    let advanced = false;
    while (ptr[cur] < arr.length) {
      const next = arr[ptr[cur]++];
      if (!visited[next]) {
        visited[next] = 1;
        parent[next] = cur;
        treeEdges.push([cur, next]);
        stack.push(next);
        advanced = true;
        break;
      }
    }
    if (!advanced) stack.pop();
  }
  return { treeEdges, parent };
}

// ============================================================
// solution from DFS parent links
// ============================================================
function solvePath(parent, startId, endId) {
  const edges = [];
  let cur = endId;
  while (cur !== startId) {
    const previous = parent[cur];
    if (previous < 0) return [];
    edges.push([previous, cur]);
    cur = previous;
  }
  edges.reverse();
  return edges;
}

function carveAndSolve(graph, seed) {
  const { treeEdges, parent } = carveMaze(
    graph,
    graph.entranceId,
    mulberry32(seed),
  );
  const solutionEdges = solvePath(
    parent,
    graph.entranceId,
    graph.exitId,
  );
  return { treeEdges, solutionEdges };
}

// ============================================================
// source -> brightness grid
// ============================================================
function sampleSource(source, cols, rows, colorForPixel) {
  const tmp = document.createElement("canvas");
  tmp.width = cols;
  tmp.height = rows;
  const tctx = tmp.getContext("2d");
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.fillStyle = "#fff";
  tctx.fillRect(0, 0, cols, rows);
  tctx.drawImage(source, 0, 0, cols, rows);
  const data = tctx.getImageData(0, 0, cols, rows).data;
  const brightness = [];
  const colors = [];
  for (let r = 0; r < rows; r++) {
    const brightnessRow = [];
    const colorRow = [];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      const red = data[idx];
      const green = data[idx + 1];
      const blue = data[idx + 2];
      const lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
      brightnessRow.push(lum);

      if (colorForPixel) {
        colorRow.push(colorForPixel(red, green, blue));
        continue;
      }

      const targetLum = Math.min(150, Math.max(46, lum * 190));
      const scale = targetLum / Math.max(1, lum * 255);
      const qr = Math.min(
        255,
        Math.round(Math.min(255, red * scale) / 16) * 16,
      );
      const qg = Math.min(
        255,
        Math.round(Math.min(255, green * scale) / 16) * 16,
      );
      const qb = Math.min(
        255,
        Math.round(Math.min(255, blue * scale) / 16) * 16,
      );
      colorRow.push(`rgb(${qr}, ${qg}, ${qb})`);
    }
    brightness.push(brightnessRow);
    colors.push(colorRow);
  }
  return { brightness, colors };
}

export function randomSeed() {
  return (Math.random() * 1e9) >>> 0;
}

function sourceAspectRatio(source) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  return width && height ? height / width : 1;
}

export function createMaze(source, options, seed = randomSeed()) {
  const cols = options.cols;
  const rows = Math.max(
    6,
    Math.min(72, Math.round(cols * sourceAspectRatio(source))),
  );
  const sampled = sampleSource(source, cols, rows, options.colorForPixel);
  const graph = buildGraph(sampled.brightness, cols, rows, options);
  if (options.entry) graph.entranceId = nearestNode(graph, options.entry);
  if (options.exit) graph.exitId = nearestNode(graph, options.exit);
  const { treeEdges, solutionEdges } = carveAndSolve(graph, seed);

  return {
    graph,
    colors: sampled.colors,
    treeEdges,
    solutionEdges,
    cols,
    rows,
    minRes: options.minRes,
    maxRes: options.maxRes,
    seed,
  };
}

// Entry and exit positions are fractions of the source image.
function nearestNode(graph, point) {
  const x = point.x * graph.cols;
  const y = point.y * graph.rows;
  let best = 0;
  let bestDistance = Infinity;
  graph.nodes.forEach((node, id) => {
    const distance = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  });
  return best;
}

export function recarveMaze(maze, seed = randomSeed()) {
  const { treeEdges, solutionEdges } = carveAndSolve(maze.graph, seed);

  return { ...maze, treeEdges, solutionEdges, seed };
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function sourceColorForEdge(maze, a, b) {
  const na = maze.graph.nodes[a];
  const nb = maze.graph.nodes[b];
  const col = Math.max(
    0,
    Math.min(maze.cols - 1, Math.floor((na.x + nb.x) / 2)),
  );
  const row = Math.max(
    0,
    Math.min(maze.rows - 1, Math.floor((na.y + nb.y) / 2)),
  );
  return maze.colors[row][col];
}

export function strokeMazeEdges(
  ctx,
  maze,
  edges,
  cellSize,
  useColors,
  lineWidth,
) {
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (!useColors) {
    ctx.strokeStyle = cssVar("--line");
    ctx.beginPath();
    for (const [a, b] of edges) {
      const na = maze.graph.nodes[a];
      const nb = maze.graph.nodes[b];
      ctx.moveTo(na.x * cellSize, na.y * cellSize);
      ctx.lineTo(nb.x * cellSize, nb.y * cellSize);
    }
    ctx.stroke();
    return;
  }

  const groups = new Map();
  for (const edge of edges) {
    const color = sourceColorForEdge(maze, edge[0], edge[1]);
    if (!groups.has(color)) groups.set(color, []);
    groups.get(color).push(edge);
  }

  for (const [color, colorEdges] of groups) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const [a, b] of colorEdges) {
      const na = maze.graph.nodes[a];
      const nb = maze.graph.nodes[b];
      ctx.moveTo(na.x * cellSize, na.y * cellSize);
      ctx.lineTo(nb.x * cellSize, nb.y * cellSize);
    }
    ctx.stroke();
  }
}

export function drawStructure(ctx, maze, cellSize, lineWidth) {
  ctx.strokeStyle = cssVar("--grid-faint");
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const [a, b] of maze.graph.allEdges) {
    const na = maze.graph.nodes[a];
    const nb = maze.graph.nodes[b];
    ctx.moveTo(na.x * cellSize, na.y * cellSize);
    ctx.lineTo(nb.x * cellSize, nb.y * cellSize);
  }
  ctx.stroke();
}

function drawSolution(ctx, maze, cellSize, lineWidth) {
  if (!maze.solutionEdges?.length) return;

  ctx.strokeStyle = cssVar("--ember");
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const [a, b] of maze.solutionEdges) {
    const na = maze.graph.nodes[a];
    const nb = maze.graph.nodes[b];
    ctx.moveTo(na.x * cellSize, na.y * cellSize);
    ctx.lineTo(nb.x * cellSize, nb.y * cellSize);
  }
  ctx.stroke();
}

export function drawPortal(ctx, node, cellSize, isEntrance, scale = 1) {
  const x = node.x * cellSize;
  const y = node.y * cellSize;
  const color = isEntrance ? cssVar("--line") : cssVar("--ember");

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.4 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.arc(x, y, 6.5 * scale, 0, Math.PI * 2);
  ctx.stroke();
}

function paintMaze(
  ctx,
  maze,
  view,
  mazeWidth,
  {
    structureWidth = 1,
    mazeLineWidth = 1.5,
    solutionWidth = 2.4,
    showPortals = true,
    portalScale = 1,
  } = {},
) {
  const cellSize = mazeWidth / maze.cols;

  if (view.showStructure) {
    drawStructure(ctx, maze, cellSize, structureWidth);
  }

  strokeMazeEdges(
    ctx,
    maze,
    maze.treeEdges,
    cellSize,
    view.useColors,
    mazeLineWidth,
  );

  if (view.showSolution) {
    drawSolution(ctx, maze, cellSize, solutionWidth);
  }

  if (showPortals) {
    drawPortal(
      ctx,
      maze.graph.nodes[maze.graph.entranceId],
      cellSize,
      true,
      portalScale,
    );
    drawPortal(
      ctx,
      maze.graph.nodes[maze.graph.exitId],
      cellSize,
      false,
      portalScale,
    );
  }
}

export const MAZE_INSET = 20;

export function mazeLineWidth(maze, cellSize) {
  const corridor = cellSize / Math.max(1, maze.maxRes);
  return Math.min(2.4, Math.max(0.9, corridor * 0.42));
}

// Sizes a canvas to fit its holder at the maze's aspect ratio and returns a
// context already scaled for the device and translated past the inset.
export function fitCanvas(canvas, maze, inset = 0) {
  const holder = canvas.parentElement;
  const holderWidth = holder.clientWidth || 600;
  const holderHeight = holder.clientHeight || 440;
  const availableWidth = Math.max(1, holderWidth - inset * 2);
  const availableHeight = Math.max(1, holderHeight - inset * 2);
  const mazeAspect = maze.rows / maze.cols;

  let width = availableWidth;
  let height = Math.round(width * mazeAspect);
  if (height > availableHeight) {
    height = availableHeight;
    width = Math.round(height / mazeAspect);
  }

  const cssWidth = width + inset * 2;
  const cssHeight = height + inset * 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.translate(inset, inset);

  return { ctx, width, height, cellSize: width / maze.cols, dpr, inset };
}

export function drawMaze(canvas, maze, view) {
  const { ctx, width, cellSize } = fitCanvas(canvas, maze, MAZE_INSET);
  const lineWidth = view.lineWidth?.(maze, cellSize) ?? mazeLineWidth(maze, cellSize);
  paintMaze(ctx, maze, view, width, {
    mazeLineWidth: lineWidth,
    solutionWidth: lineWidth + 1,
  });
}

export function createMazeExport(maze, view) {
  const inset = 90;
  const mazeWidth = 1800;
  const mazeHeight = Math.round((mazeWidth * maze.rows) / maze.cols);
  const canvas = document.createElement("canvas");
  canvas.width = mazeWidth + inset * 2;
  canvas.height = mazeHeight + inset * 2;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = cssVar("--plate");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(inset, inset);
  const lineWidth = view.lineWidth?.(maze, mazeWidth / maze.cols, 12);
  paintMaze(ctx, maze, view, mazeWidth, {
    structureWidth: 1.2,
    mazeLineWidth: lineWidth ?? 3.2,
    solutionWidth: lineWidth === undefined ? 4 : lineWidth + 2,
    showPortals: false,
  });
  ctx.restore();

  return canvas;
}

export function createPresetImage() {
  const preset = document.createElement("canvas");
  preset.width = 960;
  preset.height = 760;
  const ctx = preset.getContext("2d");

  const sky = ctx.createLinearGradient(
    0,
    0,
    preset.width,
    preset.height,
  );
  sky.addColorStop(0, "#d8c7ac");
  sky.addColorStop(0.5, "#9eb2b4");
  sky.addColorStop(1, "#365f68");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, preset.width, preset.height);

  const sun = ctx.createRadialGradient(705, 185, 12, 705, 185, 190);
  sun.addColorStop(0, "#f4d287");
  sun.addColorStop(0.45, "#d98a63");
  sun.addColorStop(1, "rgba(190, 87, 72, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(480, 0, 480, 430);

  ctx.fillStyle = "#243f43";
  ctx.beginPath();
  ctx.moveTo(0, 610);
  ctx.bezierCurveTo(160, 465, 265, 545, 385, 395);
  ctx.bezierCurveTo(515, 255, 650, 535, 960, 345);
  ctx.lineTo(960, 760);
  ctx.lineTo(0, 760);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#a65d46";
  ctx.beginPath();
  ctx.moveTo(0, 670);
  ctx.bezierCurveTo(230, 505, 360, 735, 585, 530);
  ctx.bezierCurveTo(720, 410, 850, 535, 960, 500);
  ctx.lineTo(960, 760);
  ctx.lineTo(0, 760);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e0b66b";
  ctx.beginPath();
  ctx.moveTo(0, 725);
  ctx.bezierCurveTo(210, 635, 360, 760, 570, 655);
  ctx.bezierCurveTo(740, 565, 875, 680, 960, 625);
  ctx.lineTo(960, 760);
  ctx.lineTo(0, 760);
  ctx.closePath();
  ctx.fill();

  return preset;
}
