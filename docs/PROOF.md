# Emberdeep on Mezo: proof on chain

Every step of the loop, as a transaction anyone can open on the Mezo Testnet explorer (chain 31611). Nothing here
asks you to trust a screenshot: each row is a hash, the wallet that sent it, and what to look for in it.

> TODO (owner): fill the hashes after the Wave 2 deployment. Until a row has a hash, the README and the submission
> must not claim that step as done on chain.

## Contracts

| Contract | Address | Verified source |
| --- | --- | --- |
| EmberPotV3 (weekly MUSD prize pool) | [`0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c`](https://explorer.test.mezo.org/address/0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c) | [verified](https://explorer.test.mezo.org/address/0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c?tab=contract) |
| EmberKeyRouter (BTC or MEZO → MUSD on Tigris → keys) | [`0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a`](https://explorer.test.mezo.org/address/0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a) | [verified](https://explorer.test.mezo.org/address/0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a?tab=contract) |
| EmberItems (found weapons, ERC-721) | [`0xc36a4c19760dc368c719eba29159d639b2f62362`](https://explorer.test.mezo.org/address/0xc36a4c19760dc368c719eba29159d639b2f62362) | [verified](https://explorer.test.mezo.org/address/0xc36a4c19760dc368c719eba29159d639b2f62362?tab=contract) |
| EmberMarket (escrow, buy with MUSD / BTC / MEZO, 5% into the pot) | [`0x4c598c2146a30b9595b3c224c47fae13ba7a4a04`](https://explorer.test.mezo.org/address/0x4c598c2146a30b9595b3c224c47fae13ba7a4a04) | [verified](https://explorer.test.mezo.org/address/0x4c598c2146a30b9595b3c224c47fae13ba7a4a04?tab=contract) |
| Hall of Descents | [`0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6`](https://explorer.test.mezo.org/address/0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6) | [verified](https://explorer.test.mezo.org/address/0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6?tab=contract) |
| Key router of Wave 1 (retired with its pot) | [`0x515e4e47a8bcd7e1b4ab4fc28b3d16b29dd58a9d`](https://explorer.test.mezo.org/address/0x515e4e47a8bcd7e1b4ab4fc28b3d16b29dd58a9d) | [verified](https://explorer.test.mezo.org/address/0x515e4e47a8bcd7e1b4ab4fc28b3d16b29dd58a9d?tab=contract) |
| Ember Pot V2 (Wave 1, retired; its last rounds are still paid out) | [`0x7a3e5548a81456ae695d058a90aa73ca543b16eb`](https://explorer.test.mezo.org/address/0x7a3e5548a81456ae695d058a90aa73ca543b16eb) | not verified yet (source in `contracts/ember-pot/EmberPotV2.sol`) |

All Wave 2 contracts were deployed on 15 November 2026 by the owner `0x08e4f62eD093124AA3cE257830c81B2bC14A51E9`;
the game server signs with `0xc0702Ec1ee458D746aE4DDEd8316c3D397001240`.

Mezo's own contracts the game calls: BorrowerOperations `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` (with its
TroveManager, SortedTroves and PriceFeed, read from it), MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`,
Tigris router `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9`, Tigris pools BTC/MUSD
`0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9` and MEZO/MUSD `0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342`.

## The loop, step by step

"Wallet" says who sent it: **owner** (the deployer), **relayer** (the game's gas-paying key,
`0x92B9A6c6B4413A60EF3ef7E26090EAa77844dAD9`), or **player N** (a wallet that is neither; see "Outside players").

| # | What | Look for | Transaction | Wallet |
| --- | --- | --- | --- | --- |
| 1 | Borrow MUSD from the game: open a trove | `BorrowerOperations.openTrove`, BTC attached as collateral, MUSD minted to the player | TODO | TODO |
| 2 | Borrow more on an existing trove | `BorrowerOperations.adjustTrove`, debt increase | TODO | TODO |
| 3 | Buy a prize key with MUSD | `EmberPotV3.buyKeys`: 80% into the round, 20% to the treasury | TODO | TODO |
| 4 | Buy a prize key with BTC | `EmberKeyRouter.buyKeys`: swap on Tigris, then `buyKeysFor`, leftover MUSD returned | TODO | TODO |
| 5 | Buy a prize key with MEZO | the same through the MEZO/MUSD pool | TODO | TODO |
| 6 | Claim a prize descent | `EmberPotV3.recordRun`, sent by the relayer with the server's signature; one key spent | TODO | relayer, for TODO |
| 7 | The same descent on the Hall of Descents | `EmberdeepHall.record` | TODO | relayer, for TODO |
| 8 | Open a Cerberus chest | `EmberItems.claimDrop`: the item is minted to the player; `runId` is the pot record of row 6 | TODO | relayer, for TODO |
| 9 | The minted weapon as an NFT | the item's page on the explorer shows its picture and traits (metadata from `/api/item/<id>`) | TODO: link to the token instance | — |
| 10 | List the weapon | `EmberMarket.list`: the Market holds the item | TODO | TODO |
| 11 | Buy a weapon with MUSD | `EmberMarket.buy`: the seller is paid, the item moves, `Funded` on the pot | TODO | TODO |
| 12 | Buy a weapon with BTC or MEZO | `EmberMarket.buyWith`: swap on Tigris inside the same transaction | TODO | TODO |
| 13 | The Market's 5% in the pot | `Funded(round, market, amount)` in row 11 or 12; `fundedIn(round)` on the pot | TODO: same hash, log index | — |
| 14 | A descent that carried a found weapon | `recordRun` for a descent whose setup carried the NFT of row 9 (the server checked its owner) | TODO | relayer, for TODO |
| 15 | Weekly payout | `EmberPotV3.distribute(round, players)`: MUSD to every player by gold | TODO | relayer |
| 16 | Weekly payout of the Wave 1 pot | `distribute` on Ember Pot V2: round 0 paid 7.2 MUSD by gold, automatically, on 2 November | [`0x97d7…26cc`](https://explorer.test.mezo.org/tx/0x97d7283e52dff7244cdb52af3a41acae1116c2afe44801e36f0fe81f0fd926cc) | relayer |

## Outside players

Wallets that are not the owner's, with what each did. (The judges asked for this in Wave 1: "show players other than
the deployer wallet buying keys and a completed weekly distribute on-chain".)

| Player | Wallet | Keys bought | Claims | Chests | Market |
| --- | --- | --- | --- | --- | --- |
| 1 | TODO | TODO | TODO | TODO | TODO |
| 2 | TODO | TODO | TODO | TODO | TODO |
| 3 | TODO | TODO | TODO | TODO | TODO |

## How to check a row yourself

1. Open the hash on <https://explorer.test.mezo.org>.
2. The "To" address must be the contract named in the row, and the contract's code tab must show verified source.
3. The logs must show the event named in "Look for".

## What is not on chain

- The camp (crystals, practice descents, the weekly Delver draw) lives in the browser.
- The replay that checks a descent runs on the game's server; the chain sees its signature, not the moves.
- TODO (owner): list here any step above that could not be shown before the deadline, and why.
