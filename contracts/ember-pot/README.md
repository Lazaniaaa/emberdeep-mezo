# Ember Pot

A weekly prize pool for Emberdeep, paid in a stablecoin (MUSD on Mezo). Built in Arc Studio and deployed by the
project owner; these are its sources and Foundry tests.

- Keys cost 1 MUSD. 80% of every key goes into the current week's pot, 20% to the treasury.
- The game's server replays a prize descent and signs it (EIP-712 `RunRecord`); `recordRun` spends one of the
  player's keys and adds the gold to the week. Anyone may send the signed record; the game's relayer does, paying gas.
- After the week, `distribute` splits the pot by gold, straight to the players' wallets. The game's server calls it
  automatically (`server/payout.ts`); anyone else can too, so nobody can hold the pot back. There is no function that
  lets the owner take the pot. A signer change only takes effect from the next round.

## Contracts

| File | What |
| --- | --- |
| `EmberPotV2.sol` | The pot used on Mezo: `EmberPot` plus `buyKeysFor(player, quantity)` for routers |
| `EmberPot.sol` | The first version (Arc mainnet with USDC) |
| `EmberKeyRouter.sol` | The first router: BTC → MUSD on Tigris → keys, bound to the first Mezo pot. The current router, which takes BTC **or MEZO**, is [`../EmberKeyRouter.sol`](../EmberKeyRouter.sol) |
| `test/` | Foundry tests (`forge test`); `test-helpers/MockERC20.sol` |

## Deployed on Mezo Testnet (chain 31611)

| Contract | Address |
| --- | --- |
| Ember Pot (EmberPotV2) | `0x7a3e5548a81456ae695d058a90aa73ca543b16eb` |
| Key router, BTC or MEZO ([source](../EmberKeyRouter.sol)) | `0x515e4e47a8bcd7e1b4ab4fc28b3d16b29dd58a9d` |
| Hall of Descents ([source](../EmberdeepHall.sol)) | `0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6` |
| MUSD / MEZO / BTC | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` / `0x7b7c…0001` / `0x7b7c…0000` |

Explorer: https://explorer.test.mezo.org. The game: https://45-63-99-54.sslip.io

## Build and test

```bash
cd contracts/ember-pot
forge install foundry-rs/forge-std --no-git
npm install @openzeppelin/contracts@5.1.0
forge test
```

Compiler: solc 0.8.28, EVM `paris`, optimizer 200 runs, via-IR (the bytecode deployed on Mezo was built with these).
The compiled pot used by the game's deploy page is [`../out/EmberPotV2.json`](../out/EmberPotV2.json).
