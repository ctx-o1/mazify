# Animation variants

Image morph is the default animation in `src/main.js`. Both variants are kept
as separate sequence modules and use the shared renderer in `src/stages.js`.

| Variant | Sequence module | App URL |
| --- | --- | --- |
| Image morph | `src/animations/image-morph.js` | `/mazify/` or `/mazify/?animation=morph` |
| Stage wipe | `src/animations/stage-wipe.js` | `/mazify/?animation=wipe` |

Open `/mazify/animations.html` for the side-by-side comparison. Its replay
controls reload each variant using the same source image and fixed seed.

## Generation settings

Both examples read the same controls and use the same maze-generation code.
The colour treatment affects drawing after brightness has been sampled.

| Setting | Both examples |
| --- | --- |
| Source image | Mona Lisa from `public/examples/mona-lisa.webp` |
| Image resolution | Automatically chosen on image load, with a manual range of 24–96 samples on the longer side |
| Grid rows | Follow the image aspect ratio, capped at 96 |
| Minimum detail per square | 1 × 1 |
| Maximum detail per square | 3 × 3 by default |
| Contrast | 1.0 |
| Invert | Off |
| Photo colours | On |
| Graph underneath | Off |
| Show solution | Off |
| Comparison seed | 271828182 |

The comparison sets `preview=1`, which fixes the seed and displays the canvas
without the app controls. Regular app visits and new-maze generation use random
seeds. With matching source, generation settings, and seed, both variants produce
the same maze topology.

Automatic resolution uses the smaller of the source image’s longest side and
its displayed longest side. It targets three CSS pixels per room at the selected
maximum subdivision, rounds the image sampling count to a multiple of eight,
and bounds it to 24–96. The Auto button recalculates this value. Moving the image
resolution slider switches to manual control. Changing maze detail recalculates
resolution while Auto is selected.

The main app draws coloured walls around the passages. Each tree connection
opens the shared wall between its two rooms. Screen and export wall thickness
is capped at 45% of the smallest room width. The solution follows the original
tree through these passages. The rendering helpers also support the earlier
coloured-path treatment through the view options.

## Rendering differences

The current comparison varies appearance as well as motion. Each version keeps
the rendering treatment it had when the two examples were selected.

| Rendering | Stage wipe | Image morph |
| --- | --- | --- |
| Line weight | Thinner | Thicker |
| Preferred screen line width | `clamp(corridor × 0.42, 0.9, 2.4)` | `clamp(corridor × 0.6, 1, 3.4)` |
| Colour mapping | Luminance-scaled RGB with channels quantized in steps of 16 | HSL with saturation boosted by 30% and lightness compressed to a dark ink range |
| Appearance | More muted | More saturated |
| Export line width | 3.2 px | Corridor-based width, capped at 12 px |

Here, `corridor` is the rendered grid-cell size divided by the maximum detail
per square. Line widths are in CSS pixels on screen and output pixels in exports.
The HSL mapping also quantizes hue, saturation, and lightness so strokes can be
batched by colour.

The wall-width cap above also applies to these preferred widths.

## Keyframes and timing

| Stage | Stage wipe | Image morph |
| --- | --- | --- |
| Image | Shows the source image | Shows the source image for 250 ms before pixelation |
| Pixelation | Included in the static tones stage | Pixels enlarge into coarse squares over 1.2 s |
| Tones | Wipes to the tonal grid over 0.95 s | Colours drain to light/dark tones over 1 s, followed by a 220 ms pause |
| Points | Included in the static graph stage | Squares shrink and spread into dots over 1.1 s |
| Connected graph | Wipes to the graph over 0.95 s | Links grow between dots over 1 s |
| Maze preparation | Wipes to the maze canvas over 0.95 s | Switches to the maze canvas |
| Maze construction | Opens passages through coloured walls | Opens passages through coloured walls |
| Final frame | Holds the completed maze full frame | Holds the completed maze full frame |

Stage wipe waits 500 ms before its first wipe and 250 ms before each subsequent
wipe. Both maze-construction sequences take 2–3.4 s according to graph size and
show an orange head with a short trailing path. Their final internal pauses are
450 ms for Stage wipe and 500 ms for Image morph.

With reduced motion enabled, both variants show the finished maze immediately.

## Shared implementation

- `src/animations/timing.js` provides easing and an independent, cancellable
  timeline for each renderer.
- `src/stages.js` handles canvas drawing, path construction, solutions, and stage
  selection.
- `src/maze.js` handles generation and export. The selected variant can supply
  its colour mapping and line-width calculation.
- `src/walls.js` builds the room boundaries and draws the remaining walls. The
  draft uses the same boundary geometry.

`draft.html` is a separate experiment with its own painting, generation settings,
wall-carving sequence, and dark presentation. The side-by-side comparison uses
the two modules listed above.
