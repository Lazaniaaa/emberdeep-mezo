# Mezo Buildathon Wave 1 — texts for the submission form

Copy each block into the matching field. If the form asks for something not listed, use the closest block.

## Project name
Emberdeep: Ember Pot on Mezo

## Tagline (one line)
A pixel roguelike where skill wins a real weekly MUSD prize pool on Mezo: pay with BTC or MEZO, claim in one click, paid out automatically.

## Links
- Live demo: https://45-63-99-54.sslip.io (Mezo Testnet)
- Code: https://github.com/Lazaniaaa/emberdeep-mezo
- Pitch deck: https://claude.ai/artifact/RXdsREXPtaY15gdkCsRgHJ
- Video: [link to the uploaded video]

## Description
Emberdeep is a browser roguelike: you descend into a cave with a lantern, light is your only resource, and you bring gold home through the rift before the dark takes you. Every level offers a new perk; Cerberus guards floor 7.

The Ember Pot turns it into a real weekly prize pool on Mezo. A prize key costs 1 MUSD: 80% goes into this week's pot, 20% to the treasury. Prize descents start equal for everyone (same lantern, same dagger, no paid boosts). When you come home you press Claim: the game's server replays every move, signs only the true result, and records your gold in the pot, paying the gas. When the week ends, the pot is paid out automatically by gold, straight to the players' wallets. There is no game token and no function that lets anyone, including us, take the pot out.

## How does the project use Mezo?
- **MUSD** is the prize currency: key price, weekly pot and payouts are all MUSD.
- **BTC and MEZO** pay for keys directly: our EmberKeyRouter swaps them to MUSD on **Tigris** (BTC/MUSD and MEZO/MUSD pools) and buys the keys in one transaction. The router has no owner and no admin functions.
- Everything runs on **Mezo Testnet**: the Ember Pot, the key router and the Hall of Descents (on-chain leaderboard), plus a relayer that pays gas for claims and triggers the weekly payout.
- Contracts (chain 31611): Ember Pot `0x7a3e5548a81456ae695d058a90aa73ca543b16eb`, key router `0x515e4e47a8bcd7e1b4ab4fc28b3d16b29dd58a9d`, Hall of Descents `0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6`.

## Problem
BTC holders on Mezo can mint MUSD, but there are few fun reasons to use it every day. Most crypto games pay players in a token they print themselves, so early players win and the game dies; and most prize pools are custodial, so players cannot check who wins or whether the operator can take the money.

## Solution / business model
A skill game whose prizes come only from players' keys, in MUSD, held by a contract nobody can withdraw from. Revenue is the 20% treasury share of every key; the pot grows with every player. Every BTC or MEZO key is also a trade on Tigris. Next: Delver NFTs with perks and a marketplace priced in MUSD, with a share of every sale into the weekly pot; then Mezo mainnet.

## Technical highlights
- The whole game is one deterministic pure function; the server replays a descent move by move and signs it (EIP-712). The contracts accept a record only with that signature, once, for the player it was signed for, with gold capped per run and a deadline inside the current round.
- One-click gasless claims: the player signs one login message a week (no transaction); a separate relayer key sends the record and pays the gas, so nobody can spend another player's keys.
- Automatic weekly payout from the server; `distribute` stays permissionless as a fallback.
- Solidity 0.8.28 (Solady and OpenZeppelin), tested in an in-memory EVM and with Foundry; React 19, TypeScript, viem, Canvas 2D; 550+ automated tests.

## What was built during Wave 1
The Ember Pot on Mezo with MUSD, BTC and MEZO key purchases through Tigris, prize descents with an equal loadout, one-click gasless claims, the Hall of Descents on Mezo, the automatic weekly payout, and a Mezo-only release of the game whose camp runs on crystals instead of pretend money. The game itself existed before the buildathon.

## Status / traction
Live on Mezo Testnet: keys bought, the first prize descent claimed (141 gold in week 0), 7.2 MUSD in the pot at the time of submission.

## Team
Solo builder: Lazaniaaa.
