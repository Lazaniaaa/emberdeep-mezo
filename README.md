# Emberdeep

A pixel dungeon crawl with a **simulated USDC economy**, where the descents you bring home are replayed, signed and
recorded on **[Arc](https://arc.io)**, Circle's stablecoin-native chain.

**Play:** https://64-176-72-12.sslip.io &nbsp;·&nbsp; **Hall of Descents on Arc mainnet:**
[`0x0b03e2c77fee4edac4c51a5be04df7175d7b423a`](https://explorer.arc.io/address/0x0b03e2c77fee4edac4c51a5be04df7175d7b423a?tab=contract)
(source verified on the Arc explorer)

> **What is on chain, and what is not.** Balances, payouts and character mints are simulated USDC kept in your
> browser's `localStorage`; nothing there moves real money. The one thing written on chain is a descent you choose to
> record in the **Hall of Descents** on Arc mainnet: the game's server replays it move by move, signs the result, and
> your wallet sends it to the contract (gas is a fraction of a cent of USDC). See [On Arc](#on-arc-the-hall-of-descents).

<p align="center">
  <img src="docs/screenshots/descent.png" alt="A descent: a husky delver with a lantern fights a Cave Spider; the light bar, level and loot on the left, potions on the right" width="720">
</p>
<p align="center">
  <img src="docs/screenshots/camp.png" alt="The camp: the fire, the buildings and other delvers walking around" width="480">
  <img src="docs/screenshots/descent-mobile.png" alt="A descent on a phone, with the on-screen arrows" width="190">
</p>

## The camp

The lobby is a painted underground camp that fills the whole screen; there is no website around it. Your balance, the round
pool and your wallet sit in a HUD along the top. Your character walks around a fire-lit stone plaza, waterfalls, crystals and seven buildings. The painting uses a
48 x 32 grid of 32 px tiles, with traced collision and depth-sorted silhouettes; delvers pass behind tall scenery. Press **E** next to one, tap it, or use the icon rail on the left:

| Building | What it does |
| --- | --- |
| **Dungeon Gate** (big **PLAY** button) | Pick who descends, buy oil and entry keys, light the lantern and go down |
| **Ember Altar** | Mint a Delver, lock it, send it on an expedition |
| **Armory** | Weapons, armor, potions, crafting with crystals |
| **Draw Board** | The weekly draw for free Delver mints, your tickets and the passes |
| **Vault** | The reward round, where every dollar goes, your session |
| **Welcome Board** | How a descent works in four steps |
| **Hall of Delvers** | Your own records, and the way into the Hall of Descents on Arc |

The HUD shows your keys, crystals and tickets, and the current round with your share of the gold. Your selected
character (the Wanderer or one of your Delvers) is the one you see walking. Tap the ground and your delver walks there
by itself; tap a building and it walks up and opens it.

Other delvers wander the camp with name tags and chatter, and Old Ember by the gate hands out tips.
**They are simulated ambience, not other players.** They hold nothing and never touch the economy.

The original **Lanterns Below** soundtrack is synthesized locally after your first click or keypress. The sound button mutes music and effects; music pauses in a hidden tab. No external music or samples are downloaded. See [audio notes](docs/audio.md).

## The loop

1. **Get in.** A descent needs an **entry key** ($0.50). New saves start with three, and $20 of simulated USDC.
2. **Fill your lantern.** Buy oil flasks at camp ($0.20 each, 80 light per flask). Starting light, including the Delver's start-light perk,
   is also the lantern's capacity. Refills cannot exceed it: excess oil is lost. Oil Vials and Healing Draughts used at full light stay in the bag.
3. **Descend.** The descent fills the whole screen like the camp. Floors 1-7 have authored layouts: 1-2 use 32px catacombs tiles, 3-4 mycelium tiles, 5-7 painted art
   (floors 1-3 are 60% larger than the rest), deeper floors are generated, and all of them sit under fog of war. Every step
   burns light. Vision stays at radius 5 until light drops below 25; then it narrows at 20, 10 and 5 light.
4. **Push or pull out.** Deeper floors multiply loot (+40% per depth) but each step burns
   more light. Walk back to the rift you arrived through to extract.
5. **Lose the light, lose the loot.** If your light and Night Vision run out, you wake up at
   camp empty-handed. Your gold counts for nobody, so the pool is shared among those who got home.
6. **Extract.** Gold you carry out is banked for the current reward round. Crystals craft
   potions and weapons. Soul Sigils mint free characters.
7. **Record it on Arc (optional).** The run report offers **Record on Arc**: the server replays your descent, signs it,
   and your wallet writes it to the Hall of Descents, the public leaderboard (the trophy in the header).
8. **Close the round.** The round's pool is shared by gold: hold 1% of all the gold and you take
   1% of the pool, up to 160% of what you put into descents that round (keys and oil).
9. **Lock (optional).** Perks you only hold work at 60% strength. Lock a Delver or stake some USDC at the Ember Altar
   and the perk grows with every round closed, and the lock farms a share of the lock pool. See [Locks](#locks).
10. **Expedition (optional).** Send a Delver away for $1 plus an optional pack. It comes back with a
    random haul of keys, tickets and gold, or with nothing. See [Expeditions](#expeditions).

**Creatures.** Nine kinds of creature live in the deep (Waxling, Cave Spider, Lantern Moth, Skeleton Archer,
Wisp, Stone Golem, Skull Crab, Spore Shroom, Imp), with more of them the deeper you go:
six on depth 1, one more each depth. They hit back, but never without warning. A creature that reaches you
*winds up*: the tiles its blow will hit get a red ring (a line for some, a cross around it for others) for one or two
turns. Step off the rings and the blow lands on nothing, and the creature is left open for a turn. Stay on
them and the blow drinks your light. Bump into a creature to attack it; your weapon decides how many swings it
takes. Kills drop a little gold, some experience and sometimes oil (35% with a full lantern, up to 80% when it is nearly out; 5-10 light).

**Smash things.** Urns, crates, barrels and, from floor 2, old sacks stand in the rooms (about seven a floor, and never
where they would shut a route, nor beside the stairs or the rift). Gold, crystals and oil never just lie on the floor:
a floor's piles are hidden in its props, mostly one kind to a prop, and creatures drop the rest. Walk into one to hit it: an urn or a sack breaks at the first blow, a crate or a barrel cracks and breaks
at the second, whatever your weapon. A blow (at a prop or a creature) costs a turn but no light; only steps burn it. Something always falls out and you see it hop out: **one kind of loot, sometimes two** (gold, **oil** or
crystals), plus experience, and from crates, barrels and sacks now and then a piece of **gear**. The emptier your
lantern, the likelier the loot is oil. A Clay Urn sometimes gives two kinds, a Wooden Crate often
gives two, an Iron-bound Barrel always gives two, and an Old Sack holds mostly gold and crystals. Gear is a Rusty Sword (+6 damage), a Hand Axe
(+5) or a Miner's Pickaxe (+4, and it breaks any prop in one blow); each lasts for the descent, and a second copy
turns into experience.

**Levels.** Every descent starts at level 1 and there are 15. Experience comes from breaking props (1-7 each), defeating
creatures (2-5) and opening chests and vaults. Each new level raises capacity by **10**, pours **10 light** into your lantern and adds **2 damage**
to every blow (a dagger hits for 16, so level 5 is 24). The level bar is under the lantern, and the level is lost
with the descent. The light HUD shows current / maximum. Choosing a buff on each level-up is planned; for now a level adds capacity, oil and damage.

Depth 7 ends in an arena guarded by **Cerberus**, a three-headed hound four times the size of a creature
(2x2 tiles, 150 HP, where ordinary creatures have 12-70). It seals the stairs and moves at half a creature's pace.
It marks the eight cells along its body edges, winds up for one turn, strikes for **40 light** before protection,
then recovers for **two turns** without moving or draining. Step off the marked cells, then attack during recovery.
When it falls it leaves a **Cerberus Hoard** chest where it stood: gold and
crystals, a Healing Draught, a Rage Potion and a 40% chance of a Soul Sigil. Walk over the chest to open it.
The stairs then open onto the endless floors below; you can also skip the fight and leave through the rift.
A Ward Charm makes Cerberus harmless for 15 steps, enough for a Rusty Dagger to take about ten swings.

## Economy

Money is simulated USDC. The game counts it in cents, so every rule below is exact to the cent.

| Rule | Value |
| --- | --- |
| Share of every dollar spent (keys, oil, potions, weapons, passes, mints) that goes to the round pool (shared by descent gold) | **60%** |
| Share that goes to the lock pool (shared by locked Delvers and stakes) | **7%** |
| Share that is the studio's revenue | **33%** |
| Entry key (one per descent) | $0.50 |
| Share of the pool you take | your gold ÷ all gold banked in the round |
| Return cap | at most **160%** of what you put into descents that round (+60% at best) |

- **No fixed rate.** The game never says "1 gold = $N". A round's pool is 60% of everything spent in it (another 7%
  goes to the lock pool, so 67% goes back to players in total), gold is only found by playing, and when the round
  closes each delver receives the same percentage of the pool as their percentage of the gold. What you get depends
  on how much everyone else brought home. Payouts are rounded down, so nothing is paid beyond the pool.
- **Return cap.** Nobody takes back more than 160% of what they put into descents in a round (entry keys
  plus oil, deaths included), so a top build earns a bounded edge a round at best, not a multiple. What the
  cap holds back stays in the pool for the next round.
- **The studio's 33%** pays for the game: development, the server, and the gas of the Hall of Descents on Arc. It is
  the business model, stated plainly; players' returns come only from the other 67%.
- There is no token and no emissions. Payouts only come from what players already spent.
- Gold from a run that ends in the dark counts for nobody. That money stays in the pool and raises
  the share of every delver who made it home.
- Crystals, weapons and characters can't be redeemed for money, so they need no reserve.
- Vault: **Close round and claim** settles the round, **Add a simulated crowd** adds other
  delvers' spend and gold. Every new round opens with a simulated crowd already in it.
- `src/game/sim.ts` has two bots: one that sees the whole map and one that plays under fog of
  war. These scripted bots dodge known warnings; their results are a model of play, not a forecast.
  A 2-flask delver with no perks banks about 5.6 gold per cent spent (key included). The
  simulated crowd banks 5.2, a little below what a 70/20/10 crowd of unperked, Delver-holding and
  top-build bots banks (a test checks it stays between 70% and 100% of that), so a lone delver in the demo is
  measured against a crowd with good gear. Real players make mistakes the bots do not, so the true figure is probably
  lower, and the cap covers that case.
- Because everything is shared out, the round pool never pays back more than its share (60%) of
  what was spent. Balance is therefore about who takes it. Against the demo's crowd an unperked
  delver gets about 65% of their spend back, a held Rare Prospector about 73%, and the strongest build (Legendary
  Pathfinder, 3 flasks) about 97% while merely held, 118% once locked for 10+ rounds and 128% with a full stake as
  well, funded by the others. The 160% cap stops anything above that. The edge shrinks as more players use it (78%
  when half the crowd runs the locked build). `npm run economy` regenerates the tables, including how the
  results move with the crowd's skill and size and what locks farm:
  [docs/economy-report.md](docs/economy-report.md).
- Step discounts act like extra light, so their total is capped at 40%.
- `npm test` checks the settlement maths and simulates a mixed crowd.

### Weekly Delver draw

Each week **three Delvers are minted free** for the holders of the winning tickets. Nothing is bought for the draw:
a win is a mint from the fixed supply, with its rarity rolled like a Soul Sigil's (62% Common, 27% Rare, 9% Epic,
2% Legendary; sold-out rarities are skipped).

Tickets are not sold. Gold, crystals, chests, vaults and creature kills drop one 3% of the
time. You only keep a ticket if you extract; dying leaves it in the dark. A weekly pass
raises that rate and is itself spent through the 60/7/33 split:

| Pass | Price | Ticket drop |
| --- | --- | --- |
| Free | — | 3% |
| Ember Pass | $5 for the week | 4.5% |
| Deep Pass | $10 for the week | 6.5% |

Upgrading from Ember to Deep costs the $5 difference. A Delver from the draw is yours like a minted one.

The Draw Board has **Add a simulated week of play** so the draw can be seen in one session.
Live, that button is a weekly job.

### Characters (Delvers)

Mint at the **Ember Altar**. The class is random within the rarity you choose.

| Rarity | Price | Supply (fixed) | Full-strength perk (Prospector example) |
| --- | --- | --- | --- |
| Common | $1 | **999** | +15% gold |
| Rare | $2.50 | **111** | +25% gold |
| Epic | $6 | **69** | +40% gold |
| Legendary | $15 | **11** | +60% gold and +1 light radius |

These perks are the full-strength values. A Delver you only hold works at 60% of them (a Legendary
Prospector gives +36% gold, and its light radius bonus is not yet in effect); locking it brings the perk
back to 100% after four rounds and up to 130% (+78% gold) after ten.

Every Delver has a portrait (a bust in its class colors on a rarity-colored backdrop; epics wear a gem,
legendaries a crown) and an edition number such as `#39/69`. Supply is a hard cap. Part of it counts as
already minted by the simulated community (640 / 71 / 38 / 5), so the Altar shows how many are left.
Soul Sigils and draw wins skip any rarity that is sold out.

The six classes are Prospector (gold), Crystal Seer (crystals), Lamplighter (starting light),
Pathfinder (cheaper steps), Duelist (damage) and Scavenger (more chests and vaults).

Sealed Vaults appear from depth 3. Each one holds a **Soul Sigil 30% of the time**. Carry it
home to mint a free character.

### Locks

Perks are weak when you just hold them and grow when you commit. Locks are **simulated**: nothing is
escrowed and nothing leaves your wallet. A lock is a commitment that ages by **closed rounds** (the
Vault's button in the demo, a schedule live). You can lock:

- **A Delver** (counts as its mint price: $1 / $2.50 / $6 / $15).
- **A stake** of up to $50 in steps of $5. It leaves your balance but is yours to take back, is never spent, and adds
  up to +8% gold (before growth).

| Rule | Value |
| --- | --- |
| Perk strength when only held | 60% |
| Perk strength of a fresh lock | 80%, then +5% per closed round, to a cap of 130% (100% after 4 rounds) |
| Lock pool | 7% of every dollar spent, shared by passive gold (value in cents × 0.1 × strength), apart from the round pool |
| Mature | 4 closed rounds: what it farmed can be harvested and the lock released for free |
| Break a lock early | forfeit 50% of what it farmed (back to the lock pool) and pay a fee of 10% of its value (studio revenue) |
| Draw tickets | a quarter of a ticket per round for your first two Delver locks, nothing for a stake |

Locking never takes anything from someone who plays: descents share the round pool, locks share the lock pool,
and both are funded by spend, not by new tokens. In the demo's crowd a lock farms roughly 0.9% of its value
per round, and the cut falls as more lockers join (see the sensitivity tables in the economy report). The
crowd's 16,000 passive gold a round is an assumption, like its gold per cent.

### Expeditions

Instead of going down the cave, a Delver can be sent into unmapped land (Ember Altar, Expedition tab). It is
never lost: it either comes back with a haul or empty-handed. While it is away it cannot descend.

| Rule | Value |
| --- | --- |
| Cost | **$1**, plus an optional pack |
| Split of the price | **55% to the round pool, 45% studio revenue** |
| Away for | **5 seconds in the preview** (a live version would be a few hours up to a day); the trip is decided when the Delver leaves, so reloading cannot re-roll it |
| Chance to come back with a haul | No pack 45%, Scout Pack (+$0.30) 58%, Ranger Pack (+$0.60) 70%, Vanguard Pack (+$0.90) 82% |
| The haul | ×0.6 to ×15 of a basic haul (1 key, 1 ticket, 120 gold); 84% Common (×0.6–1.2), 12% Uncommon, 3.2% Rare, 0.7% Epic, 0.1% Legendary (×10–15) |

Hauls are never money. Keys and tickets go to your stock (up to 30 keys), and gold joins the round like gold from a
descent, so the 160% return cap applies to it. Trip spend does not count toward that cap. The average haul is worth
about half of what the trip costs at every pack tier, so an expedition is a sink with a lottery ticket attached
(numbers in [docs/economy-report.md](docs/economy-report.md), section F). Packs buy a steadier trip, not a better deal.

### Weapons, armor and potions

Every item has its own picture in the Armory, the gate and the potion bar.

| Item | Cost | Effect |
| --- | --- | --- |
| Rusty Dagger | $0.60 | 16 damage |
| Iron Sword | $1.50 + 20 crystals | 24 damage |
| Emberblade | $4 + 60 crystals | 40 damage, +4 light per kill |
| Leather Vest | $0.80 + 10 crystals | Creatures drain 15% less |
| Chain Mail | $2.20 + 30 crystals | Creatures drain 30% less |
| Emberplate | $5.20 + 70 crystals | Creatures drain 45% less |
| Night Vision | $0.30 or 12 crystals | Triggers automatically when your light dies: 25 more steps |
| Oil Vial | $0.15 or 6 crystals | +30 light |
| Flare | $0.25 or 10 crystals | Reveals the whole floor |
| Ward Charm | $0.25 or 10 crystals | Creatures' blows and Cerberus can't drain you for 15 steps |
| Rage Potion | $0.40 or 16 crystals | +80% damage on your next 5 blows |
| Regeneration | $0.10 or 4 crystals | +1 light on each of the next 5 turns |
| **Healing Draught** | **not sold** | +60 light at once. Drops only in chests, Sealed Vaults and the Cerberus Hoard, and is lost if you do not extract |

Armor stacks with class perks up to the shared 80% drain cap.

## On Arc: the Hall of Descents

**Live on Arc mainnet** (chain 5042) since 2026-10-14: the Hall is
[`0x0b03e2c77fee4edac4c51a5be04df7175d7b423a`](https://explorer.arc.io/address/0x0b03e2c77fee4edac4c51a5be04df7175d7b423a?tab=contract),
its source verified on explorer.arc.io (exact match), with the game's signing server running beside the site.

A descent that came home can be written to **Arc mainnet** with one signature from the player's wallet (gas is a
fraction of a cent of USDC), and the Hall keeps each player's best descent, which makes a public leaderboard (the trophy
in the header). A record
cannot be made up: the game keeps every move, the game's server replays the whole descent from its seed before it
signs the result (EIP-712), and the contract (`contracts/EmberdeepHall.sol`, Solady, about 5 KB) takes no record
without that signature, credits it only to the player it was signed for, once per descent and before the signature
runs out. It
holds no funds and makes no external calls.

**Why Arc.** A record is a micro-transaction a player makes after every good descent, so its cost must be tiny and
predictable: Arc charges gas in USDC (a record costs well under a cent, in dollars rather than a volatile token) and
settles in under a second, so the record lands before the player has closed the run report. The game's whole economy
is already denominated in USDC, so the next on-chain steps (entry keys and the round pool as USDC on Arc) need no
token of their own.

How it works, what it does and does not prove, the tests and the deployment steps: [docs/arc/README.md](docs/arc/README.md).

## Run locally

Requires Node.js 22+.

```sh
npm install
npm run dev        # http://localhost:5741
```

Other scripts:

```sh
npm test             # economy, dungeon, run rules, balance sim, replay, the Hall contract and its signing server
npm run typecheck
npm run lint
npm run build        # static site in dist/ (relative paths, host anywhere)
npm run hall:compile # compile contracts/EmberdeepHall.sol into contracts/out/
npm run server:build # build the attestation server into server-dist/attest.mjs
node scripts/optimize-maps.mjs  # rebuild public/maps/*.webp from the originals in art-src/maps (applies scripts/map-patches.mjs and redraws the floors on the tile grid with scripts/floor-regrid.mjs)
npm run economy      # regenerate docs/economy-report.md (a few minutes, deterministic)
npm run tuning       # regenerate docs/light-tuning.md: how far an amount of oil carries a descent (a few minutes)
npm run smoke        # headless browser pass; needs `npx playwright install chromium` and a running dev server
```

`npm run smoke -- <url>` also works against a deployed build. To use an installed Edge or Chrome
instead of downloading Chromium, set `SMOKE_CHANNEL=msedge` (or `chrome`).

## Deploy

The build in `dist/` is a plain static site. `deploy/README.md` walks through hosting it on a small Vultr server
(one setup script, one upload command, free HTTPS). The Hall of Descents adds one small Node service on the same
server (`deploy/attest.ps1`); see [docs/arc/README.md](docs/arc/README.md).

## Controls

- **Camp:** WASD or arrows to walk, E / Enter / Space to open the building you face.
  Tap a building to open it, or tap the ground to step toward it.
- **Dungeon keyboard:** WASD or arrow keys to move, Space to wait, E or Enter to descend or extract,
  1–7 for potions.
- **Touch:** on-screen D-pad, or tap the side of your character you want to step toward.
- Mute and reduced-motion toggles are in the header. Reduced motion also follows your OS setting.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), zustand, viem and Vitest. The Hall of Descents
contract is Solidity 0.8.28 on Solady, tested in an in-memory EVM (ethereumjs); its signing server is plain Node.
The game is rendered on Canvas 2D. The camp and floors 5-7 use painted WebP art; floors 1-2 use 32px catacombs tiles and floors 3-4 mycelium earth tiles. These tiled floors have three-cell corridors and open-floor exits. Delvers, creatures and loot use pixel sprite sheets. Portraits and UI icons are drawn in code. The camp has animated fire, light, crystals and water, with a code-drawn fallback if its painting cannot load. See the [catacombs](docs/art/catacombs-tiles.md) and [mycelium](docs/art/mycelium-tiles.md) art pipelines to rebuild their atlases.

## Integration notes for the next on-chain steps

- Keys, oil, potions, weapons and mints would become USDC transfers on Arc split by a contract: 60% to a
  reward-pool vault, 7% to a lock-pool vault and 33% to the studio.
- Round settlement needs a trusted source for each delver's gold, because the dungeon runs client-side.
  The replaying server built for the Hall of Descents is that source: it already turns a run log into a
  signed result a contract can check.
- Expeditions would run on block timestamps with verifiable randomness for the roll; the trip is currently decided
  in the browser when the Delver leaves and stored, which a tampered client could edit.
- Locks would escrow the Delver or the stake in a contract and age by scheduled rounds. Farmed money is paid out of
  the lock-pool vault when a lock matures or is released; an early exit sends the forfeited half back to that vault.
- Delvers would be an ERC-721 minted by the altar contract. Sigil drops and the weekly draw would need the
  same randomness source.

## Credits

Built with AI assistance (Claude). Fonts Geist and Silkscreen (SIL OFL) via Fontsource. See [NOTICE.md](NOTICE.md).

## License

MIT, see [LICENSE](LICENSE).
