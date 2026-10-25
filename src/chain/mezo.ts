// Emberdeep on Mezo Testnet: the Hall of Descents (the same contract as on Arc), the Ember Pot (a weekly MUSD prize
// pool split by the gold of server-signed prize descents) and key purchases with MUSD, BTC or MEZO. Loaded on demand.
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, defineChain, erc20Abi, fallback,
  http, parseAbi, toHex, type Address, type Hash, type Hex,
} from "viem";
import { HALL_ABI, readHall, requestAttestation, type HallBoard, type RecordStep } from "./arc";
import { fromWire, type Attestation } from "./hall-typed";
import {
  BTC_ROUTER, MEZO_NETWORK, MEZO_POT, MEZO_TOKENS, TIGRIS, keyRouterAddress, mezoHallAddress, potRound, type PayToken,
} from "./mezo-config";
import { runFromWire, type PotAttestation } from "./pot-typed";
import { RELAY_LOGIN_SECONDS, relayMessage } from "./relay-auth";
import type { Eip1193 } from "./wallet";

export const MEZO = defineChain({
  id: MEZO_NETWORK.id,
  name: MEZO_NETWORK.name,
  // Mezo pays gas in BTC, counted with 18 decimals.
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [...MEZO_NETWORK.rpcs] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: MEZO_NETWORK.explorer } },
});

export const mezoClient = createPublicClient({ chain: MEZO, transport: fallback(MEZO_NETWORK.rpcs.map(url => http(url))) });

export const POT_ABI = parseAbi([
  "function keyPrice() view returns (uint256)",
  "function keyBalance(address) view returns (uint256)",
  "function currentRound() view returns (uint256)",
  "function roundPot(uint256) view returns (uint256)",
  "function totalGold(uint256) view returns (uint256)",
  "function totalDistributed(uint256) view returns (uint256)",
  "function goldOf(uint256, address) view returns (uint256)",
  "function paid(uint256, address) view returns (bool)",
  "function claimable(uint256, address) view returns (uint256)",
  "function playerCount(uint256) view returns (uint256)",
  "function playersOf(uint256 roundId, uint256 start, uint256 count) view returns (address[])",
  "function buyKeys(uint256 quantity)",
  "function recordRun(address player, bytes32 runId, uint256 gold, uint256 deadline, bytes signature)",
  "function distribute(uint256 roundId, address[] players)",
  "function claim(uint256 roundId)",
]);

export const KEY_ROUTER_ABI = parseAbi(["function buyKeys(address tokenIn, uint256 quantity, uint256 amountIn, uint256 deadline)"]);
const BTC_ROUTER_ABI = parseAbi(["function buyKeysWithBTC(uint256 quantity, uint256 maxBtcIn, uint256 deadline)"]);
const POOL_ABI = parseAbi(["function getAmountOut(uint256 amountIn, address tokenIn) view returns (uint256)"]);

const CHAIN_HEX = `0x${MEZO.id.toString(16)}`;
const POT = MEZO_POT.address as Address;

/** Switches the wallet to Mezo Testnet, adding the network first if the wallet has never seen it. */
export async function switchToMezo(provider: Eip1193) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    const e = error as { code?: number; message?: string };
    if (e?.code !== 4902 && !/unrecognized chain|not been added|add (this |the )?chain|chain.*not (added|found)/i.test(e?.message ?? "")) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: CHAIN_HEX, chainName: MEZO.name, nativeCurrency: MEZO.nativeCurrency, rpcUrls: [...MEZO_NETWORK.rpcs], blockExplorerUrls: [MEZO_NETWORK.explorer] }],
    });
  }
}

const wallet = (provider: Eip1193, account: Address) => createWalletClient({ account, chain: MEZO, transport: custom(provider) });

async function confirm(hash: Hash) {
  const receipt = await mezoClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The transaction reverted on Mezo.");
  return hash;
}

// ── the pot ────────────────────────────────────────────────────────────────────────────────────────────

export type PotStanding = { player: Address; gold: number; share: bigint };

export type PotSnapshot = {
  round: number;
  endsAt: number;
  pot: bigint;
  totalGold: number;
  keyPrice: bigint;
  standings: PotStanding[];
  players: number;
  /** The round before this one, while it still has MUSD to pay out. */
  previous: { round: number; pot: bigint; totalGold: number; distributed: bigint; unpaid: Address[] } | null;
  me: { keys: number; gold: number; share: bigint; balances: Record<PayToken, bigint> } | null;
};

/** How many players a page of the pot reads; the contract pays out at most 200 per call. */
const PAGE = 200n;

async function roundPlayers(round: bigint): Promise<Address[]> {
  const count = await mezoClient.readContract({ address: POT, abi: POT_ABI, functionName: "playerCount", args: [round] });
  const out: Address[] = [];
  for (let start = 0n; start < count; start += PAGE) {
    out.push(...await mezoClient.readContract({ address: POT, abi: POT_ABI, functionName: "playersOf", args: [round, start, PAGE] }));
  }
  return out;
}

const read = <T>(functionName: string, args: readonly unknown[] = []) =>
  mezoClient.readContract({ address: POT, abi: POT_ABI, functionName: functionName as never, args: args as never }) as Promise<T>;

export async function balancesOf(account: Address): Promise<Record<PayToken, bigint>> {
  const [btc, mezo, musd] = await Promise.all([
    mezoClient.getBalance({ address: account }),
    mezoClient.readContract({ address: MEZO_TOKENS.MEZO.address, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    mezoClient.readContract({ address: MEZO_TOKENS.MUSD.address, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
  ]);
  return { BTC: btc, MEZO: mezo, MUSD: musd };
}

/** Everything the pot panel shows, read straight from Mezo. Needs no wallet; `account` adds the player's own line. */
export async function readPot(account: Address | null, nowSeconds = Math.floor(Date.now() / 1000)): Promise<PotSnapshot> {
  const { round, endsAt } = potRound(nowSeconds);
  const r = BigInt(round);
  const [pot, totalGold, keyPrice, players] = await Promise.all([
    read<bigint>("roundPot", [r]), read<bigint>("totalGold", [r]), read<bigint>("keyPrice"), roundPlayers(r),
  ]);
  const golds = await Promise.all(players.map(p => read<bigint>("goldOf", [r, p])));
  const standings = players
    .map((player, i) => ({ player, gold: Number(golds[i]), share: totalGold ? (pot * golds[i]) / totalGold : 0n }))
    .sort((a, b) => b.gold - a.gold);

  let previous: PotSnapshot["previous"] = null;
  if (round > 0) {
    const p = r - 1n;
    const [ppot, pgold, pdist, pplayers] = await Promise.all([
      read<bigint>("roundPot", [p]), read<bigint>("totalGold", [p]), read<bigint>("totalDistributed", [p]), roundPlayers(p),
    ]);
    const paid = await Promise.all(pplayers.map(pl => read<boolean>("paid", [p, pl])));
    const unpaid = pplayers.filter((_, i) => !paid[i]);
    if (ppot > pdist) previous = { round: round - 1, pot: ppot, totalGold: Number(pgold), distributed: pdist, unpaid };
  }

  let me: PotSnapshot["me"] = null;
  if (account) {
    const [keys, gold, balances] = await Promise.all([read<bigint>("keyBalance", [account]), read<bigint>("goldOf", [r, account]), balancesOf(account)]);
    me = { keys: Number(keys), gold: Number(gold), share: totalGold ? (pot * gold) / totalGold : 0n, balances };
  }
  return { round, endsAt, pot, totalGold: Number(totalGold), keyPrice, standings, players: players.length, previous, me };
}

// ── buying keys ────────────────────────────────────────────────────────────────────────────────────────

/** Extra input on top of the pool's quote. The router refunds whatever MUSD is left over. */
const SLIPPAGE_BPS = 300n;

/**
 * How much BTC or MEZO buys `musdOut` through the token's Tigris pool: priced from the pool's own quote, then checked
 * against it and raised until it covers the keys, plus a slippage buffer.
 */
export async function quoteIn(token: "BTC" | "MEZO", musdOut: bigint): Promise<bigint> {
  const pool = TIGRIS.pools[token];
  const tokenIn = MEZO_TOKENS[token].address;
  const unit = 10n ** 18n;
  const outForUnit = await mezoClient.readContract({ address: pool, abi: POOL_ABI, functionName: "getAmountOut", args: [unit / 1000n, tokenIn] });
  if (outForUnit === 0n) throw new Error(`The ${token}/MUSD pool on Tigris has no liquidity right now.`);
  let amountIn = (musdOut * (unit / 1000n)) / outForUnit + 1n;
  for (let i = 0; i < 8; i++) {
    const out = await mezoClient.readContract({ address: pool, abi: POOL_ABI, functionName: "getAmountOut", args: [amountIn, tokenIn] });
    if (out >= musdOut) break;
    amountIn = (amountIn * 105n) / 100n;
  }
  return (amountIn * (10_000n + SLIPPAGE_BPS)) / 10_000n;
}

export type BuyStep = "switching" | "approving" | "buying" | "confirming";

async function ensureAllowance(provider: Eip1193, account: Address, token: Address, spender: Address, amount: bigint, onStep: (s: BuyStep) => void) {
  const allowance = await mezoClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account, spender] });
  if (allowance >= amount) return;
  onStep("approving");
  await confirm(await wallet(provider, account).writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
}

/** Buys pot keys for the connected wallet: MUSD straight from the pot, BTC or MEZO through a key router. */
export async function buyKeys(provider: Eip1193, account: Address, token: PayToken, quantity: number, onStep: (s: BuyStep) => void = () => {}): Promise<Hash> {
  onStep("switching");
  await switchToMezo(provider);
  const q = BigInt(quantity);
  const keyPrice = await read<bigint>("keyPrice");
  const cost = keyPrice * q;
  const w = wallet(provider, account);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  if (token === "MUSD") {
    await ensureAllowance(provider, account, MEZO_TOKENS.MUSD.address, POT, cost, onStep);
    onStep("buying");
    await mezoClient.simulateContract({ address: POT, abi: POT_ABI, functionName: "buyKeys", args: [q], account });
    const hash = await w.writeContract({ address: POT, abi: POT_ABI, functionName: "buyKeys", args: [q] });
    onStep("confirming");
    return confirm(hash);
  }

  const router = keyRouterAddress();
  const amountIn = await quoteIn(token, cost);
  if (router) {
    await ensureAllowance(provider, account, MEZO_TOKENS[token].address, router, amountIn, onStep);
    onStep("buying");
    const args = [MEZO_TOKENS[token].address, q, amountIn, deadline] as const;
    await mezoClient.simulateContract({ address: router, abi: KEY_ROUTER_ABI, functionName: "buyKeys", args, account });
    const hash = await w.writeContract({ address: router, abi: KEY_ROUTER_ABI, functionName: "buyKeys", args });
    onStep("confirming");
    return confirm(hash);
  }
  if (token === "MEZO") throw new Error("Buying with MEZO needs the BTC/MEZO key router, which is not deployed yet.");
  await ensureAllowance(provider, account, MEZO_TOKENS.BTC.address, BTC_ROUTER, amountIn, onStep);
  onStep("buying");
  const args = [q, amountIn, deadline] as const;
  await mezoClient.simulateContract({ address: BTC_ROUTER, abi: BTC_ROUTER_ABI, functionName: "buyKeysWithBTC", args, account });
  const hash = await w.writeContract({ address: BTC_ROUTER, abi: BTC_ROUTER_ABI, functionName: "buyKeysWithBTC", args });
  onStep("confirming");
  return confirm(hash);
}

// ── recording ──────────────────────────────────────────────────────────────────────────────────────────

export type PotRequest = { player: Address; setup: unknown; moves: string[] };

/** Asks the server to replay a prize descent and sign it for the pot's current round. */
export async function requestPotAttestation(url: string, body: PotRequest, fetchImpl: typeof fetch = fetch): Promise<PotAttestation> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, target: "pot" }) });
  } catch {
    throw new Error("The game's server cannot be reached. Try again in a moment.");
  }
  const data = await res.json().catch(() => null) as (PotAttestation & { error?: string }) | null;
  if (!res.ok || !data?.run || !data.signature) throw new Error(data?.error ?? `The game's server answered ${res.status}.`);
  return data;
}

/** Sends a signed prize descent to the pot. It spends one of the player's keys and adds the gold to this round. */
export async function recordInPot(provider: Eip1193, account: Address, attestation: PotAttestation, onStep: (s: RecordStep) => void = () => {}): Promise<Hash> {
  const run = runFromWire(attestation.run);
  const args = [run.player, run.runId, run.gold, run.deadline, attestation.signature] as const;
  onStep("switching");
  await switchToMezo(provider);
  await mezoClient.simulateContract({ address: POT, abi: POT_ABI, functionName: "recordRun", args, account });
  onStep("signing");
  const hash = await wallet(provider, account).writeContract({ address: POT, abi: POT_ABI, functionName: "recordRun", args });
  onStep("confirming");
  return confirm(hash);
}

/** Pays out an ended round to the given players, by their gold. Anyone may call it; the MUSD goes to the players. */
export async function distribute(provider: Eip1193, account: Address, round: number, players: Address[]): Promise<Hash> {
  await switchToMezo(provider);
  const args = [BigInt(round), players.slice(0, 200)] as const;
  await mezoClient.simulateContract({ address: POT, abi: POT_ABI, functionName: "distribute", args, account });
  return confirm(await wallet(provider, account).writeContract({ address: POT, abi: POT_ABI, functionName: "distribute", args }));
}

// ── relaying: the game's server sends the record and pays the gas ───────────────────────────────────────

/** The relayer's address if the game's server relays Mezo records, else null (then the player's wallet sends them). */
export async function relayerAddress(attestUrl: string, fetchImpl: typeof fetch = fetch): Promise<Address | null> {
  try {
    const res = await fetchImpl(attestUrl.replace(/\/attest$/, "/health"));
    const data = await res.json() as { relayer?: Address };
    return res.ok && data.relayer ? data.relayer : null;
  } catch {
    return null;
  }
}

const loginKey = (account: Address) => `emberdeep-relay-login:${account.toLowerCase()}`;

/** Whether this browser still holds a valid sign-in for the wallet, so relaying needs no popup at all. */
export function savedLogin(account: Address): { until: number; login: Hex } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(loginKey(account)) ?? "null") as { until: number; login: Hex } | null;
    return saved && saved.until > Math.floor(Date.now() / 1000) + 600 ? saved : null;
  } catch {
    return null;
  }
}

/** The one signature (a message, not a transaction) that lets the server record for this wallet for a week. */
export async function relayLogin(provider: Eip1193, account: Address): Promise<{ until: number; login: Hex }> {
  const kept = savedLogin(account);
  if (kept) return kept;
  const until = Math.floor(Date.now() / 1000) + RELAY_LOGIN_SECONDS;
  const login = await provider.request({ method: "personal_sign", params: [toHex(relayMessage(account, until)), account] }) as Hex;
  try { localStorage.setItem(loginKey(account), JSON.stringify({ until, login })); } catch { /* the sign-in is only kept for this page */ }
  return { until, login };
}

export class RelayUnavailable extends Error {}

/** Asks the server to replay, sign and send a descent to the Hall on Mezo or the Ember Pot, paying the gas itself. */
export async function relayRecord(
  attestUrl: string, body: PotRequest & { target: "mezo" | "pot"; until: number; login: Hex }, fetchImpl: typeof fetch = fetch,
): Promise<{ hash: Hash } & (Attestation | PotAttestation)> {
  let res: Response;
  try {
    res = await fetchImpl(attestUrl.replace(/\/attest$/, "/relay"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new RelayUnavailable("The game's server cannot be reached.");
  }
  const data = await res.json().catch(() => null) as ({ hash: Hash; error?: string } & (Attestation | PotAttestation)) | null;
  if (res.status === 401) {
    try { localStorage.removeItem(loginKey(body.player)); } catch { /* nothing kept */ }
  }
  if (res.status === 404 || res.status === 503) throw new RelayUnavailable(data?.error ?? "The game's server is not relaying right now.");
  if (!res.ok || !data?.hash) throw new Error(data?.error ?? `The game's server answered ${res.status}.`);
  return data;
}

// ── the Hall on Mezo ───────────────────────────────────────────────────────────────────────────────────

export const readMezoHall = (): Promise<HallBoard> => {
  const address = mezoHallAddress();
  return readHall(address ? { address } : null, mezoClient as never);
};

export async function requestMezoHallAttestation(url: string, body: PotRequest): Promise<Attestation> {
  return requestAttestation(url, { ...body, target: "mezo" } as never);
}

/** The same record as on Arc, sent to the Hall on Mezo. */
export async function recordOnMezoHall(provider: Eip1193, account: Address, attestation: Attestation, onStep: (s: RecordStep) => void = () => {}): Promise<Hash> {
  const address = mezoHallAddress();
  if (!address) throw new Error("The Hall on Mezo is not deployed yet.");
  const args = [fromWire(attestation.descent), attestation.signature] as const;
  onStep("switching");
  await switchToMezo(provider);
  await mezoClient.simulateContract({ address, abi: HALL_ABI, functionName: "record", args, account });
  onStep("signing");
  const hash = await wallet(provider, account).writeContract({ address, abi: HALL_ABI, functionName: "record", args });
  onStep("confirming");
  return confirm(hash);
}

// ── errors ─────────────────────────────────────────────────────────────────────────────────────────────

const POT_REFUSALS: [RegExp, string][] = [
  [/No key/, "You have no Ember Pot key on Mezo. Buy one, then record again."],
  [/Run already recorded/, "This descent is in the Ember Pot already."],
  [/Expired/, "The server's signature ran out. Record it again for a fresh one."],
  [/Bad signature/, "The pot did not accept the server's signature (the round may have just turned). Record it again."],
  [/Bad gold/, "The pot refused the gold of this descent."],
  [/Paused/, "The Ember Pot is paused for now. Nothing changed."],
  [/Round not ended/, "That round has not ended yet."],
];

/** A wallet, RPC or contract error on Mezo as one short sentence a player can act on. */
export function explainMezoError(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string } | null;
  let text = e?.shortMessage ?? e?.message ?? "";
  if (error instanceof BaseError) {
    const reverted = error.walk(x => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    text = `${reverted?.reason ?? reverted?.data?.errorName ?? ""} ${text}`;
  }
  for (const [pattern, message] of POT_REFUSALS) if (pattern.test(text)) return message;
  if (/AlreadyRecorded/.test(text)) return "This descent is in the Hall already.";
  if (e?.code === 4001 || /user (rejected|denied)|rejected the request/i.test(text)) return "Cancelled in the wallet. Nothing changed.";
  if (/insufficient (funds|balance)|exceeds the balance|gas required exceeds|transfer amount exceeds/i.test(text)) {
    return "Not enough on Mezo for this (or for the BTC gas). Top up from the Mezo testnet faucet.";
  }
  if (/INSUFFICIENT_OUTPUT|Underfilled|Swap underfilled/i.test(text)) return "The Tigris price moved. Try again.";
  return text.trim().split("\n")[0] || "Something went wrong on Mezo.";
}
