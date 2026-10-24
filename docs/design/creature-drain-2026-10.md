# Creature drain rebalance, 2026-10-23

Historical drain-only measurements, before the owner's additional lantern-cap and Cerberus-rhythm request. The final combined rules, current calibration and checks are in [lantern-boss-2026-10.md](lantern-boss-2026-10.md); all three changes share one commit.

This follows the maps checkpoint `49d71a7`. The owner explicitly requested stronger ordinary-creature hits and restoration of the original +25% two-flask efficiency test. The walk grids remain exactly as committed there. This is another rules change: rebuild and release the signing server and site together; nothing was pushed or deployed.

## Change and evidence

Only two runtime constants change: `ENEMY_HIT_MULT` 1.25 → **4**, and, after its calibration guard failed, `FIELD_GOLD_PER_CENT` 6.4 → **5.5**. Enemy telegraphs, movement, attack range, recovery, HP, boss drain (40), armor/ward handling, oil drops, loot, prices, step costs, bots, settlement and payout caps are unchanged.

The resolved ordinary hit formula remains `(2 + floor(depth / 2)) * ENEMY_HIT_MULT * (1 - drainReduce)`:

| Floor | Before | After (no armor) |
| --- | --- | --- |
| 1 | 2.5 | 8 |
| 2-3 | 3.75 | 12 |
| 4-5 | 5 | 16 |
| 6-7 | 6.25 | 20 |

These are hit costs alone. A wait/step taken on the impact turn also pays the existing step cost. Missing/dodging still drains no hit light, wards still cancel the hit, and armor still reduces it.

An optional Vitest parameter study overrides only the hit constant in isolated modules, then runs the real unchanged bots over identical seeds. The 30-seed efficiency ratios for multipliers 1.25 / 2 / 2.5 / 3 / 4 / 5 are 1.011 / 1.034 / 1.078 / 1.120 / **1.361** / 1.508. Multiplier 4 gives simple 8/12/16/20 costs and a margin above 1.25. Verification on 80 seeds gives **1.420**, so the choice is not based only on the small regression fixture. Raw results: `docs/drain-sweep-30.json` and `docs/drain-sweep-80.json`.

```powershell
$env:DRAIN_SWEEP='1.25,4'; $env:DRAIN_RUNS='80'; npx vitest run --config vitest.drain.config.ts
```

This study is excluded from normal `npm test`. Its module overrides never affect production rules. The actual runtime change is the constant in `src/game/config.ts`.

## Before/after, same 80-seed collectors

Default oil multiplier 1, unperked dagger bots, keys and flasks included in spend. "Before" is the wide-map checkpoint, not the old painted/narrow maps. These are bots, not human playtests.

| Flasks | Gold banked / cent before → after | Mean deepest before → after | Deaths before → after |
| --- | --- | --- | --- |
| 1 | 5.1818 → 3.7527 | 2.20 → 1.85 | 0/80 (0%) → 4/80 (5%) |
| 2 | 5.8792 → 5.3294 | 2.7875 → 2.70 | 4/80 (5%) → 5/80 (6.25%) |

The second flask's gold/cent advantage rises from **13.46% to 42.02%** over these 80 seeds. In the original 30-seed regression fixture it rises from **1.08% to 36.07%**. The temporarily skipped test is restored with its original strict `two > one * 1.25` assertion; no flask-test threshold was loosened.

The 40-seed chosen newcomer diver reaches depth 4.8 with 3 flasks (before 5.6), or 5.0 with 5 (before 6.2). Boss-floor arrival falls from 50% to 23% with 3 flasks and 65% to 40% with 5. These divers intentionally continue until death, so their death rate does not measure successful extraction. Full chosen/experimental scenarios are regenerated in `docs/light-tuning.md`; `docs/economy-report.md` covers the 80-seed collector cohorts and payouts.

## Crowd calibration and fairness

With drain 4 the existing 70/20/10 mixed-crowd calibration measures **5.6492663043 gold/cent**. The old 6.4 fails the required upper bound. Per the owner's instruction to recalibrate only on failure, the simulated crowd is now **5.5**, about 2.64% below that measurement and above the unchanged 70% lower bound. This adjusts the simulated comparison crowd, not prices, loot or the amount of money entering any pool. The pool split and 160% cap are untouched; payout totals remain bounded by the pool.

The owner's geometry rebaseline for fog-vs-omniscient remains 39%; it was not changed again. All balance guards pass, including the +25% flask requirement and the strongest-build bound.

## Checks

- `npm test -- --maxWorkers=2`: **394 tests pass, no skips**; seven new resolved-hit checks cover floors 1-7 alongside existing dodge, ward, armor and boss tests.
- `npm run typecheck`, `npm run build`, `npm run lint`: pass; lint has only the three known Fast Refresh warnings.
- `npm run tuning`, `npm run economy`: regenerate the reports with the new rules.
- `npm run server:build`: local build passes; existing Vite option deprecation warning only. No running signing service or live site is updated.
- Edge desktop (1440x1000) and phone (375x812): actual keyboard/touch waits land an 8-light hit on floor 1 and 12 on floor 2, plus the unchanged one-light wait. Exact remaining light 71/67 from 80, recovery phase and displayed strike text verified. No console/page errors. Evidence: `docs/drain-qa.json`, `docs/screenshots/drain-*`; repeat with `$env:SMOKE_CHANNEL='msedge'; node scripts/drain-smoke.mjs`.

The maps checkpoint is separately committed. The drain measurements above isolate that intermediate state; the final rules also include lantern capacity and Cerberus rhythm in the combined commit. After any eventual deployment, start fresh descents; do not replay a previous rules version against the rebuilt server.
