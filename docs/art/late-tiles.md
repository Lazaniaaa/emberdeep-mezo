# Cinderworks and Hollowglass tiles

Owner-supplied sources: `art/tiles/raw/cinderworks-v1.webp` and `hollowglass-v1.webp`. No image generation or external art was used.

```powershell
node scripts/sprite-sheets.mjs tiles cinderworks
node scripts/sprite-sheets.mjs tiles hollowglass
```

Both use the existing five-row/four-column `tiles` kind: 18 detected tight artwork boxes in a 128x160 atlas of 32px cells. Floor slabs are inset 7.5%, resized to 30x30 and surrounded by an even 1px `#0B1A24` joint on all four edges. Rock tops crop another 2.5% (about six source pixels) inward before filling 32x32, past matte/compression fringes. Catacombs and Mycelium atlases remain unchanged.

Cinderworks faces are opaque. Hollowglass crystal faces keep every removed matte pixel transparent, including the irregular top silhouette: the renderer draws a full opaque rock top **first**, then the crystal face in the same wall cell. No magenta or transparent line can reveal the canvas between wall tiles. Decorations/lamps/gates fit transparently inside 30x30, with the source fringe removed. The crystal gate gets brighter highlights (x1.45 +12; clipped purples lifted toward lavender) and is drawn **two tiles high** on known solid wall above the arena's stairs. It is a closed wall ornament, not an extra descent. Its draw occurs after terrain, so neighbouring cells cannot overwrite it.

`src/render/late-tiles.ts` shares the Catacombs wall-orientation and spawn-reservation helpers. All structural cells fill exactly 32x32. Decorations remain visual, nonblocking, outside original/current occupied cells, and do not grant gameplay light. Fog, danger warnings and existing effects draw on top. Floors 8+ retain their procedural/code-rendered tiles; no floor loads a painting.

The old seven runtime WebPs moved from `public/maps/` to `art/maps/painted/`, and their original PNGs moved from `art-src/maps/` to `art/maps/original/`, unchanged. The historical `scripts/optimize-maps.mjs` now reads/writes only those art archive directories; it cannot accidentally republish paintings. `src/render/painted-map.ts`, `src/game/map-art.ts`, `ART_PATCHES`, `ART_DOORWAYS`, image caches and the painting loader were removed. `src/game/floor-layouts.ts` now names the authored collision masks. `scripts/floor-overlay.mjs` draws the real tiled renderer instead of registering an illustration.

Verification: `scripts/tile-sheets.test.ts` reproduces both atlases, checks all slab joints, deeper top crops, opaque cells, transparent crystal holes and absence of magenta fringe. `src/render/late-tiles.test.ts` verifies layer order and the two-tile wall gate. Browser evidence/overlays are under `docs/screenshots/late-*`; atlas previews are `cinderworks-atlas-preview.png` and `hollowglass-atlas-preview.png`.

```powershell
$env:SMOKE_CHANNEL='msedge'; node scripts/late-tiles-smoke.mjs after http://127.0.0.1:5741/
node scripts/late-boss-smoke.mjs http://127.0.0.1:5741/
node scripts/floor-overlay.mjs after http://127.0.0.1:5741/ docs/screenshots/late-tiles-overlays
```

The `before` smoke phase is a deliberate baseline capture and must not be rerun against current rules. Layout changes are game rules: **rebuild and update the signing server and site together**. No push or deployment was performed.
