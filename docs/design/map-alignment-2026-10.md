# Painted floors and light feedback — 2026-10-23

The seven painted floors now use explicit collision masks. **This changes deterministic rules: release the client and signing server together and begin fresh descents.** No push, deployment, contract change or key access was performed.

## Changes

- `src/game/painted-floors.ts` replaces approximate rectangles with 32px masks: `#` masonry/torches/well edges, `.` floor, one `R` and one `S`. The painted narrow links stay narrow. Every initial occupant, including all four boss cells, leaves a two-cell Chebyshev clearance around both exits. Props retain the connectivity guard.
- The southern niche on floor 2 and peripheral galleries on floor 6 are visibly sealed by painted masonry. They remain scenery, not spawn regions; broad floor pastes no longer invent entrances through their walls.
- All six broad `ART_DOORWAYS` pastes on floors 4–6 are removed, together with the offline widening on floor 2. Only three small one-cell thresholds remain: two thin stone frames on floor 1 and the east seam on floor 3. They retain the surrounding columns. Rendering and overlays share `paintMap`.
- Floor 6's central orange well is closed with metal crossbars and a hatch over its treads. Its sole descent is the right-hand painted well, at **(23,8)**. Floors 1–6 have single-file approaches into their painted wells; floor 7 retains its north exit.
- Painted-map actors and their feedback draw 12px higher: feet sit near the traced cell centre instead of the next row's wall cap. Ground warnings and stair markers stay on their tiles.
- Both `attackTiles` and `reachDirection` stop before an intact prop. Cover is checked again when the strike resolves: breaking the prop opens the line immediately.
- Light feedback is presentation-only: newest group above older groups, eight bounded lanes, 1100ms lifetime. Identical displayed amounts from the same cause merge within a rolling 500ms window, showing the total, e.g. `−120 light · boss ×3`. Layout avoids boss marks, damage/loot and actual HUD rectangles, including on phones and with reduced motion.

## Before/after measurements

Baseline: clean commit `4259de5`; both `npm run tuning` and `npm run economy` ran before editing rules. Final reports use the same commands and seeds: 40 descents per tuning cell, 80 per economy strategy. These are bot simulations, not player measurements. Both use default oil, independently of the owner's local dev Oil ×1.3 setting.

| Strategy | Gold banked / cent, before → after | Mean deepest floor, before → after |
| --- | --- | --- |
| Unperked, 1 flask | 4.91 → 4.34 | 2.2 → 1.9 |
| Unperked, 2 flasks | 6.71 → 6.04 (−10.0%) | 3.0 → 2.8 |
| Unperked, 3 flasks | 8.75 → 6.71 (−23.3%) | 4.2 → 3.4 |
| Strongest held build, 3 flasks | 11.70 → 9.22 | 5.3 → 4.3 |
| Strongest build locked 10+ rounds, 3 flasks | 11.29 → 13.35 | 5.4 → 5.9 |

The Chosen newcomer diver with three flasks reaches mean depth **5.7 → 5.6**, and the boss floor in **25/40 → 24/40** descents (62.5% → 60%). Its one/two/five-flask means are 4.8/5.5/6.2 → 5.2/5.5/6.4. Layout and cover change paths, encounters and RNG consumption; nominal costs, loot quantities and drop weights did not change. The effect is not a uniform gold multiplier across builds.

The original crowd calibration failed at 6.8 against a measured mixed-bot rate of about 6.59. The owner explicitly chose **6.4** for `FIELD_GOLD_PER_CENT`. Prices, loot, split, return cap and contracts are unchanged; no economy assertion was weakened. Existing tests still bound settlement by the pool and the strongest-build advantage by 3.5×. Full regenerated tables: [economy](../economy-report.md), [light tuning](../light-tuning.md).

## Verification and evidence

- `npm run typecheck`, `npm test`: **377 tests / 34 files pass**. The map suite checks 200 seeds per depth, all seven depths, including high find bonuses: every traced floor cell is reachable, props cannot disconnect any remaining floor, all occupants fit the trace, do not overlap and leave exits clear. Separate landmark/corridor assertions protect the screenshot cases. Line/cross cover tests cover all four directions and a strike resolving after a prop breaks.
- `npm run build`, `npm run lint`, `npm run tuning`, `npm run economy` pass. Lint has only the three known Fast Refresh warnings. The local `npm run server:build` also passes with its existing `inlineDynamicImports` deprecation warning. Nothing was published.
- Edge at **1440×1000 and 375×812**: all seven wall boundaries and stair approaches, three rapid drains beside a living Cerberus (`−120 light · boss ×3`), no intersection with reserved rectangles, reduced motion, no page/console errors. [QA output](../floors-qa.json). Previous feel QA also passes: held attacks land, every boss drain animates, sounds follow contact, death cause persists and mute/hide/unmount clear pending sounds.
- All seven [overlays](../screenshots/) are saved as `floor-0X-before.png` / `floor-0X-after.png`, seed **20261023 + depth**. Matching JSON contains the exact generated floors. Full renderer views: `floor-0X-render.png`; viewport views: `floor-0X-desktop.png` / `floor-0X-phone.png`; feedback: `light-labels-desktop.png` / `light-labels-phone.png`.

With the Vite dev server on port 5741:

```powershell
$env:SMOKE_CHANNEL='msedge'
node scripts/floor-overlay.mjs after
node scripts/floors-smoke.mjs
node scripts/feel-smoke.mjs
```

The before images were captured before the edits; the tool refuses to overwrite that baseline. Saved in-progress runs retain their old serialized floor: this change does not silently rewrite them or discard carried loot. Start a **fresh descent** to use the corrected geometry and generate replays under the new rules.
