# Catacombs tiles (floors 1-2)

The owner supplied `art/tiles/raw/catacombs-v5.webp`. This is existing art processing, with no generated replacement art.

Rebuild only this atlas (does not touch any other sprite sheets):

```powershell
node scripts/sprite-sheets.mjs tiles catacombs
```

`scripts/tile-sheets.mjs` detects five horizontal foreground bands and each tight non-magenta box. Equal sheet subdivisions would clip the torch tips. It removes magenta and compressed fringes, uses nearest-neighbour scaling and writes lossless RGBA `public/tiles/catacombs.png` (128x160).

| Atlas row (zero based) | Cells, left to right | Treatment |
| --- | --- | --- |
| 0 | Plain, cracked, moss, pebbles | Inset 7.5% on each side, resize interior to 30x30, surround with one opaque #0B1A24 pixel on all four sides |
| 1 | Four rock tops | Whole box, opaque 32x32 |
| 2 | Four brick faces | Whole box, opaque 32x32 |
| 3 | Brazier, rune, puddle, bones | Transparent, aspect fit inside 30x30, centred in 32x32 |
| 4 | Torch, barred gate, empty, empty | Same transparent treatment |

Rendering is in `src/render/catacombs.ts`. Each existing floor cell draws exactly one slab; a wall immediately above floor draws a brick face, all other walls draw rock. Variants and decoration candidates depend only on cell coordinates and depth. Wall attachments stay inside brick face cells. The gate is a closed decorative niche, not another stairs or exit. The old paintings for 1-2 remain archived in `public/maps/`, but are never requested by the renderer. If the atlas is missing or still loading, a plain opaque cell fallback preserves the same boundaries.

Decorations do not block movement, emit gameplay light or enter replay/state. `RunPresentation` reserves the floor's original props, items and creature footprints plus stairs/rift in a UI-only `CatacombsDecor`. Current occupants are excluded too. The reservation is retained across movement, breaking and collection, and saved separately in sessionStorage (`emberdeep-catacombs-decor-v1`). On resuming an old run without a valid reservation, floor decoration is omitted until the next fresh floor; unknown original spawns are never guessed. Blocked sessionStorage affects only this optional visual restoration.

Lighting, seen tiles, line of sight, rift/stair markers, combat, spawning and the existing grids are unchanged. Floors 3-7 retain their paintings and actor alignment. No signing-server rebuild is needed for this rendering-only change.

## Verification

- Pipeline tests reproduce the atlas, check all 18 populated cells, opaque walls, even floor joints and transparent decoration margins.
- Render tests check wall orientation, deterministic decoration and persistent spawn exclusions without mutating a run.
- Local Edge QA at 1440x1000 and 375x812 walks from rift to stairs using the real keyboard and touch controls, including combat/breaking along the route. A high-light/high-damage dev fixture keeps the route test independent of balance; it is not a balance measurement.
- `docs/catacombs-before-qa.json` and `docs/catacombs-after-qa.json` retain generated-floor hashes and action counts. Fixed-time renders of floors 3-7 match byte for byte; both catacombs grid hashes are unchanged. After QA also checks ordinary radius/fog, animation enabled, and no requests for `depth-01.webp` or `depth-02.webp`.
- Screenshots: `docs/screenshots/catacombs-0[12]-{before,after}-*.png`; upscaled atlas: `catacombs-atlas-preview.png`.

Repeat after a change with the local dev server on port 5741:

```powershell
$env:SMOKE_CHANNEL='msedge'; node scripts/catacombs-smoke.mjs after
```

The `before` phase records a new baseline and should only be run deliberately before a future visual change; it overwrites the saved baseline. The original baseline here was captured before replacing the catacombs paintings.
