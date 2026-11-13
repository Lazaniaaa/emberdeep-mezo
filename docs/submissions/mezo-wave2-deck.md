# Mezo Buildathon Wave 2 — the pitch deck, slide by slide

Ten slides, 16:9, built to be exported as a PDF and committed to the repo as `docs/emberdeep-deck.pdf`. The form and
the README link to that file, so it opens for anyone without signing in. (In Wave 1 the deck was a private link; the
judge could not open it and capped Materials at 1.)

Rules for every slide:
- A PDF has no animation and no speaker: each slide must read on its own in ten seconds.
- One idea per slide, a title that states it, at most four short bullets, one picture.
- Only what the live site and the chain show on the day. A deck that promised more than the code cut Materials for
  other teams. Anything marked TODO is either filled in or removed before export.
- Real screenshots from the Mezo build, real addresses, real transaction hashes (shortened, linked).
- Text in English; no text smaller than 18 pt at 1920×1080; links are live in the PDF.

Notes for the owner are in Ukrainian in square brackets.

---

## 1. Title

**Emberdeep: a game economy that runs on Mezo**

- A skill roguelike with a weekly MUSD prize pool.
- Borrow against BTC, play, win a weapon NFT, trade it. One loop, all on Mezo.
- Mezo Buildathon, Wave 2 · Mezo Testnet · live at TODO

Show: the key art (the cat with the lantern), the game's logo, the site address. In a corner, the loop of slide 2 as
a small ring, so the first thing a judge sees is a cycle and not a game cover.

## 2. One loop, all on Mezo  *(the composability slide: the most important one)*

**Every arrow is a transaction on Mezo**

Draw this as a ring, each node labelled with the Mezo piece it uses:

```
        ┌──────────────── 5% of every sale ────────────────┐
        ▼                                                  │
  [ Ember Pot ]  ◄── 80% of key ──  [ Prize key, 1 MUSD ]  │
   weekly MUSD                          ▲          ▲       │
   prize pool                           │          │       │
        │                      borrow MUSD     swap BTC / MEZO
        │                      against BTC     to MUSD
        │                      (Mezo trove)    (Tigris)
        │
        ├─► Claim (gasless) ─► [ Chest: weapon NFT ] ─► [ Market ] ─ buy with MUSD,
        │                                                    BTC or MEZO (Tigris) ──┘
        ▼
  weekly payout by gold, straight to wallets
```

- **Mezo borrowing**: the game opens or tops up the player's trove (BorrowerOperations).
- **Tigris**: BTC and MEZO buy keys and weapons, swapped inside the same transaction.
- **MUSD**: the only currency of keys, prizes, weapon prices and fees.
- The Market's fee is the pot's second source: trading feeds the prizes, the prizes sell keys.

[Це головний слайд. Якщо суддя подивиться лише один, має бути цей. Під кожним вузлом дрібно: назва контракту.]

## 3. Why

**MUSD needs places to be spent and earned, not only parked**

- A BTC holder can borrow MUSD on Mezo without selling. Then what? Mostly: another yield page.
- Games could be that place, but most pay in a token they print: early players win, the game dies.
- Emberdeep's prizes come only from players, in MUSD, held by a contract nobody can withdraw from.

Show: one screenshot of a descent (lantern, a creature winding up, gold), with the pot's amount in the header.

## 4. Borrow MUSD without leaving the game

**A first trove in one click**

- Short of MUSD for a key or a weapon? One button: `BorrowerOperations.openTrove`, BTC as collateral, MUSD to the
  wallet. A player who has a trove borrows more with `adjustTrove`.
- Sized the way Mezo judges it: Mezo's own PriceFeed, `minNetDebt`, fee and gas compensation read on chain; hints
  from `SortedTroves`.
- A safe 65% loan-to-value by default. The trove is the player's own, visible in Mezo's app.

Show: the borrow card ("≈0.045 BTC locked as collateral, 1,800 MUSD borrowed") next to the same trove in Mezo's
testnet app. Under it: the transaction hash, TODO.

## 5. Play, claim, and the chest

**Skill decides the gold; the chain keeps the score**

- Prize descents start with the same kit for everyone. Gold carried home is the player's share of the pot.
- The game is one deterministic function: the server replays every move and signs only the true result (EIP-712).
  A relayer records it and pays the gas.
- Slay Cerberus and the claimed descent earns a chest: a weapon NFT. One chest per pot record, so each cost a key.

Show: three screenshots in a row: the report with **Claim**, "Claimed" with the transaction link, the opened chest
with the weapon. TODO: hashes.

## 6. Weapons and the Market

**An NFT you use, and a market that pays the prize pool**

- `EmberItems` (ERC-721): four kinds, four rarities, each plays differently. Metadata is read from the chain, so
  the weapon shows with its picture and traits on the Mezo explorer.
- `EmberMarket`: escrow listings in MUSD. Pay with MUSD, or with BTC or MEZO swapped on Tigris in one transaction.
- 5% of every sale goes into the week's pot through `EmberPotV3.fund()`. The pot window shows it.

Show: the Market with a listing whose buttons read "≈0.0002 BTC / ≈20 MEZO"; the weapon's page on the explorer;
the pot's "From Market sales" line.

## 7. Wave 1 → Wave 2: what we did with the judge's feedback

**Wave 1: 58 / 100. Every point of the feedback, answered**

| The judge said (Wave 1) | Wave 2 |
| --- | --- |
| "Let players open or top up a trove through BorrowerOperations to fund their keys" | Done: in the game, for keys and weapons (slide 4) |
| "Show players other than the deployer wallet … and a completed weekly distribute" | TODO: N outside wallets, payouts in PROOF.md |
| "Verify the three contracts on the explorer" | TODO: all contracts verified |
| "Use server-issued seeds" | Done: the server starts every prize descent and signs its seed; one claim per start |
| "Add a pitch deck" | This deck, a PDF in the repo; video 2:00 |
| "The pot is still a port of your Arc USDC pool" | The pot is now fed by a Mezo-only Market, through `fund()` |

[Рядки з TODO: або «Done» з посиланням, або чесне «Next». Порожніх обіцянок не лишати. Бал 58 можна не писати,
якщо не хочеш; але «ось що ви сказали, ось що ми зробили» суддям видно одразу.]

## 8. Built to be checked

**Do not trust us: check**

- Every step of the loop as a transaction: `docs/PROOF.md` (TODO: link). Contracts verified on the explorer.
- TODO test count (623 on 12 Nov): game rules, replay, the contracts in a real EVM, the server and relayer.
- What the owner can and cannot do is written in the README: nobody can take MUSD out of the pot or an item out of
  the Market.
- Honest limits: testnet only; a found weapon makes a prize descent easier; the server is trusted to replay.

Show: a cut of the PROOF.md table with four or five real hashes; the "Verified" tick of one contract.

## 9. Business model

**Two flows in MUSD, both on chain, no token**

- **Keys**: 1 MUSD each. 80% to the players' pot, 20% to the treasury.
- **Market**: 5% of every sale, all of it into the pot. A bigger pot sells more keys.
- **Costs**: the server that replays descents and the relayer's gas, paid from the treasury's 20%. Costs grow with
  claims; so does revenue, because every claim spends a key.
- For Mezo: every new player is a reason to open a trove or swap on Tigris, and MUSD that circulates instead of
  sitting.

Show: a simple flow of 1 MUSD (0.80 → pot, 0.20 → treasury) and of a 20 MUSD sale (19 → seller, 1 → pot).

[У коді вся комісія маркету (5%) іде в пот, скарбниці з неї нічого не лишається. Якщо хочеш, щоб частина
комісії покривала сервер, це треба змінювати в контракті до деплою; у презентації пишемо так, як у коді.]

## 10. Next, and where to find everything

**After the buildathon**

- Pot funds at work on Mezo: the week's idle MUSD in the savings vault or a Mezo pool, yield added to the prizes.
- A server-issued start for every prize descent; a daily mint cap; Mezo Passport sign-in.
- Mezo mainnet once the testnet weeks run cleanly.

Links (live in the PDF): site TODO · repo github.com/Lazaniaaa/emberdeep-mezo · video TODO · PROOF.md TODO ·
contracts TODO.
Team: TODO name and role · X TODO.

---

## Checklist before exporting the PDF

- [ ] No TODO left on any slide.
- [ ] Every number on a slide matches the live site and the chain today.
- [ ] Every link opens in a private window.
- [ ] Exported as `docs/emberdeep-deck.pdf`, committed and pushed; the GitHub link opens the PDF.
- [ ] The same link is in the AKINDO form and in the README.
