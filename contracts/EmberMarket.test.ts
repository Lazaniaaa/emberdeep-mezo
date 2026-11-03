// Runs the compiled EmberMarket in a real EVM (ethereumjs) with real EmberItems and a mock MUSD, BTC, MEZO, Tigris
// router and Ember Pot.
import { beforeAll, describe, expect, it } from "vitest";
import type { Abi, Hex } from "viem";
import { createChain, type Compiled, type Deployed } from "./evm";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";

const SELLER = "0x00000000000000000000000000000000000000b1" as Hex;
const BUYER = "0x00000000000000000000000000000000000000b2" as Hex;
const STRANGER = "0x00000000000000000000000000000000000000c2" as Hex;
const SIGNER = "0x00000000000000000000000000000000000000e5" as Hex;
const E18 = 10n ** 18n;
const DEADLINE = 1_900_000_000n;

let chain: Awaited<ReturnType<typeof createChain>>;
let musd: Deployed, btc: Deployed, mezo: Deployed, tigris: Deployed, pot: Deployed, items: Deployed, other: Deployed, market: Deployed;
let marketAbi: Abi;

const ownerOf = async (c: Deployed, id: bigint) => String(await c.read("ownerOf", [id])).toLowerCase();
const balance = async (t: Deployed, who: Hex) => await t.read("balanceOf", [who]) as bigint;

/** Mints an item to the seller and lists it at `price` MUSD. */
async function listNew(price: bigint, collection = items) {
  await collection.send(chain.deployer, "mint", [SELLER, 1, 2, 42n]);
  const id = await collection.read("totalMinted") as bigint;
  await collection.send(SELLER, "approve", [market.address, id]);
  const r = await market.send(SELLER, "list", [collection.address, id, price]);
  if (!r.ok) throw new Error(r.error);
  return id;
}

describe("EmberMarket", () => {
  beforeAll(async () => {
    chain = await createChain();
    const mock = (name: string) => compileContract("contracts/test/RouterMocks.sol", name) as Compiled;
    const token = mock("MockToken");
    [musd, btc, mezo] = [await chain.deploy(token), await chain.deploy(token), await chain.deploy(token)];
    tigris = await chain.deploy(mock("MockTigris"));
    pot = await chain.deploy(mock("MockPot"), [{ type: "address" }], [musd.address]);
    const itemsCompiled = compileContract(CONTRACTS.EmberItems, "EmberItems") as Compiled;
    for (const name of ["items", "other"] as const) {
      const c = await chain.deploy(itemsCompiled, [{ type: "address" }, { type: "string" }], [SIGNER, ""]);
      await c.send(chain.deployer, "setMinter", [chain.deployer, true]);
      if (name === "items") items = c; else other = c;
    }
    const compiled = compileContract(CONTRACTS.EmberMarket, "EmberMarket") as Compiled;
    marketAbi = compiled.abi;
    market = await chain.deploy(compiled,
      [...Array(6).fill({ type: "address" }), { type: "bool" }, { type: "uint256" }],
      [musd.address, btc.address, mezo.address, tigris.address, chain.deployer, pot.address, true, 500n]);
    await market.send(chain.deployer, "setCollection", [items.address, true]);
    // 1 BTC buys 60,000 MUSD; 1 MEZO buys 0.9 MUSD.
    await tigris.send(chain.deployer, "setRate", [btc.address, 60_000n * E18]);
    await tigris.send(chain.deployer, "setRate", [mezo.address, (9n * E18) / 10n]);
    for (const t of [musd, btc, mezo]) await t.send(chain.deployer, "mint", [BUYER, 1_000n * E18]);
  }, 120_000);

  it("lets the owner only choose collections", () => {
    const writes = marketAbi.filter(i => i.type === "function" && i.stateMutability !== "view" && i.stateMutability !== "pure").map(i => (i as { name: string }).name).sort();
    expect(writes).toEqual(["acceptOwnership", "buy", "buyWith", "cancel", "list", "setCollection", "setPrice", "transferOwnership"]);
  });

  it("holds a listed item and shows it among the open listings", async () => {
    const id = await listNew(10n * E18);
    expect(await ownerOf(items, id)).toBe(market.address.toLowerCase());
    expect(await market.read("openCount")).toBe(1n);
    const [l] = await market.read("openListings", [0n, 10n]) as { seller: Hex; price: bigint; collection: Hex; tokenId: bigint }[];
    expect(l!.seller.toLowerCase()).toBe(SELLER);
    expect(l!.price).toBe(10n * E18);
    expect(l!.tokenId).toBe(id);
  });

  it("sells for MUSD: 5% into the pot's prizes, the rest to the seller, the item to the buyer", async () => {
    const id = await listNew(20n * E18);
    const sellerBefore = await balance(musd, SELLER);
    await musd.send(BUYER, "approve", [market.address, 20n * E18]);
    const r = await market.send(BUYER, "buy", [items.address, id, 20n * E18]);
    if (!r.ok) throw new Error(r.error);
    expect(await ownerOf(items, id)).toBe(BUYER);
    expect(await pot.read("funded")).toBe(E18);
    expect(await balance(musd, SELLER) - sellerBefore).toBe(19n * E18);
    expect(await balance(musd, market.address)).toBe(0n);
    expect(await musd.read("allowance", [market.address, pot.address])).toBe(0n);
    expect(r.logs.find(l => l.eventName === "Sold")?.args).toMatchObject({ tokenId: id, price: 20n * E18, fee: E18 });
    expect(await market.send(BUYER, "listingOf", [items.address, id])).toMatchObject({ ok: false, error: "NotListed" });
  });

  it("sells for MEZO through Tigris and returns the extra MUSD", async () => {
    const id = await listNew(2n * E18);
    const amountIn = 3n * E18; // 2.7 MUSD for a 2 MUSD item
    const musdBefore = await balance(musd, BUYER);
    await mezo.send(BUYER, "approve", [market.address, amountIn]);
    const r = await market.send(BUYER, "buyWith", [mezo.address, items.address, id, 2n * E18, amountIn, DEADLINE]);
    if (!r.ok) throw new Error(r.error);
    expect(await ownerOf(items, id)).toBe(BUYER);
    expect(await balance(musd, BUYER) - musdBefore).toBe((7n * E18) / 10n);
    expect(await balance(musd, market.address)).toBe(0n);
    expect(await balance(mezo, market.address)).toBe(0n);
    expect(await mezo.read("allowance", [market.address, tigris.address])).toBe(0n);
  });

  it("sells for BTC, and refuses other tokens or a swap that falls short", async () => {
    const id = await listNew(E18);
    await btc.send(BUYER, "approve", [market.address, E18]);
    expect(await market.send(BUYER, "buyWith", [musd.address, items.address, id, E18, E18, DEADLINE])).toMatchObject({ ok: false, error: "BadToken" });
    expect((await market.send(BUYER, "buyWith", [mezo.address, items.address, id, E18, E18, DEADLINE])).ok).toBe(false); // 0.9 < 1
    expect((await market.send(BUYER, "buyWith", [btc.address, items.address, id, E18, E18 / 50_000n, DEADLINE])).ok).toBe(true);
    expect(await ownerOf(items, id)).toBe(BUYER);
  });

  it("protects the buyer from a price raised after they looked", async () => {
    const id = await listNew(E18);
    expect(await market.send(STRANGER, "setPrice", [items.address, id, 5n * E18])).toMatchObject({ ok: false, error: "NotSeller" });
    expect((await market.send(SELLER, "setPrice", [items.address, id, 5n * E18])).ok).toBe(true);
    await musd.send(BUYER, "approve", [market.address, 5n * E18]);
    expect(await market.send(BUYER, "buy", [items.address, id, E18])).toMatchObject({ ok: false, error: "PriceAbove" });
    expect((await market.send(BUYER, "buy", [items.address, id, 5n * E18])).ok).toBe(true);
  });

  it("gives an item back only to its seller", async () => {
    const id = await listNew(E18);
    expect(await market.send(STRANGER, "cancel", [items.address, id])).toMatchObject({ ok: false, error: "NotSeller" });
    expect((await market.send(SELLER, "cancel", [items.address, id])).ok).toBe(true);
    expect(await ownerOf(items, id)).toBe(SELLER);
    expect(await market.send(SELLER, "cancel", [items.address, id])).toMatchObject({ ok: false, error: "NotListed" });
  });

  it("keeps the open list consistent when listings leave from the middle", async () => {
    const before = await market.read("openCount") as bigint;
    const ids = [await listNew(E18), await listNew(2n * E18), await listNew(3n * E18)];
    await market.send(SELLER, "cancel", [items.address, ids[0]]);
    const open = await market.read("openListings", [0n, 100n]) as { tokenId: bigint; price: bigint }[];
    expect(open.length).toBe(Number(before) + 2);
    for (const id of ids.slice(1)) {
      const l = await market.read("listingOf", [items.address, id]) as { tokenId: bigint };
      expect(l.tokenId).toBe(id);
    }
    expect(open.filter(l => ids.includes(l.tokenId)).map(l => l.price).sort()).toEqual([2n * E18, 3n * E18]);
  });

  it("refuses collections the owner has not allowed, and zero prices", async () => {
    await expect(listNew(E18, other)).rejects.toThrow("NotAllowed");
    await items.send(chain.deployer, "mint", [SELLER, 1, 0, 1n]);
    const id = await items.read("totalMinted") as bigint;
    await items.send(SELLER, "approve", [market.address, id]);
    expect(await market.send(SELLER, "list", [items.address, id, 0n])).toMatchObject({ ok: false, error: "BadPrice" });
    expect(await market.send(STRANGER, "setCollection", [other.address, true])).toMatchObject({ ok: false, error: "NotOwner" });
  });

  it("still sells or returns what was listed after its collection is taken off", async () => {
    const id = await listNew(E18);
    await market.send(chain.deployer, "setCollection", [items.address, false]);
    await expect(listNew(E18)).rejects.toThrow("NotAllowed");
    await musd.send(BUYER, "approve", [market.address, E18]);
    expect((await market.send(BUYER, "buy", [items.address, id, E18])).ok).toBe(true);
    await market.send(chain.deployer, "setCollection", [items.address, true]);
  });

  it("refuses a fee above 10% at deployment", async () => {
    const compiled = compileContract(CONTRACTS.EmberMarket, "EmberMarket") as Compiled;
    await expect(chain.deploy(compiled,
      [...Array(6).fill({ type: "address" }), { type: "bool" }, { type: "uint256" }],
      [musd.address, btc.address, mezo.address, tigris.address, chain.deployer, pot.address, true, 1001n])).rejects.toThrow();
  });
});
