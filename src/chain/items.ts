// Found weapons on Mezo Testnet: the player's EmberItems, opening a Cerberus chest, and the EmberMarket where items sell
// for MUSD (or BTC or MEZO, swapped on Tigris in the same transaction). Loaded on demand, like mezo.ts.
import { parseAbi, type Address, type Hash, type Hex } from "viem";
import { dropFromWire, type DropAttestation } from "./items-typed";
import { MEZO_TOKENS, itemsAddress, marketAddress, type PayToken } from "./mezo-config";
import { confirm, ensureAllowance, loginKey, mezoClient, quoteIn, switchToMezo, wallet, type BuyStep } from "./mezo";
import type { Eip1193 } from "./wallet";
import type { OwnedItem } from "@/game/items";

export const ITEMS_ABI = parseAbi([
  "struct Drop { address player; bytes32 runId; uint16 kind; uint8 rarity; uint64 seed; uint64 deadline; }",
  "struct Item { uint16 kind; uint8 rarity; uint64 seed; }",
  "function totalMinted() view returns (uint256)",
  "function itemOf(uint256 id) view returns (Item)",
  "function itemsOwnedBy(address account, uint256 fromId, uint256 count) view returns (uint256[] ids, Item[] found)",
  "function getApproved(uint256 id) view returns (address)",
  "function approve(address spender, uint256 id)",
  "function claimDrop(Drop d, bytes signature) returns (uint256)",
]);

export const MARKET_ABI = parseAbi([
  "struct Listing { address seller; uint96 price; address collection; uint256 tokenId; }",
  "function feeBps() view returns (uint256)",
  "function openCount() view returns (uint256)",
  "function openListings(uint256 start, uint256 count) view returns (Listing[])",
  "function list(address collection, uint256 tokenId, uint96 price)",
  "function setPrice(address collection, uint256 tokenId, uint96 price)",
  "function cancel(address collection, uint256 tokenId)",
  "function buy(address collection, uint256 tokenId, uint256 maxPrice)",
  "function buyWith(address tokenIn, address collection, uint256 tokenId, uint256 maxPrice, uint256 amountIn, uint256 deadline)",
]);

const PAGE = 500n;
/** keccak256("Transfer(address,address,uint256)"). */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const itemsOrThrow = () => {
  const address = itemsAddress();
  if (!address) throw new Error("Found weapons are not deployed on Mezo yet.");
  return address;
};
const marketOrThrow = () => {
  const address = marketAddress();
  if (!address) throw new Error("The market is not deployed on Mezo yet.");
  return address;
};

const toItem = (id: bigint, i: { kind: number; rarity: number; seed: bigint }): OwnedItem => ({ id: Number(id), kind: i.kind, rarity: i.rarity, seed: i.seed });

/** Every item `account` holds, read page by page with plain calls. */
export async function readOwnedItems(account: Address): Promise<OwnedItem[]> {
  const address = itemsOrThrow();
  const total = await mezoClient.readContract({ address, abi: ITEMS_ABI, functionName: "totalMinted" });
  const out: OwnedItem[] = [];
  for (let from = 1n; from <= total; from += PAGE) {
    const [ids, found] = await mezoClient.readContract({ address, abi: ITEMS_ABI, functionName: "itemsOwnedBy", args: [account, from, PAGE] });
    ids.forEach((id, i) => out.push(toItem(id, found[i]!)));
  }
  return out;
}

// ── the chest ──────────────────────────────────────────────────────────────────────────────────────────

export type ChestRequest = { player: Address; setup: unknown; moves: string[] };
export type ChestResult = { empty: true } | { empty: false; item: OwnedItem | null; hash: Hash | null };

async function post(url: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("The game's server cannot be reached. Try again in a moment.");
  }
  return { res, data: await res.json().catch(() => null) as Record<string, unknown> | null };
}

/** The id of the item a confirmed claimDrop minted, from the transaction's Transfer event. */
async function mintedId(hash: Hash): Promise<bigint | null> {
  const receipt = await mezoClient.getTransactionReceipt({ hash });
  const transfer = receipt.logs.find(l => l.address.toLowerCase() === itemsOrThrow().toLowerCase() && l.topics[0] === TRANSFER_TOPIC);
  return transfer ? BigInt(transfer.topics[3]!) : null;
}

/** Opens the chest through the relayer: it signs and sends the drop and pays the gas. Null when it does not relay. */
export async function openChestRelayed(attestUrl: string, body: ChestRequest & { until: number; login: Hex }): Promise<ChestResult | null> {
  const { res, data } = await post(attestUrl.replace(/\/attest$/, "/relay"), { ...body, target: "drop" });
  if (res.status === 401) {
    try { localStorage.removeItem(loginKey(body.player)); } catch { /* nothing kept */ }
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok || !data) throw new Error((data?.error as string) ?? `The game's server answered ${res.status}.`);
  if (data.empty) return { empty: true };
  const drop = dropFromWire((data as unknown as DropAttestation).drop);
  const hash = data.hash as Hash;
  const id = await mintedId(hash).catch(() => null);
  return { empty: false, hash, item: id ? { id: Number(id), kind: drop.kind, rarity: drop.rarity, seed: drop.seed } : null };
}

/** Opens the chest from the player's own wallet: the server signs the drop, the wallet sends it and pays the gas. */
export async function openChestFromWallet(attestUrl: string, provider: Eip1193, account: Address, body: ChestRequest): Promise<ChestResult> {
  const { res, data } = await post(attestUrl, { ...body, target: "drop" });
  if (!res.ok || !data) throw new Error((data?.error as string) ?? `The game's server answered ${res.status}.`);
  if (data.empty) return { empty: true };
  const attestation = data as unknown as DropAttestation;
  const args = [dropFromWire(attestation.drop), attestation.signature] as const;
  const address = itemsOrThrow();
  await switchToMezo(provider);
  await mezoClient.simulateContract({ address, abi: ITEMS_ABI, functionName: "claimDrop", args, account });
  const hash = await confirm(await wallet(provider, account).writeContract({ address, abi: ITEMS_ABI, functionName: "claimDrop", args }));
  const drop = args[0];
  const id = await mintedId(hash).catch(() => null);
  return { empty: false, hash, item: id ? { id: Number(id), kind: drop.kind, rarity: drop.rarity, seed: drop.seed } : null };
}

// ── the market ─────────────────────────────────────────────────────────────────────────────────────────

export type MarketListing = { seller: Address; price: bigint; item: OwnedItem };

/** Every open listing of found weapons, with what each item is. */
export async function readMarket(): Promise<{ listings: MarketListing[]; feeBps: number }> {
  const market = marketOrThrow();
  const items = itemsOrThrow().toLowerCase();
  const [count, feeBps] = await Promise.all([
    mezoClient.readContract({ address: market, abi: MARKET_ABI, functionName: "openCount" }),
    mezoClient.readContract({ address: market, abi: MARKET_ABI, functionName: "feeBps" }),
  ]);
  const raw = [];
  for (let start = 0n; start < count; start += PAGE) {
    raw.push(...await mezoClient.readContract({ address: market, abi: MARKET_ABI, functionName: "openListings", args: [start, PAGE] }));
  }
  const ours = raw.filter(l => l.collection.toLowerCase() === items);
  const details = await Promise.all(ours.map(l => mezoClient.readContract({ address: itemsOrThrow(), abi: ITEMS_ABI, functionName: "itemOf", args: [l.tokenId] })));
  const listings = ours.map((l, i) => ({ seller: l.seller, price: l.price, item: toItem(l.tokenId, details[i]!) }));
  return { listings: listings.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0)), feeBps: Number(feeBps) };
}

export type MarketStep = BuyStep;

/** Lists an item at `price` MUSD (18 decimals). The market holds it until it sells or the seller takes it back. */
export async function listItem(provider: Eip1193, account: Address, id: number, price: bigint, onStep: (s: MarketStep) => void = () => {}): Promise<Hash> {
  const market = marketOrThrow();
  const items = itemsOrThrow();
  onStep("switching");
  await switchToMezo(provider);
  const w = wallet(provider, account);
  const approved = await mezoClient.readContract({ address: items, abi: ITEMS_ABI, functionName: "getApproved", args: [BigInt(id)] });
  if (approved.toLowerCase() !== market.toLowerCase()) {
    onStep("approving");
    await confirm(await w.writeContract({ address: items, abi: ITEMS_ABI, functionName: "approve", args: [market, BigInt(id)] }));
  }
  onStep("buying");
  const args = [items, BigInt(id), price] as const;
  await mezoClient.simulateContract({ address: market, abi: MARKET_ABI, functionName: "list", args, account });
  const hash = await w.writeContract({ address: market, abi: MARKET_ABI, functionName: "list", args });
  onStep("confirming");
  return confirm(hash);
}

/** Takes a listed item back to the seller's wallet. */
export async function cancelListing(provider: Eip1193, account: Address, id: number): Promise<Hash> {
  const market = marketOrThrow();
  await switchToMezo(provider);
  const args = [itemsOrThrow(), BigInt(id)] as const;
  await mezoClient.simulateContract({ address: market, abi: MARKET_ABI, functionName: "cancel", args, account });
  return confirm(await wallet(provider, account).writeContract({ address: market, abi: MARKET_ABI, functionName: "cancel", args }));
}

/** Buys a listing with MUSD, or with BTC or MEZO swapped to MUSD on Tigris in the same transaction. */
export async function buyListing(provider: Eip1193, account: Address, listing: MarketListing, token: PayToken, onStep: (s: MarketStep) => void = () => {}): Promise<Hash> {
  const market = marketOrThrow();
  const items = itemsOrThrow();
  onStep("switching");
  await switchToMezo(provider);
  const w = wallet(provider, account);
  const id = BigInt(listing.item.id);
  if (token === "MUSD") {
    await ensureAllowance(provider, account, MEZO_TOKENS.MUSD.address, market, listing.price, onStep);
    onStep("buying");
    const args = [items, id, listing.price] as const;
    await mezoClient.simulateContract({ address: market, abi: MARKET_ABI, functionName: "buy", args, account });
    const hash = await w.writeContract({ address: market, abi: MARKET_ABI, functionName: "buy", args });
    onStep("confirming");
    return confirm(hash);
  }
  const amountIn = await quoteIn(token, listing.price);
  await ensureAllowance(provider, account, MEZO_TOKENS[token].address, market, amountIn, onStep);
  onStep("buying");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const args = [MEZO_TOKENS[token].address, items, id, listing.price, amountIn, deadline] as const;
  await mezoClient.simulateContract({ address: market, abi: MARKET_ABI, functionName: "buyWith", args, account });
  const hash = await w.writeContract({ address: market, abi: MARKET_ABI, functionName: "buyWith", args });
  onStep("confirming");
  return confirm(hash);
}
