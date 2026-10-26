// Where the Hall of Descents lives on Arc. Plain values only, so the main bundle can ask "is the Hall there?"
// without pulling in viem (the code that talks to the chain is in arc.ts and loads on demand).

/**
 * Arc's networks. The RPCs are the public ones from Arc's docs, tried in this order. The primary ones (rpc.mainnet.arc.io,
 * rpc.testnet.arc.io) refuse some regions with Cloudflare's "error code: 1009" (seen from Ukraine on 2026-10-09), so the
 * partners' endpoints go first.
 */
export const ARC_NETWORKS = {
  mainnet: {
    id: 5042,
    name: "Arc",
    rpcs: ["https://rpc.blockdaemon.mainnet.arc.io", "https://rpc.drpc.mainnet.arc.io", "https://rpc.mainnet.arc.io"],
    explorer: "https://explorer.arc.io",
  },
  testnet: {
    id: 5042002,
    name: "Arc Testnet",
    rpcs: ["https://rpc.blockdaemon.testnet.arc.io", "https://rpc.drpc.testnet.arc.io", "https://rpc.testnet.arc.io"],
    explorer: "https://explorer.testnet.arc.io",
  },
} as const;

/** The network the game uses: Arc mainnet, or Arc Testnet with `VITE_ARC_NETWORK=testnet` (a rehearsal with free USDC). */
export const ARC_NETWORK = import.meta.env.VITE_ARC_NETWORK === "testnet" ? ARC_NETWORKS.testnet : ARC_NETWORKS.mainnet;
export const ARC_CHAIN_ID = ARC_NETWORK.id;
export const ARC_RPCS: readonly string[] = ARC_NETWORK.rpcs;
export const ARC_EXPLORER = ARC_NETWORK.explorer;

export type HallConfig = { address: `0x${string}` };

/**
 * The deployed Hall on Arc mainnet: deployed 2026-10-14 at block 25966250, signer 0x8973…55Cd (the key lives on the
 * game's server). A testnet rehearsal has no deployed Hall; it sets `VITE_ARC_HALL_ADDRESS`.
 */
const DEPLOYED: HallConfig | null = ARC_NETWORK === ARC_NETWORKS.mainnet ? { address: "0x0b03e2c77fee4edac4c51a5be04df7175d7b423a" } : null;

const ADDRESS = /^0x[\da-fA-F]{40}$/;

/** `VITE_ARC=off` builds the site for Mezo only: no Hall on Arc anywhere (see .env.production). */
export const ARC_ENABLED = import.meta.env.VITE_ARC !== "off";

/** `VITE_ARC_HALL_ADDRESS` overrides the deployed Hall, for local tests. */
export function hallConfig(): HallConfig | null {
  if (!ARC_ENABLED) return null;
  const address = import.meta.env.VITE_ARC_HALL_ADDRESS as string | undefined;
  if (address && ADDRESS.test(address)) return { address: address as `0x${string}` };
  return DEPLOYED;
}

/** The signing server (server/attest.ts), on the same host as the game behind Caddy, or Vite's proxy in development. */
export const ATTEST_URL = (import.meta.env.VITE_ATTEST_URL as string | undefined) || "/api/attest";

export const txUrl = (hash: string) => `${ARC_EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${ARC_EXPLORER}/address/${address}`;
