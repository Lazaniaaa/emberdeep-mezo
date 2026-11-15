# Emberdeep on Mezo: proof on chain

Every step of the loop, as a transaction anyone can open on the Mezo Testnet explorer (chain 31611). Nothing here
asks you to trust a screenshot: each row is a hash, the wallet that sent it, and what to look for in it.

Hashes filled on 15 November 2026 from the explorer. A row marked "not shown yet" is supported by the code but has
no transaction yet; the README and the submission do not claim it as done on chain.

## Contracts

| Contract | Address | Verified source |
| --- | --- | --- |
| EmberPotV3 (weekly MUSD prize pool) | [`0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c`](https://explorer.test.mezo.org/address/0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c) | [verified](https://explorer.test.mezo.org/address/0x46cc1c7abe317aaa77ac6df3f206fa38c8b7b86c?tab=contract) |
| EmberKeyRouter (BTC or MEZO → MUSD on Tigris → keys) | [`0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a`](https://explorer.test.mezo.org/address/0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a) | [verified](https://explorer.test.mezo.org/address/0xe81eeb4ac622be0ffe6b127b4e86d93bbd560d3a?tab=contract) |
| EmberItems (found weapons, ERC-721) | [`0xc36a4c19760dc368c719eba29159d639b2f62362`](https://explorer.test.mezo.org/address/0xc36a4c19760dc368c719eba29159d639b2f62362) | [verified](https://explorer.test.mezo.org/address/0xc36a4c19760dc368c719eba29159d639b2f62362?tab=contract) |
| EmberMarket (escrow, buy with MUSD / BTC / MEZO, 5% into the pot) | [`0x4c598c2146a30b9595b3c224c47fae13ba7a4a04`](https://explorer.test.mezo.org/address/0x4c598c2146a30b9595b3c224c47fae13ba7a4a04) | [verified](https://explorer.test.mezo.org/address/0x4c598c2146a30b9595b3c224c47fae13ba7a4a04?tab=contract) |
| Quick test pot, 5-minute rounds | [`0xff019fbb3ddc88163d605ca2a0abdb879ccfedc8`](https://explorer.test.mezo.org/address/0xff019fbb3ddc88163d605ca2a0abdb879ccfedc8) | [verified](https://explorer.test.mezo.org/address/0xff019fbb3ddc88163d605ca2a0abdb879ccfedc8?tab=contract) |
| Quick test pot, 10-minute rounds | [`0x8c91e96c4e846377c95212617bbf58556d39fcb3`](https://explorer.test.mezo.org/address/0x8c91e96c4e846377c95212617bbf58556d39fcb3) | [verified](https://explorer.test.mezo.org/address/0x8c91e96c4e846377c95212617bbf58556d39fcb3?tab=contract) |
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
| 1 | Borrow MUSD from the game: open a trove | `BorrowerOperations.openTrove`, BTC attached as collateral, MUSD minted to the player | not shown yet: the owner's trove existed before, so the game took the `adjustTrove` path (row 2); a wallet without a trove gets `openTrove` from the same button | — |
| 2 | Borrow more on an existing trove | `BorrowerOperations.adjustTrove`, debt increase: +100 MUSD, 0.0118 BTC added, 0.1 MUSD fee (`TroveUpdated`, `BorrowingFeePaid`) | [`0x7c36…c604`](https://explorer.test.mezo.org/tx/0x7c3622a14927b81f4153c27b826cec004962ca514dbe63b9eaf59fa76fbbc604) | owner |
| 3 | Buy a prize key with MUSD | `EmberPotV3.buyKeys`: 80% into the round, 20% to the treasury | [`0x5f6b…97ac`](https://explorer.test.mezo.org/tx/0x5f6bbf6523d28226bf9117bb151e86463b39c5fbabd8ed33745850ff31e097ac) · [`0x65ce…cb75`](https://explorer.test.mezo.org/tx/0x65ce995b814fc0634d03d74a374ce357395795c36fdc82b452fc702c2467cb75) · quick pot [`0x98ee…47f5`](https://explorer.test.mezo.org/tx/0x98ee8af91ee652565f3334d4acf4d9e83ccf2d3a166a9405fb76870e7f1a47f5) | owner · player 1 · owner |
| 4 | Buy a prize key with BTC | `EmberKeyRouter.buyKeys`: swap on Tigris, then `buyKeysFor`, leftover MUSD returned: 3 keys for 0.0000397 BTC, 0.09 MUSD back | [`0xeec1…bf0c`](https://explorer.test.mezo.org/tx/0xeec14b02bc97aff7eeca2a9d19ff5a35a44b072ec4f70f050f2496a526dfbf0c) | owner |
| 5 | Buy a prize key with MEZO | the same through the MEZO/MUSD pool | not shown yet | — |
| 6 | Claim a prize descent | `EmberPotV3.recordRun`, sent by the relayer with the server's signature; one key spent | 10-minute pot [`0x3267…a376`](https://explorer.test.mezo.org/tx/0x3267c5e3f9b4ac234a011f422aa8585875da2d77357d22d92e031ea8becaa376) · 5-minute pot [`0x1856…ba1e`](https://explorer.test.mezo.org/tx/0x1856c49c517b761687daba53dc1a4e1a48872637c101ed58acc222db0d95ba1e) | relayer, for owner |
| 7 | The same descent on the Hall of Descents | `EmberdeepHall.record` | [`0x4220…4a02`](https://explorer.test.mezo.org/tx/0x422098a87c5a523ea007c60af9bdf6679b859291ffcb8887888fb986ab7e4a02) · [`0xb50a…3525`](https://explorer.test.mezo.org/tx/0xb50ae7e99eae1f4d28464835f287baaa89bd1d8f818ebc1fd8b5f7bcfd653525) | relayer, for owner |
| 8 | Open a Cerberus chest | `EmberItems.claimDrop`: the item is minted to the player; `runId` is the pot record of row 6 (`ItemMinted`: id 6, an axe, rare) | [`0x0d60…512b`](https://explorer.test.mezo.org/tx/0x0d60f6048b81ddace3fd877c56ba0efece7f46a2ee67677d3b48b013d393512b) | relayer, for owner |
| 9 | The minted weapon as an NFT | the item's page on the explorer (metadata from `/api/item/<id>`: Bloodrust Axe #6) | [EmberItems #6](https://explorer.test.mezo.org/token/0xc36a4c19760dc368c719eba29159d639b2f62362/instance/6) · [metadata](https://108-61-197-158.sslip.io/api/item/6) | — |
| 10 | List the weapon | `EmberMarket.list`: the Market holds the item | [`0x17d1…30f1`](https://explorer.test.mezo.org/tx/0x17d118bfd4b31d1522c7df81a466ff13cd03a4c222edc600b187259fcefc30f1) · [`0xdd62…803f`](https://explorer.test.mezo.org/tx/0xdd627188a7e63dc3ef868c93b2f9b9418863d10e4915b39f48ea1212008e803f) | player 1 · owner |
| 11 | Buy a weapon with MUSD | `EmberMarket.buy`: 10 MUSD; 9.50 to the seller, item #2 to the buyer, `Sold` | [`0x3bcb…d263`](https://explorer.test.mezo.org/tx/0x3bcb2d5c42d6d4614e08eab4752b2875633dfe5a6a17a8412dd7ff9d1789d263) · [`0xf087…1c1f`](https://explorer.test.mezo.org/tx/0xf08772275047b885364b84e8fb4e28497df3964a84a00ee3c49f6b2ca5cf1c1f) | player 1 |
| 12 | Buy a weapon with BTC or MEZO | `EmberMarket.buyWith`: swap on Tigris inside the same transaction | not shown yet | — |
| 13 | The Market's 5% in the pot | `Funded(round 0, market, 0.5 MUSD)` in row 11; `fundedIn(round)` on the pot | [`0x3bcb…d263`](https://explorer.test.mezo.org/tx/0x3bcb2d5c42d6d4614e08eab4752b2875633dfe5a6a17a8412dd7ff9d1789d263) (logs) | — |
| 14 | A descent that carried a found weapon | `recordRun` for a descent whose setup carried a found NFT (the server checked its owner) | not shown yet | — |
| 15 | Payout by gold | `EmberPotV3.distribute(round, players)`: MUSD to every player by gold, sent by the server's payout loop. The 5-minute pot's round 20 paid 4 MUSD; the weekly pot's round 0 ends on 22 November | [`0x42bc…cda0`](https://explorer.test.mezo.org/tx/0x42bc88e0d8ef52239afd0de4a6b54c91ff52194cc26d4e50996054202281cda0) | relayer |
| 16 | Weekly payout of the Wave 1 pot | `distribute` on Ember Pot V2: round 0 paid 7.2 MUSD by gold, automatically, on 2 November | [`0x97d7…26cc`](https://explorer.test.mezo.org/tx/0x97d7283e52dff7244cdb52af3a41acae1116c2afe44801e36f0fe81f0fd926cc) | relayer |

## Outside players

Wallets that are not the owner's, with what each did. (The judges asked for this in Wave 1: "show players other than
the deployer wallet buying keys and a completed weekly distribute on-chain".)

| Player | Wallet | Keys bought | Claims | Chests | Market |
| --- | --- | --- | --- | --- | --- |
| 1 | [`0xe1ea4C01Ca14e74fEd65c78330990fB85AF5CE43`](https://explorer.test.mezo.org/address/0xe1ea4C01Ca14e74fEd65c78330990fB85AF5CE43) | [`0x65ce…cb75`](https://explorer.test.mezo.org/tx/0x65ce995b814fc0634d03d74a374ce357395795c36fdc82b452fc702c2467cb75) | — | — | listed [`0x17d1…30f1`](https://explorer.test.mezo.org/tx/0x17d118bfd4b31d1522c7df81a466ff13cd03a4c222edc600b187259fcefc30f1), bought [`0x3bcb…d263`](https://explorer.test.mezo.org/tx/0x3bcb2d5c42d6d4614e08eab4752b2875633dfe5a6a17a8412dd7ff9d1789d263) |

Player 1 is a second wallet, not the deployer. Wallets of other people are added here as they play.

## How to check a row yourself

1. Open the hash on <https://explorer.test.mezo.org>.
2. The "To" address must be the contract named in the row, and the contract's code tab must show verified source.
3. The logs must show the event named in "Look for".

## What is not on chain

- The camp (crystals, practice descents, the weekly Delver draw) lives in the browser.
- The replay that checks a descent runs on the game's server; the chain sees its signature, not the moves.
- Rows 1, 5, 12 and 14 have no transaction yet (see the rows). The weekly pot's first round ends on 22 November and is
  paid out by the same loop that paid row 15.
