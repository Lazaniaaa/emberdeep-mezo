# Lantern capacity and Cerberus rhythm, 2026-10-24

This combines the previously uncommitted creature-drain rebalance with the owner's two additional rules. The baseline below is the working **hit multiplier 4** version measured before adding the cap/rhythm, not the weaker geometry-only `49d71a7` commit. Raw before/after results are saved in `docs/lantern-boss-{before,after}.json`.

## Rules

- `maxLight` begins at `flasks * 80 + perks.startLight`. Every new level raises capacity by exactly 10 and restores 10 light. Capacity carries between floors.
- All light gains go through `addLight`: jars, props, creature drops, Emberblade (ordinary and boss kills), passive regeneration, Regeneration, Oil Vial and Healing Draught. Excess is lost. A short "Lantern full" note is appended to the action message; the loot/kill/level message remains readable. Drops and tuning tallies count accepted light, not discarded oil.
- Oil Vial/Healing Draught at full light remain in the bag, with no usage count, step, enemy action or RNG roll. The action gives a short "Potion kept" message. Partial refills consume one potion and discard excess.
- Oil drop probabilities use current capacity instead of the starting fill. Old session saves derive missing capacity from starting light and level and clamp legacy overflow. Carried loot and currencies are retained.
- Cerberus marks the eight orthogonal cells around its 2x2 body, omitting walls and props. It spends **one turn winding up**, strikes for **40** before protection, then spends **two complete turns recovering** without moving or draining. It next warns on the following turn. Hero attacks advance this same rhythm even when step count does not change. A dodge misses; Ward cancels a strike; either still leads to recovery. Slow movement remains at factor **0.5**, with the original footprint collision rules.
- The renderer shows the real warning tiles, windup pose and recovery bar/count. A resolved `bossDrain` event identifies the light-loss cause; merely standing adjacent no longer creates an attack. Bots see the new boss warnings through their existing marked-tile dodge logic.
- HUD shows current/max with an accessible progress description. Browser QA verified 80/80 → 90/90 after a level-up.

## Balance decision

Retained **ENEMY_HIT_MULT=4** (ordinary hits 8/12/16/20), **BOSS_DRAIN=40**, **BOSS_WINDUP=1**, **BOSS_RECOVERY=2**. The +25% flask requirement and the existing depth reference both pass at these values, so neither permitted combat knob needed changing. Prices, loot, oil amounts/chances, enemy HP and payout splits/caps are unchanged.

The 30-seed flask regression now gives 2.0838 / 4.4674 gold per cent for one/two flasks, a **114.39% advantage**. The independent 80-seed set gives 2.0550 / 5.1136, **148.84%**. The strict original `two > one * 1.25` assertion remains active. The cap makes the extra flask's storage valuable, particularly on the first floor.

Depth reference before the new rules was approximately 4.8 with three flasks and 5.0 with five (newcomer divers); after is 4.975 / 5.30. These are reference comparisons, not invented player-playtime promises. The optional parameter study (`docs/lantern-boss-sweep-30.json`) compared multipliers 2/2.5/3/3.5/4, retaining the requested current drain because it meets the goals.

The separate simulated-crowd guard measured **5.36361413 gold/cent** and rejected its previous 5.5 setting. Under the owner's existing recalibration-on-failure instruction, **FIELD_GOLD_PER_CENT=5.2** is now just below that measurement. The 70%-100% calibration guard is unchanged. Crowd calibration does not enter the flask efficiency measurement; pooled money and payout limits remain unchanged.

## Before/after measurements

Same seeds and default oil multiplier **1**. The owner's local +30% oil test is still optional. These are deterministic bot runs, not player data.

**Collectors, 80 runs per cell.** Gold is what was banked alive, divided by keys+flasks spent. Boss percentages use all runs as the denominator.

| Flasks | Gold/cent before → after | Mean deepest before → after | Deaths before → after | Boss reached before → after | Boss killed before → after |
| --- | --- | --- | --- | --- | --- |
| 1 | 3.7527 → 2.0550 | 1.8500 → 1.2500 | 5% → 3.75% | 0% → 0% | 0% → 0% |
| 2 | 5.3294 → 5.1136 | 2.7000 → 2.7250 | 6.25% → 6.25% | 0% → 0% | 0% → 0% |
| 3 | 5.5724 → 5.7332 | 3.1625 → 3.3375 | 7.50% → 8.75% | 0% → 0% | 0% → 0% |
| 5 | 5.9016 → 5.8298 | 4.1125 → 4.2375 | 11.25% → 10% | 0% → 1.25% | 0% → 1.25% |

**Newcomer divers, 40 runs per cell.** They keep descending until death, so their gold is not banked and their death rate does not describe extraction skill.

| Flasks | Mean deepest before → after | Boss reached before → after | Boss killed before → after |
| --- | --- | --- | --- |
| 3 | 4.825 → 4.975 | 22.5% → 20% | 0% → 5% |
| 5 | 5.050 → 5.300 | 40% → 32.5% | 2.5% → 15% |

For five-flask divers this means 16/40 → 13/40 reach the boss, while 1/40 → 6/40 kill it. Capacity restricts stockpiling; the telegraph/recovery makes the fight winnable through dodging. These outcomes describe the combined change, not an isolated causal estimate for either feature.

Full regenerated cohorts: `docs/economy-report.md`; oil scenarios: `docs/light-tuning.md`.

```powershell
$env:LANTERN_PHASE='after'; npx vitest run --config vitest.lantern.config.ts
$env:DRAIN_TAG='lantern-boss-sweep'; $env:DRAIN_SWEEP='2,2.5,3,3.5,4'; $env:DRAIN_RUNS='30'; $env:DRAIN_DEPTHS='1'; npx vitest run --config vitest.drain.config.ts
```

The `before` metrics are a retained historical snapshot; running `LANTERN_PHASE=before` against new rules overwrites it and is only appropriate before a future change.

## Verification and release

- **407 tests pass, no skips**, using `npm test -- --maxWorkers=2`. New tests exercise every refill source, level capacity, full potions, max-based oil chances, legacy capacity restoration, boss warning/40-light strike/recovery/Ward/dodge and footprint danger. Existing replay and attestation tests use the same rules as the browser.
- Typecheck, build and lint pass; lint has the three known Fast Refresh warnings. Local signing-server build passes, with its existing Vite option deprecation warning.
- `npm run tuning`, `npm run economy` and before/after metrics complete. No price or loot adjustments and no threshold relaxation were used.
- Local Edge at 1440x1000 and 375x812: actual keyboard/touch input checks full potion retention, a level-up to 90/90, eight visible boss warning tiles, one 40-light strike, two non-draining recovery turns, Ward, a dodge and a complete boss kill/hoard. No page or console errors. Evidence: `docs/lantern-boss-qa.json`, `docs/screenshots/lantern-boss-*`.

```powershell
$env:SMOKE_CHANNEL='msedge'; node scripts/lantern-boss-smoke.mjs
```

**Game rules changed: the signing server and the site must be rebuilt and released together.** No push or deployment was performed. Start fresh descents after the eventual joint update; old action logs cannot be replayed across rules versions. No keys or seed phrases were requested or accessed.
