// walls: every node owns a little square room; a wall stands on each
// shared border between rooms unless the maze carved a link through it
// ============================================================
export const edgeKey = (n, a, b) => (a < b ? a * n + b : b * n + a);

export function createWallGroups(maze) {
  const { graph, cols, rows, colors, treeEdges } = maze;
  const nodeCount = graph.nodes.length;
  const removedAt = new Map(
    treeEdges.map(([a, b], index) => [edgeKey(nodeCount, a, b), index]),
  );
  const groups = new Map();
  for (const segment of wallsOf(graph).segments) {
    const col = Math.max(0, Math.min(cols - 1, Math.floor((segment.x1 + segment.x2) / 2)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((segment.y1 + segment.y2) / 2)));
    const color = colors[row][col];
    if (!groups.has(color)) groups.set(color, []);
    groups.get(color).push({
      ...segment,
      removedAt: removedAt.get(segment.key) ?? Infinity,
    });
  }
  return groups;
}

export function strokeWallGroups(
  ctx,
  groups,
  cellSize,
  lineWidth,
  useColors,
  lineColor,
  openedCount = Infinity,
) {
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  for (const [color, segments] of groups) {
    ctx.strokeStyle = useColors ? color : lineColor;
    ctx.beginPath();
    for (const segment of segments) {
      if (segment.removedAt < openedCount) continue;
      ctx.moveTo(segment.x1 * cellSize, segment.y1 * cellSize);
      ctx.lineTo(segment.x2 * cellSize, segment.y2 * cellSize);
    }
    ctx.stroke();
  }
}

export function wallsOf(graph) {
  if (graph.walls) return graph.walls;
  const { cellNodeIndex, cols, rows, nodes, entranceId, exitId } = graph;
  const n = nodes.length;
  const segments = [];
  const byKey = new Map();

  const add = (x1, y1, x2, y2, a, b) => {
    const key = b < 0 ? -1 : edgeKey(n, a, b);
    const segment = { x1, y1, x2, y2, key };
    segments.push(segment);
    if (key >= 0) byKey.set(key, segment);
  };

  // Walk two rows of rooms of different sizes along a shared border and
  // add a wall for every stretch where they overlap.
  const stitch = (idsA, idsB, start, line, vertical) => {
    let i = 0;
    let j = 0;
    while (i < idsA.length && j < idsB.length) {
      const aHi = start + (i + 1) / idsA.length;
      const bHi = start + (j + 1) / idsB.length;
      const lo = Math.max(start + i / idsA.length, start + j / idsB.length);
      const hi = Math.min(aHi, bHi);
      if (hi - lo > 1e-9) {
        if (vertical) add(line, lo, line, hi, idsA[i], idsB[j]);
        else add(lo, line, hi, line, idsA[i], idsB[j]);
      }
      if (aHi < bHi - 1e-9) i++;
      else if (bHi < aHi - 1e-9) j++;
      else {
        i++;
        j++;
      }
    }
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const grid = cellNodeIndex[r][c];
      const k = grid.length;
      const size = 1 / k;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const id = grid[j][i];
          const x = c + i * size;
          const y = r + j * size;
          if (i + 1 < k) add(x + size, y, x + size, y + size, id, grid[j][i + 1]);
          if (j + 1 < k) add(x, y + size, x + size, y + size, id, grid[j + 1][i]);
          if (r === 0 && j === 0) add(x, 0, x + size, 0, id, -1);
          if (r === rows - 1 && j === k - 1) add(x, rows, x + size, rows, id, -1);
          if (c === 0 && i === 0 && id !== entranceId) add(0, y, 0, y + size, id, -1);
          if (c === cols - 1 && i === k - 1 && id !== exitId) {
            add(cols, y, cols, y + size, id, -1);
          }
        }
      }
      if (c + 1 < cols) {
        const right = cellNodeIndex[r][c + 1];
        stitch(
          grid.map((row) => row[row.length - 1]),
          right.map((row) => row[0]),
          r,
          c + 1,
          true,
        );
      }
      if (r + 1 < rows) {
        const below = cellNodeIndex[r + 1][c];
        stitch(grid[grid.length - 1], below[0], c, r + 1, false);
      }
    }
  }

  graph.walls = { segments, byKey };
  return graph.walls;
}
