# Mezo Buildathon Wave 2 — texts for the AKINDO submission

Deadline: Sunday 2026-11-15, 15:00 UTC (17:00 Kyiv). Copy each block into the matching field. Everything marked
**TODO** must be replaced before Submit; a claim whose proof is still TODO must be deleted, not submitted (in Wave 1
the judge cut Materials for projects whose texts described more than the chain showed).

Before Submit, open every link below in a private window: the site, the repo, the deck and the video must open without
signing in. A deck that does not open capped Materials at 1 in Wave 1, and so did a video longer than 2:15.

## Links

- Live (Mezo Testnet): https://108-61-197-158.sslip.io
- Code: https://github.com/Lazaniaaa/emberdeep-mezo
- Pitch deck (PDF in the repo): https://github.com/Lazaniaaa/emberdeep-mezo/blob/main/docs/emberdeep-deck.pdf
- Video (2:00): TODO
- Proof on chain (every step as a transaction): https://github.com/Lazaniaaa/emberdeep-mezo/blob/main/docs/PROOF.md
- Contracts (chain 31611), all verified on the explorer:
  EmberPotV3 `0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c` · EmberKeyRouter `0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a` ·
  EmberItems `0xc36a4c19760dc368c719eba29159d639b2f62362` · EmberMarket `0x4c598c2146a30b9595b3c224c47fae13ba7a4a04` ·
  Hall of Descents `0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6` · quick test pots (5 and 10 min rounds)
  `0xff019fbb3ddc88163d605ca2a0abdb879ccfedc8` · `0x8c91e96c4e846377c95212617bbf58556d39fcb3`

## Project name

Emberdeep

## Project category (3-5 words)

Bitcoin-backed game economy

(If the field wants several short categories: Game · Prize pool · NFT marketplace.)

## TL;DR (one sentence)

A skill roguelike whose whole economy runs on Mezo: borrow MUSD against BTC from inside the game, play for a weekly
MUSD prize pool, win weapon NFTs, and trade them for MUSD, BTC or MEZO through Tigris, with a share of every sale
flowing back into the pool.

## Track

Both. Track 2 (Access and Distribution): a game is a reason to open a first trove and hold MUSD, and it does it for
the player in one click. Track 1 (DeFi): the loop composes Mezo borrowing, Tigris swaps and an on-chain market into
one cycle.

## Chain deployed on

Mezo (Testnet, chain 31611).

## Project status

An existing game with new features built during the hackathon. The roguelike existed before; everything on Mezo was
built in the two Waves. Wave 1: the MUSD prize pool, the BTC/MEZO key router through Tigris, gasless claims, the Hall
of Descents. Wave 2: see "What changed since Wave 1".

## Project readiness

Testnet deployment, live and playable end to end: the site, the server and all four Wave 2 contracts are up (checked
15 November).

## How it works

**The problem.** A Bitcoin holder on Mezo can borrow MUSD without selling BTC, but has few everyday reasons to: MUSD
needs places to be spent and earned that are not another yield page. And games that could be that place usually pay
players in a token they print, so the first players win and the game dies.

**What Emberdeep is.** A browser roguelike: you go down a cave with a lantern, light is your only resource, and you
carry gold home through the rift before the dark takes you. Prizes are real and come only from players: a prize key
costs 1 MUSD, 80% of it goes into the week's pot, and when the week ends the pot is paid out by gold, automatically,
to the players' wallets. No game token. Nobody, us included, can take the pot out.

**The loop on Mezo, one cycle:**

1. **Borrow or buy.** No MUSD? The game opens a Mezo trove for you in one transaction
   (`BorrowerOperations.openTrove`, your BTC as collateral, at a safe 65% loan-to-value), or borrows more from the
   trove you have (`adjustTrove`). Or pay for the key with BTC or MEZO: `EmberKeyRouter` swaps it to MUSD on Tigris
   and buys the key in the same transaction.
2. **Play a prize descent.** Everyone starts with the same kit.
3. **Claim.** The server replays every move of the deterministic game and signs only the true result; its relayer
   records it in the pot and pays the gas.
4. **Open the chest.** Slew Cerberus? The claimed descent earns a chest: a weapon NFT (`EmberItems`, ERC-721),
   minted to your wallet. One chest per pot record, so every chest cost a key.
5. **Carry it or sell it.** `EmberMarket` holds listings in escrow, priced in MUSD. A buyer pays MUSD, or BTC or
   MEZO swapped on Tigris inside the same transaction.
6. **5% of every sale goes into the week's pot** through `EmberPotV3.fund()`, so trading weapons grows the prizes.
7. **The week ends.** `distribute` pays everyone by gold. Anyone can call it, so a server outage cannot hold it back.

## How it uses Mezo, by depth of integration

We read the Wave 1 feedback as a ladder and built up it. In order:

- **MUSD as the unit of account (transactional).** Key price, the pot, payouts, weapon prices and the Market's fee
  are all canonical MUSD (`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`). No mock token anywhere.
- **Tigris in two places (one protocol touchpoint, used twice).** Keys and weapons can both be paid in BTC or MEZO:
  the router and the Market swap through the BTC/MUSD and MEZO/MUSD pools inside the buying transaction and return
  leftover MUSD.
- **Mezo borrowing from inside the game (composing Mezo's own contracts).** The game calls Mezo's
  `BorrowerOperations` directly: `openTrove` with BTC attached, or `adjustTrove` on the player's trove. It sizes the
  loan the way Mezo will judge it: the BTC price from Mezo's own PriceFeed (not from a pool), `minNetDebt`, the gas
  compensation and the borrowing rate read from the contract, the player's trove from
  `TroveManager.getEntireDebtAndColl`, and list hints from `SortedTroves.findInsertPosition`. The trove is the
  player's own, visible and repayable in Mezo's app.
- **One scenario across them.** trove → MUSD → key → pot → chest NFT → Market → Tigris swap → 5% back into the pot.
  The Market is not a side feature: its fee is a second source of the prize pool, shown in the pot window
  ("From Market sales") and counted on chain (`fundedIn`).
- **The full cycle on chain.** Each step is in `docs/PROOF.md` with its hash: a loan from the game, keys in MUSD and
  in BTC through Tigris, claims, a chest NFT, Market listings and a sale with its 5% into the pot, and a round paid
  out by gold (`distribute`). A second wallet, not the deployer, bought keys and a weapon.

What we did not do yet: the pot's MUSD sits idle during the week. Putting it to work in a Mezo pool or the savings
vault was the judge's other suggestion; it changes the pot contract, so it is the first milestone below rather than
a rushed change three days before a deadline.

## Target group

Bitcoin holders who already use Mezo, or are one faucet away from it, and want something to do with MUSD other than
park it: desktop and mobile browser, an EVM wallet, no download. A prize descent takes five to ten minutes. The game
asks for a wallet only at the moment money is involved; practice descents are free and need none.

## Business model

The game earns from two flows, both in MUSD and both on chain. 20% of every prize key goes to the treasury; 80% is
the players' pot. The Market takes 5% of every weapon sale and sends it into the pot, which makes the pot worth
playing for, which sells keys. The treasury's 20% is what pays for the server that replays descents and for the
relayer's gas, so players claim and open chests without paying gas. Costs scale with claims, and so does revenue:
each claim spends a key. Nothing depends on a token or on emissions.

## Tech stack

Solidity 0.8.28 (Solady; the pot on OpenZeppelin), tested in an in-memory EVM (ethereumjs) and with Foundry.
TypeScript, React 19, Vite, viem, Canvas 2D. A Node signing server and relayer (EIP-712). 627 tests (`npm test`): the game
rules, the replay, the contracts in an EVM, the server, the relayer and the chest.

## What changed since Wave 1

Wave 1 feedback, point by point, and what we did with it.

1. **"Make MUSD do protocol work … let players open or top up a trove through BorrowerOperations to fund their
   keys."** Done. A player short of MUSD presses one button and the game opens a trove (`openTrove`) or borrows more
   on theirs (`adjustTrove`), with Mezo's own price feed, minimum debt, fee and list hints. It appears wherever the
   game asks for MUSD: buying keys and buying weapons. Proof: row 2 of PROOF.md (`adjustTrove` from the game,
   +100 MUSD); a wallet without a trove gets `openTrove` from the same button.
2. **"Show players other than the deployer wallet buying keys and a completed weekly distribute on-chain."**
   A second wallet, not the deployer, bought keys and a weapon (PROOF.md, "Outside players"). Payouts by gold are on
   chain: a quick test pot's round (row 15) and the Wave 1 pot's round 0 (row 16). The weekly pot's first round ends
   on 22 November and is paid out by the same loop.
3. **"Verify the three contracts on the explorer."** Done: all eight live contracts (the weekly pot, two quick test
   pots, the key router, EmberItems, EmberMarket, the Hall of Descents and the Wave 1 key router) are verified on the
   Mezo explorer; links in PROOF.md.
4. **"Use server-issued seeds so the result doesn't rest on trusting the operator."** Done: the server starts every
   prize descent (`/api/start`). It picks the seed and signs it with the player and the weapon they carry, and the
   Ember Pot takes no descent without that start. One start counts for one claim, and a player gets a new seed only
   every two hours or after a claim, so no one can shop for an easy map or replay a known one.
5. **"Add a pitch deck."** Done: the deck is a PDF in the repo, linked above, and the video is 2:00.
6. **"The Ember Pot is still a port of your Arc USDC pool."** The pot is now part of a loop that exists only on
   Mezo: `EmberPotV3` adds `fund()`, through which the Market pays 5% of every sale into the current week, and
   `fundedIn`, which the game shows.

New in Wave 2 beyond the feedback:

- **Found weapons as NFTs** (`EmberItems`): four kinds, four rarities, different play. Their metadata is served from
  the chain's data, so they show with picture and traits in wallets and on the Mezo explorer.
- **Cerberus chests**: only for a prize descent already claimed into the pot. The server rolls the chest from a
  secret keyed by the pot record, so replaying the same moves gives nothing new.
- **The Market** (`EmberMarket`): escrow listings in MUSD; buy with MUSD, BTC or MEZO through Tigris in one
  transaction; a seller can always take an unsold item back; the owner can only choose which collections list.
- **Found weapons in prize descents**: the server checks on chain that the player holds the item before it signs.
- **Quick test pots**: the same pot contract with 5- and 10-minute rounds, so a judge or a new player sees a key,
  a claim and the payout by gold in one sitting.
- **A one-page deploy and a reproducible server**, so the contracts keep trusting the same signer across servers.

## Honest limits

- Testnet only. The MUSD is test MUSD.
- A found weapon makes a prize descent easier (a stronger hit, more light, or more gold), so prize descents are
  equal in everything except the weapon. Weapons are earned by play or bought from players, never sold by us.
- The server is trusted to replay honestly and to keep the chest secret. A stolen signing key could mint items
  until the owner replaces it; a daily mint cap comes before mainnet.
- The server picks seeds and is trusted to pick them at random; its record of starts lives in memory, so a restart
  hands out new seeds.
- Built but not yet on chain: a first trove opened from the game, a key paid in MEZO, a weapon paid in BTC or MEZO,
  a prize descent carrying a found weapon (PROOF.md rows 1, 5, 12, 14).

## Future milestones

1. **Pot funds at work on Mezo** (December 2026): the week's idle MUSD in the MUSD savings vault or a Mezo pool,
   with the yield added to the prizes.
2. **Mezo mainnet** (Q1 2027), after the testnet weeks run cleanly: a 20% chest chance, a daily mint cap, Delvers
   as NFTs on the same Market, and Mezo Passport sign-in.

## Team

- Lazan1aa — solo builder: game design, contracts, frontend, server. X: https://x.com/NotYur ·
  GitHub: https://github.com/Lazaniaaa
- Built with AI assistance (Claude) for code review, tests and tooling; art generated by the owner.

Telegram: TODO · Discord: TODO · Email: the one on the AKINDO account.

---

## "Updates in this Wave" field (AKINDO limits it to 3,000 characters)

Paste this block. It is the short form of "What changed since Wave 1"; replace every TODO first.

```
Emberdeep, Wave 2 (Mezo Testnet). Play: https://108-61-197-158.sslip.io · Code: https://github.com/Lazaniaaa/emberdeep-mezo · Deck: https://github.com/Lazaniaaa/emberdeep-mezo/blob/main/docs/emberdeep-deck.pdf · Video (2:00): TODO · Proof, every step as a tx: https://github.com/Lazaniaaa/emberdeep-mezo/blob/main/docs/PROOF.md

What we did with the Wave 1 feedback
1. "Let players open or top up a trove through BorrowerOperations to fund their keys": done. One button in the game opens a Mezo trove (openTrove, BTC as collateral, 65% LTV) or borrows more on the player's (adjustTrove), sized with Mezo's own PriceFeed, minNetDebt, fee and SortedTroves hints. Shown wherever the game asks for MUSD: keys and weapons.
2. "Players other than the deployer, and a completed weekly distribute": a second wallet bought keys and a weapon; rounds paid out by gold on chain (a quick test pot, and the Wave 1 pot); hashes in PROOF.md.
3. "Verify the contracts": done, all eight live contracts; links in PROOF.md.
4. "Server-issued seeds": done. The server starts every prize descent and signs its seed with the player and weapon; the pot takes no descent without it, one claim per start.
5. "Add a pitch deck": done, a PDF in the repo; the video is 2:00.
6. "The pot is a port of your Arc pool": EmberPotV3 adds fund(), through which the new Market pays 5% of every sale into the current week.

New in Wave 2
- Found weapons as NFTs (EmberItems, ERC-721): 4 kinds x 4 rarities, with on-chain-read metadata, so they show in wallets and on the Mezo explorer.
- Cerberus chests: only for a descent claimed into the pot, one per record, so every chest cost a key.
- EmberMarket: escrow listings in MUSD; buy with MUSD, or with BTC or MEZO swapped on Tigris in the same transaction; 5% of each sale goes into the week's pot.
- Found weapons can be carried into prize descents; the server checks ownership on chain before signing.
- Quick test pots (5- and 10-minute rounds): the whole cycle, key to payout, in one sitting.

One loop, all on Mezo: borrow MUSD against BTC (trove) or swap BTC/MEZO on Tigris -> key -> prize descent -> gasless Claim -> chest NFT -> Market (Tigris again) -> 5% back into the pot -> automatic weekly payout.

Contracts (chain 31611): all eight verified; addresses and explorer links in PROOF.md. Ember Pot: 0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c

Business model: 20% of every key goes to the treasury and pays for the replay server and the relayer's gas; 80% of keys and the Market's 5% of every sale are the players' pot, which is what sells the next key. No token.

Limits, honestly: testnet only; a found weapon makes a prize descent easier (everything else is equal); the server is trusted to replay; the pot's idle MUSD is not yet deployed into a Mezo pool (next milestone).

Track: both. Status: existing game; its Mezo features were built in Waves 1-2. Team: Lazan1aa, solo; X https://x.com/NotYur.
```
