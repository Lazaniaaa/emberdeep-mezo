# Mycelium tiles, floors 3-4

Owner-supplied source: `art/tiles/raw/mycelium-v1.webp`. No image generation or external art was used.

```powershell
node scripts/sprite-sheets.mjs tiles mycelium
```

The existing `tiles` kind now supports both themes. It finds five artwork row bands and each tight non-magenta box. Output: `public/tiles/mycelium.png`, 128x160, four columns of 32px cells. Catacombs' default crop/joint is unchanged and its atlas still reproduces exactly.

| Row | Source | Treatment |
| --- | --- | --- |
| 0 | Four earth surfaces | Five-percent inset of the tight box, nearest-neighbour fill to 32x32; no joint or border added |
| 1 | Four rock wall tops | Whole box, opaque 32x32 |
| 2 | Four rooted wall faces | Whole box, opaque 32x32 |
| 3 | Mushrooms, spore puff, roots, skull | Transparent aspect fit inside 30x30; the puff slot is deliberately empty |
| 4 | Mushroom lamp, rooted arch, empty, empty | Transparent aspect fit inside 30x30 |

Compressed magenta fringe pixels are removed before resizing. There are 18 detected boxes but only 17 populated atlas cells: the translucent puff is a cached Canvas radial glow in `src/render/mycelium.ts`. It pulses softly with animation enabled and stays static under reduced motion. It does not grant light, reveal tiles or affect replay.

Floor variants use a deterministic coordinate/depth hash: root-cross variant 1 on about one in ten cells; variants 0/2/3 share the remainder. Wall faces use the exact Catacombs rule: a wall immediately above floor shows its face, every other wall is a dark top. All occupy complete cells. The rooted arch/lamp only overlay wall faces; they are decoration, not extra exits.

The common visual reservation (`CatacombsDecor`, retained for compatibility) now supports floors 1-4. Floor decorations exclude original spawn footprints, props, items, exits and current occupants; those reservations survive movement, collection, smashing and reload. Missing legacy reservations suppress optional floor decorations until a fresh floor. The earth texture itself is unaffected.

Floors 3-4 no longer load their archived painted pictures. The authoring grid is in `src/game/painted-floors.ts`; its new three-wide passages and open exits change game rules. Floors 1-2 and 5-7 retain byte-identical fixed-time renders in the browser regression.

QA: `scripts/tile-sheets.test.ts`, `src/render/mycelium.test.ts`, `src/game/mycelium-layout.test.ts`, existing 200-seed placement tests and local Edge desktop/phone walking. Evidence: `docs/mycelium-{before,after}-qa.json`, `docs/screenshots/mycelium-*`.

```powershell
$env:SMOKE_CHANNEL='msedge'; node scripts/mycelium-smoke.mjs after http://127.0.0.1:5741/
```

Only run the `before` phase deliberately against a pre-change build; it overwrites the reference snapshot. Route QA uses a high-light/high-damage dev fixture to separate walking from balance; ordinary-radius, live-animation fog screenshots are captured separately. Balance uses default rules/oil 1 via tuning and economy, not that fixture or the owner's local Oil x1.3 setting.

**Rebuild and release the signing server and the site together.** No push or deployment was performed.
