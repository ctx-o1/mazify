# Mazify handover

Updated 7 November 2026.

## Brief

Build an attractive image-to-maze tool whose finished maze preserves the source
image and is comfortable to solve. We are refining the main app’s rendering,
automatic settings, and usability. Discuss substantial changes with the user
before implementing them. The user prefers Chrome for visual reviews.

Preserve the original brightness-to-subdivision mapping, graph construction,
seeded DFS spanning tree, and coloured path renderer. Treat wall rendering as
an additional representation of that same maze. Discuss changes to the
generation algorithm before implementing them.

## Current state

- Work on branch `main` in `D:/projects/mazify`.
- This checkpoint includes wall rendering and automatic resolution, the move
  from `src/draft/walls.js` to the shared `src/walls.js`, plus
  updates to the app, controls, renderer, styles, and animation documentation.
- The [local app](http://127.0.0.1:5174/mazify/) serves these changes. Start it
  with `npm run dev -- --host 127.0.0.1 --port 5174`. Validate with `npm run build`.
- Image morph is the default. Stage wipe remains available at `?animation=wipe`.
  Both sequences finish with a full maze. The falling-grid ending was removed.
- Controls appear after the opening animation. The image begins centered and
  moves into the tool layout as the controls fade and slide in.

## Rendering and settings

The graph contains room centres and possible connections. A spanning tree
selects the passages. The new renderer builds room boundaries and removes the
shared wall for each selected connection. Remaining walls carry image colours.
The solution follows graph edges between room centres. The 7 November review
found that these straight strokes can intersect thick walls at changes in room
size. Some open doorways have subpixel clearance. Fix wall clearance and solution
routing while preserving the original generation algorithm.

- Main defaults to walls. The Original paths checkbox switches to the original
  coloured path renderer for the same maze, including PNG and clipboard output.
- Image resolution measures samples along the longer image dimension, with a
  manual range of 24–96. Maze detail defaults to 3 × 3 subdivisions, chosen after
  comparing 2 × 2, 3 × 3, and 5 × 5 on the user-supplied scene.
- Auto runs on image load and via the sparkle button. It targets three CSS pixels
  per room, rounds sampling to multiples of eight, and considers source/display
  dimensions. Changing maze detail recalculates while Auto is selected.
- Walls are capped at 45% of the smallest room width. Solution strokes are capped
  at 40%, but the review found these limits insufficient at narrow doorways.

## Findings and next priorities

1. **Auto is still too dense for comfortable solving.** An earlier live painting chose
   resolution 88 with 2 × 2 detail at 720 px width. Tune Auto around clear passage
   width after subtracting wall thickness, and consider intended print size.
2. Make entrance and exit markers conspicuous. Current markers are very small.
3. Preserve recognizability while tuning. The user’s tightly framed anime
   portraits work better than the busy Botticelli scene. Controlled comparisons
   found that both historical and current rendering lose much of that painting.
4. Complete upload, solution, regeneration, and PNG export checks through the UI.
   Build and 556 one-off boundary, connectivity, and recarving cases passed.
   The independent review reproduced wall clipping and subpixel doorways.
   Actual upload and exported-image visual checks remain pending. Automated
   upload hit Chrome’s file-URL permission restriction. A native-dialog attempt
   stopped browser control, although later page inspection worked.

## Files and visual direction

- [Main app](D:/projects/mazify/src/main.js) owns Auto and the wall view options.
  [Maze generation/export](D:/projects/mazify/src/maze.js),
  [wall geometry](D:/projects/mazify/src/walls.js), and
  [stage renderer](D:/projects/mazify/src/stages.js) implement the output.
- [Animation documentation](D:/projects/mazify/docs/animations.md) records the
  sequences and settings. The separate experiment is at `draft.html`.
- Use the compact layout, icon buttons with labels, and a full-width navbar
  with GitHub on the right. The oil-painted background has a 50% warm cream CSS
  overlay. The visible title and navbar divider were removed.
- The default is the user-supplied `public/examples/mona-lisa.webp`, copied from
  `C:/Users/goodb/Downloads/Mona-Lisa-oil-wood-panel-Leonardo-da.webp`. Prioritize conversion and usability
  over further artwork research.
- Ignored local comparisons are under `.cache/rendering-review/` and
  `.cache/walls-review/`. They include a copy of the user’s red-background portrait.
