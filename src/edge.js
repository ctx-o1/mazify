const COLS = 48;
const FRAME = 3;
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function inBounds(x, y, cols, rows) {
  return x >= 0 && x < cols && y >= 0 && y < rows;
}

function inSafe(x, y, safe) {
  return x >= safe.x0 && x < safe.x1 && y >= safe.y0 && y < safe.y1;
}

function buildGrid(cols, rows) {
  const safe = {
    x0: FRAME,
    y0: FRAME,
    x1: cols - FRAME,
    y1: rows - FRAME,
  };
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(true));

  function carve(startX, startY, startDirection) {
    let x = startX;
    let y = startY;
    let direction = startDirection;
    const steps = 4 + Math.floor(Math.random() * (FRAME + 5));

    for (let index = 0; index < steps; index += 1) {
      if (!inBounds(x, y, cols, rows) || inSafe(x, y, safe)) break;
      grid[y][x] = false;

      if (Math.random() < 0.32) {
        direction = (direction + (Math.random() < 0.5 ? 1 : 3)) % 4;
      }

      const [dx, dy] = DIRECTIONS[direction];
      const nextX = x + dx;
      const nextY = y + dy;
      if (!inBounds(nextX, nextY, cols, rows) || inSafe(nextX, nextY, safe)) {
        break;
      }
      x = nextX;
      y = nextY;
    }
  }

  for (let x = 1; x < cols - 1; x += 2 + Math.floor(Math.random() * 3)) {
    carve(x, 0, 2);
    carve(x, rows - 1, 0);
  }
  for (let y = 1; y < rows - 1; y += 2 + Math.floor(Math.random() * 3)) {
    carve(0, y, 1);
    carve(cols - 1, y, 3);
  }

  return { grid, safe };
}

function addRect(parts, x, y, width, height) {
  parts.push(
    `M ${x} ${y} h ${width} v ${height} h ${-width} Z`,
  );
}

export function renderMazeEdge(layer, card) {
  const width = Math.max(card.clientWidth, 1);
  const height = Math.max(card.clientHeight, 1);
  const rows = Math.max(36, Math.round((COLS * height) / width));
  const { grid, safe } = buildGrid(COLS, rows);
  const parts = [];
  const cellWidth = 1 / COLS;
  const cellHeight = 1 / rows;

  addRect(
    parts,
    safe.x0 * cellWidth,
    safe.y0 * cellHeight,
    (safe.x1 - safe.x0) * cellWidth,
    (safe.y1 - safe.y0) * cellHeight,
  );

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (inSafe(x, y, safe) || !grid[y][x]) continue;
      addRect(
        parts,
        x * cellWidth,
        y * cellHeight,
        cellWidth,
        cellHeight,
      );
    }
  }

  layer.setAttribute("d", parts.join(" "));
}
