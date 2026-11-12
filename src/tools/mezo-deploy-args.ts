// The constructor arguments of the Wave 2 contracts on Mezo, shared by the deploy page (deploy-mezo.ts) and the test
// that deploys the same set in a real EVM (contracts/wave2-deploy.test.ts).
import { parseEther, type Address } from "viem";

/** 5% of every sale goes into the pot. The contract allows at most 10%. */
export const MARKET_FEE_BPS = 500n;
export const KEY_PRICE = parseEther("1");

export type MezoTokens = { MUSD: Address; BTC: Address; MEZO: Address };
export type Tigris = { router: Address; factory: Address };

/** EmberPotV3: MUSD, the treasury (the deployer), the server's signer, the key price, the gold cap a run, the round length. */
export const potArgs = (t: MezoTokens, treasury: Address, signer: Address, maxGold: number, roundSeconds: number) =>
  [t.MUSD, treasury, signer, KEY_PRICE, BigInt(maxGold), BigInt(roundSeconds)] as const;

/** EmberKeyRouter: the pot it buys keys from, then MUSD, BTC, MEZO and Tigris. */
export const routerArgs = (pot: Address, t: MezoTokens, tigris: Tigris) => [pot, t.MUSD, t.BTC, t.MEZO, tigris.router, tigris.factory] as const;

/** EmberItems: the server's signer and the metadata base URI. */
export const itemsArgs = (signer: Address, baseUri: string) => [signer, baseUri] as const;

/** EmberMarket: the tokens, Tigris, and the pot as its fee sink, funded through fund() so the fee lands in the round. */
export const marketArgs = (pot: Address, t: MezoTokens, tigris: Tigris) =>
  [t.MUSD, t.BTC, t.MEZO, tigris.router, tigris.factory, pot, true, MARKET_FEE_BPS] as const;
