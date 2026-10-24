# Mycelium floors 3-4, 2026-10-24

Baseline: `5865069` (lantern cap, creature drain 8/12/16/20, Cerberus windup/40-light strike/two-turn recovery). This change replaces the painted Mycelium floors with tiles and widens their authored collision grids. No combat, AI, price, loot, potion, light-cap, step-cost or payout constants changed.

## Artwork and geometry

- Source: owner-supplied `art/tiles/raw/mycelium-v1.webp`. Existing `tiles` kind produces `public/tiles/mycelium.png`. Earth crops use a 5% inset and fill 32x32 without the Catacombs slab joint; wall cells remain opaque 32x32. The transparent decoration/lamp/arch sprites lose their magenta fringe. The spore slot is empty; a cached translucent Canvas glow replaces its hard cutout. Full pipeline: `docs/art/mycelium-tiles.md`.
- Floor variants are deterministic. Root-cross earth is chosen on about 10% of cells, rather than a repeating alternating pattern. Wall faces appear only in wall cells directly above floor; every other wall uses a rock top. Purely visual decorations preserve spawn/occupant exclusions across turns and reload, never block walking and grant no gameplay light.
- Floor 3 retains the left/right/bottom triangle loop. Main link: x=11..20, y=6..8. West link: x=8..10, y=13..17, joining x=11..13, y=15..17. East link: x=25..27, y=10..17. The elbows have full 3x3 turning room.
- Floor 4 retains the four-room hub. Horizontal link: x=7..19, y=7..9; vertical links x=12..14 at y=5..6 and y=10. All room mouths continue at the same three-cell width.
- Exit coordinates are unchanged: floor 3 rift (5,9), stairs (26,6); floor 4 rift (4,8), stairs (22,7). Each has all eight neighbours on floor, with no enclosing wall faces. The existing Chebyshev >2 spawn exclusion and prop-free-route placement algorithm are unchanged.
- Walkable area: floor 3 **186 → 252 cells**, floor 4 **114 → 193**. Grid dimensions remain 34x22 / 27x17. No one-cell stairwell niches remain. Catacombs 1-2 and painted floors 5-7 are unchanged.

## Before/after balance

Default oil multiplier **1**, same seeds and unperked dagger bots. These are simulations, not human results. The `before` data is the measured `docs/lantern-boss-after.json` from the identical baseline rules at `5865069`, retained with provenance in `docs/mycelium-before.json`. The new measurements are in `docs/mycelium-after.json` (`npx vitest run --config vitest.mycelium.config.ts`). No historical baseline was overwritten.

**Collectors, 80 descents per flask setting.** Gold/cent includes the entry key and flasks and counts only gold banked alive.

| Flasks | Gold/cent before → after | Mean deepest before → after | Deaths before → after |
| --- | --- | --- | --- |
| 1 | 2.0550 → 2.1900 | 1.2500 → 1.2500 | 3/80 (3.75%) → 2/80 (2.5%) |
| 2 | 5.1136 → 5.6263 | 2.7250 → 2.9000 | 5/80 (6.25%) → 4/80 (5%) |
| 3 | 5.7332 → 6.7532 | 3.3375 → 3.8000 | 7/80 (8.75%) → 7/80 (8.75%) |
| 5 | 5.8298 → 6.3345 | 4.2375 → 4.3750 | 8/80 (10%) → 7/80 (8.75%) |

**Newcomer divers, 40 descents per cell.** They deliberately descend without extracting; their carried gold/deaths do not represent banking skill.

| Flasks | Mean deepest before → after | Reach Cerberus before → after | Kill Cerberus before → after |
| --- | --- | --- | --- |
| 3 | 4.975 → 5.050 | 20% → 25% | 5% → 10% |
| 5 | 5.300 → 5.575 | 32.5% → 55% | 15% → 35% |

`FIELD_GOLD_PER_CENT` stays **5.2**: the existing mixed-crowd calibration test passes. No recalibration, balance-threshold changes or skipped tests were needed. The original +25% two-flask efficiency guard, fog/omniscient comparison, strongest-build guard, pool-total bounds and server replay/signature integration all pass. More open geometry changes the bot routes and loot reached; these combined results do not isolate individual corridor/room changes.

Regenerated `docs/light-tuning.md` compares ordinary/+30% oil and expert/sloppy styles; `docs/economy-report.md` contains the full loadout and pool scenarios.

## Verification

- Typecheck, build, lint and local signing-server build pass; lint keeps the three known Fast Refresh warnings, server build its existing `inlineDynamicImports` deprecation.
- **421 tests pass, no skips** (`npm test -- --maxWorkers=2`). New tests check all corridor sections/mouths/elbows, exits, complete planned floor coverage, reproducible opaque/transparent atlas cells, no earth border, rare-root selection and visual spawn reservations. Existing 200-seed tests per floor still require every floor tile reachable, exact traced placement, one stairs/rift, no overlaps/exits-adjacent spawns and connected routes with all props blocked.
- One old geometry assertion compared the walkable area of floor 1 (190) with floor 4 (now 193). It now compares early canvases with the unchanged painted floors 5-7 instead. Grid dimensions are still asserted, and independent new layout tests verify the new area. No balance guard was loosened.
- Edge **1440x1000 / 375x812**, real keyboard/touch steps from rift to stairs, including fighting/breaking along the route. Shortest routes: floor 3 **28 → 24**, floor 4 **21 → 19**. These route fixtures have high light/damage and are not balance measurements. Separate ordinary-radius live-animation fog screenshots verify the real lighting/fog layer.
- Fixed-time renders of floors **1,2,5,6,7 match byte for byte**. New atlases load; no request is made for `depth-03.webp` or `depth-04.webp`. No browser page/console errors. Before/after screenshots and atlas preview are under `docs/screenshots/mycelium-*`; raw QA: `docs/mycelium-{before,after}-qa.json`.

**Game rules changed: rebuild and update the signing server and the site together.** No push or deployment was performed. Old saved descents retain their own geometry/loot; begin a fresh descent after the eventual joint update and do not submit an old-version replay to the new signing server.
