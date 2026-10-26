// Where Emberdeep lives on Mezo Testnet: the Hall of Descents, the Ember Pot (a real weekly MUSD prize pool) and the
// key routers that buy pot keys with BTC or MEZO through Tigris. Plain values only, so the main bundle can ask "is it
// there?" without pulling in viem (the code that talks to Mezo is in mezo.ts and loads on demand).

/** Mezo Testnet. Gas is paid in BTC (18 decimals). Checked against the chain on 2026-10-26. */
export const MEZO_NETWORK = {
  id: 31611,
  name: "Mezo Testnet",
  rpcs: ["https://rpc.test.mezo.org"],
  explorer: "https://explorer.test.mezo.org",
} as const;

type Address = `0x${string}`;

/** The tokens: BTC and MEZO are Mezo's own precompiles with an ERC-20 face; MUSD is Mezo's BTC-backed dollar. */
export const MEZO_TOKENS = {
  BTC: { address: "0x7b7c000000000000000000000000000000000000", decimals: 18, symbol: "BTC" },
  MEZO: { address: "0x7b7c000000000000000000000000000000000001", decimals: 18, symbol: "MEZO" },
  MUSD: { address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503", decimals: 18, symbol: "MUSD" },
} as const satisfies Record<string, { address: Address; decimals: number; symbol: string }>;

export type PayToken = keyof typeof MEZO_TOKENS;

/** Tigris (Mezo's Velodrome-style DEX). Both volatile pools go to MUSD; MEZO has no BTC pool. */
export const TIGRIS = {
  router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
  factory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A",
  pools: { BTC: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9", MEZO: "0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342" },
} as const satisfies { router: Address; factory: Address; pools: Record<"BTC" | "MEZO", Address> };

/**
 * The Ember Pot on Mezo Testnet (EmberPotV2, deployed 2026-10-26 at block 16371144; the 2026-10-23 one at
 * 0xaf6d…e3ea lost its signer with the old server): keys cost 1 MUSD, 80% of each goes into the week's
 * pot and 20% to the treasury; the server-signed descents add gold; after the week anyone splits the pot by gold.
 * Its signer is the game server's key (0xc070…1240). Round timing is immutable on chain.
 */
export const MEZO_POT = {
  address: "0x7a3e5548a81456ae695d058a90aa73ca543b16eb",
  launchTime: 1_792_976_870,
  roundSeconds: 604_800,
  maxGoldPerRun: 5000,
} as const;

/** The first router: BTC only, owner-less, bound to the 2026-10-23 pot. Used only if KEY_ROUTER is ever unset. */
export const BTC_ROUTER: Address = "0xd261fc219ef4f48dde9a9ff0ede3a133c78c114e";

const ADDRESS = /^0x[\da-fA-F]{40}$/;
const env = (key: string): Address | null => {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && ADDRESS.test(v) ? (v as Address) : null;
};

/** The Hall of Descents on Mezo: the same contract as on Arc. Deployed 2026-10-26 at block 16371186, signer 0xc070…1240. */
const MEZO_HALL: Address | null = "0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6";
/** EmberKeyRouter (contracts/EmberKeyRouter.sol): keys for BTC or MEZO, for the pot above. Deployed 2026-10-26. */
const KEY_ROUTER: Address | null = "0x515e4e47a8bcd7e1b4ab4fc28b3d16b29dd58a9d";

export const mezoHallAddress = (): Address | null => env("VITE_MEZO_HALL_ADDRESS") ?? MEZO_HALL;
export const keyRouterAddress = (): Address | null => env("VITE_MEZO_KEY_ROUTER") ?? KEY_ROUTER;

/** The pot round running at `nowSeconds`, and when it ends, as the contract computes them. */
export function potRound(nowSeconds: number) {
  const round = Math.max(0, Math.floor((nowSeconds - MEZO_POT.launchTime) / MEZO_POT.roundSeconds));
  return { round, endsAt: MEZO_POT.launchTime + (round + 1) * MEZO_POT.roundSeconds };
}

export const mezoTxUrl = (hash: string) => `${MEZO_NETWORK.explorer}/tx/${hash}`;
export const mezoAddressUrl = (address: string) => `${MEZO_NETWORK.explorer}/address/${address}`;
