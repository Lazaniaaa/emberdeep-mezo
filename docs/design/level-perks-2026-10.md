# Descent level perks — 2026-10-25

Every new level keeps its +10 capacity, +10 light and +2 damage, then offers one of up to three deterministic perks.
A descent holds **four different perks**, each with **three ranks**. Choices pause input, cost no light/turn,
and never advance creatures. This is a **game-rule change**, not just a new HUD.

## Effects

Numbers are the **total effect at that rank**, never cumulative additions of the three columns.
All light restoration respects maximum lantern capacity. Only Steady Wick was reduced after a confirmed balance
guard failure; all other effects retain the owner's requested values.

| Perk | I | II | III | Charges / notes |
| --- | --- | --- | --- | --- |
| Oil Thief | +1 light/kill | +2 | +3 | Adds to existing guaranteed kill-light perk, including Cerberus |
| Steady Wick | −8% step cost | −16% | −24% | **Calibrated from 10/20/30%; shared 40% discount cap remains** |
| Wide Glass | +1 radius | +2 | +3 | Existing Perks.radius behaviour, including notice-distance contribution |
| Ember Heart | +15 capacity | +30 | +45 | Each selection immediately restores 15 light |
| Last Flicker | Survive once, 10 light | Once, 20 light | Twice, 20 light | Total descent allowance; checked before Night Vision at end-turn darkness check |
| Riposte | Next creature strike ×1.5 | ×2 | ×2.5 | Charges on a real dodge, not a Ward block; consumed by one creature strike, stacks multiplicatively with Rage |
| Heavy Blow | +3 damage | +6 | +9 | Adds to existing damage field |
| Momentum | 1 free step/kill | 2 | 3 | A new kill resets remaining free steps to rank; never stacks; waiting/attacking does not consume a step charge |
| Thick Coat | −10% creature drain | −20% | −30% | Includes Cerberus; shared armor/drain cap remains 80% |
| Stone Ward | 1 ordinary block/floor | 2 ordinary blocks/floor | 2 blocks/floor, including Cerberus | Existing timed Ward has priority; unused charges do not carry to the next floor |
| Interrupt | 3 cancellations/descent | 4 | 5 | Surviving ordinary windup target enters recovery; never cancels Cerberus, never wastes a use on a kill |
| Deep Breath | 1 free wait after a step | 2 | 3 | Successful steps reset the budget; waits consume it; other actions never recharge it; creatures still act |
| Rift Sense | Reveal new floor's rift | Rift + stairs | Rift + stairs + chests/vaults | Marks known landmark cells, not connecting routes; rank I is mostly redundant with normal spawn reveal |
| Second Wind | +10 light on descent | +20 | +30 | Capped, not a new turn |
| Hungry Flame **Risky** | +6 damage, +20% step cost | +12, +30% | +18, +40% | Cost multiplier applied after the capped step discount |

The +2 baseline damage per level is independent of Heavy Blow/Hungry Flame. An upgrade adds only the rank delta.
Last Flicker/Interrupt allowances are totals for the whole descent; upgrading does not reset spent uses.
Stone Ward resets its spent-use counter on floor entry, and upgrading increases only the current ceiling.
Free Momentum steps still advance turns, wards, regeneration and AI; Deep Breath only removes the wait's light cost.
Last Flicker resolves after the current turn, before fallback Night Vision; death discards pending choices.

## Offers, slots and replay

- `src/game/level-perks.ts`: canonical IDs, names, next-rank text, ranks, slots, counters, offer generator and bot policy.
- The private Mulberry32 stream is seeded from an FNV-style hash of `seed:level:perk`. It never reads or advances
  the main descent RNG. Making a choice itself changes no RNG, creature position/phase, step count or turn cost.
- Before four slots are used, any non-maxed perk is eligible. At four slots, only upgrades of those four are eligible.
  Options are distinct; fewer than three are shown when necessary. Zero options means baseline-only level rewards.
- Gaining multiple levels queues their level numbers; each choice rolls after the prior one, using the then-current
  ranks/slots. There can be at most twelve total rank selections before the four slots are exhausted.
- `src/game/run.ts`: `{type:'perk',id}` accepts only an offered legal next rank. All other actions return the same
  state while the choice is pending. Invalid/no-choice/max-rank/fifth-slot picks return the same state.
- `src/game/replay.ts`: compact `K<id>` move codes. Replay rejects invalid picks and any other action while a choice
  is pending. `server/attest.ts` turns these ReplayErrors into HTTP **422**, signing only the replayed result.
- All selected perks and counters are run-only. New descents start empty. No account economy/save migration was added.
- Old unfinished run saves load with empty/default perk fields and continue without retroactive choices. Their old
  rule-version tape is disabled for attestation rather than falsely certified; start a fresh descent for new records.

## UI and art

`src/components/level-perks.tsx` provides the controlled, non-dismissible choice dialog and four-slot bottom bar.
Cards show the next rank I/II/III, one concise effect, new slot N/4 versus Upgrade, and the Hungry Flame risk flag.
Keys 1/2/3 are captured by the dialog before potion shortcuts. Mouse/touch and keyboard choices use the same action.
The bottom bar displays remaining Last Flicker, Interrupt and Stone Ward uses, with hover/focus/tap descriptions.
The log and D-pad sit above the bar; the phone layout was checked at **375×812**. Free steps/waits and charged
Riposte have HUD badges; the rift walking estimate accounts for already-earned Momentum steps.

Level-up uses the existing approved cue. Accepting a perk uses `buy`. Interrupt shows **INTERRUPT**, not a false
creature strike/sound. Stone Ward uses the Ward feedback, including simultaneous normal-block/boss-hit cases.
Rift Sense III chests remain drawable on their known cells outside the current lantern radius.

**No artwork was generated.** Distinct temporary code icons are active because the owner's atlas is absent.
The complete owner prompt is **P-perks** in `docs/art/PROMPTS.md`, one 5×3 sheet in the mob palette.

```powershell
node scripts/sprite-sheets.mjs perks
```

Input: `art/perks/raw/perks.webp`; output: `public/perks/perks.png`, **160×96**, fifteen 32×32 cells.
The importer finds each cell's tight content, removes magenta and boundary fringe, fits it with nearest sampling
and maps to `art/palette/mobs.json`. Restart dev/rebuild after adding the atlas; the build-time presence flag avoids
missing-file 404s. Tests cover both fallback and atlas UI paths, all cell positions, palette and transparent matte.

## Balance: before → after

Same deterministic seed sets and bot/loadout definitions. “Unperked” below means no **starting loadout** perks;
after this change every bot selects level perks. Collector numbers are the generated 80-seed economy table, rounded
by that report. Prices, loot, enemy drain, pools, payout ceilings and existing guard thresholds are unchanged.

| Collector | Gold banked / cent | Mean deepest floor | Deaths |
| --- | --- | --- | --- |
| 1 flask | 2.19 → **4.48** | 1.3 → **1.9** | 3% → **3%** |
| 2 flasks | 5.48 → **10.18** | 2.9 → **4.1** | 6% → **4%** |
| 3 flasks | 7.05 → **10.92** | 3.8 → **5.1** | 6% → **11%** |
| Strongest loadout, mature lock, 3 flasks | 13.43 → **19.50** | 5.8 → **6.9** | 16% → **14%** |

| Diver, chosen tuning, 40 seeds | Mean deepest floor | Reaches Cerberus floor |
| --- | --- | --- |
| 1 flask | 4.8 → **5.8** | 13% → **38%** |
| 2 flasks | 5.0 → **6.6** | 18% → **48%** |
| 3 flasks | 5.2 → **6.7** | 30% → **50%** |
| 5 flasks | 5.8 → **6.8** | 55% → **55%** |

The bots use a fixed legal priority: Steady Wick, Oil Thief, Ember Heart, Last Flicker, Momentum, Second Wind,
Stone Ward, Heavy Blow, Thick Coat, Interrupt, Riposte, Deep Breath, Wide Glass, Rift Sense, Hungry Flame.
They resolve free choices before planning the next turn; choices do not consume their turn-loop budget.
These are specific bot policies, not optimal play or human forecasts. The non-dodging diver still tends to travel
deeper than the dodging one; do not read that as evidence that human dodging is bad.

**Why Steady Wick changed:** at requested 10/20/30%, the unchanged 40-seed fog-vs-omniscient guard measured
7.65472 versus 11.80111 gold/cent, a **54.17% gap** (limit 39%). Controlled effect ablation identified the step
discount as a driver; 9/18/27% still gave 55.65%. At **8/16/24%**, the same comparison is **9.15278 / 10.73028**,
a **17.24% gap**, passing the unchanged guard. No threshold was relaxed and no price/loot change was used.

**Crowd calibration:** the old `FIELD_GOLD_PER_CENT=5.2` failed the unchanged 70–100% mixed-bot guard.
The measured 70/20/10 mix banks **11.62935** gold/cent; **9.9** is approximately **85.1%** of that figure.
This changes simulated competing gold, not spend, prices, loot, the pool split or total available payouts.
The unchanged +25% second-flask advantage and strongest-build bounds pass.

Before snapshots are local `artifacts/perks/{economy,light}-before.md`; their committed source is parent `7419872`.
Full final tables are `docs/economy-report.md` and `docs/light-tuning.md` (including a separate perk-refill column).

## Ember Pot implications

No level perk directly multiplies gold or creates a payout. **All fifteen can indirectly change carried-out gold**:
Oil Thief/Steady Wick/Ember Heart/Last Flicker/Momentum/Thick Coat/Stone Ward/Deep Breath/Second Wind extend light
or survival; Riposte/Heavy Blow/Interrupt/Hungry Flame alter combat efficiency; Wide Glass/Rift Sense alter information
and routing. Rift Sense I is already covered by normal spawn reveal; Hungry Flame can also reduce returns through
its higher step cost. Death prevention can preserve a whole bag of gold, not merely add a small amount.
Future Ember Pot comparisons must account for starting loadouts, server-issued seeds and these deterministic
offers/choices; this change does not complete the separate equal-loadout/prize-mode work.

## Validation and captures

- `npm run typecheck`, `npm run lint` (only three existing Fast Refresh warnings), `npm test -- --maxWorkers=2`,
  `npm run build`, `npm run server:build`, `npm run tuning`, `npm run economy` pass.
- **533 tests / 50 files**: every perk at every rank, limits/queues/RNG, charges, legacy save recovery,
  real replay, HTTP attestation rejection, interrupted/blocked feedback, fallback/atlas import and all old guards.
- On this Windows sandbox, tests use a writable shared TEMP/TMP under `artifacts/perks/tmp` to avoid worker-cache
  ENOENT errors. No dependency install or lockfile change was necessary. Contracts are unchanged.
- Edge: seed **7**, real replay over generated floors, no injected XP, ranks or grids. Five choices reach level 6,
  first four fill four different slots, then Oil Thief upgrades to II. Mouse and number-key choices, Escape/outside
  click rejection, frozen input, real touch taps/descriptions and non-overlap of bar/log/potions were checked; no console errors.
  QA uses production-default oil in memory, without editing the owner's optional local `.env` oil-preview setting.
- Screenshots: `docs/screenshots/perks-{desktop,phone}-{choice,bar}.png`.
- Playwright videos (local, ignored): **`artifacts/perks/perks-desktop.webm`**, **`artifacts/perks/perks-phone.webm`**.
  They show real actions, choices, the filled bar and subsequent gameplay. Videos are intentionally silent.
- Browser details: `artifacts/perks/browser-qa.json`; route: `artifacts/perks/browser-route.json`.

Reproduce after starting `npm run dev`:

```powershell
$env:SMOKE_CHANNEL='msedge'
$env:TEMP=Join-Path (Get-Location) 'artifacts\perks\tmp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
node node_modules/vitest/vitest.mjs run --config vitest.perks.config.ts
node scripts/perks-smoke.mjs http://127.0.0.1:5741/
```

**Release:** this changes `src/game` and replay. Before publication the owner must rebuild/release the **signing
server and site together**: **`attest.sh` and `deploy.sh`**, then start fresh descents. Nothing was pushed/deployed,
no contract changed, no keys were accessed, and one local commit contains this feature.
