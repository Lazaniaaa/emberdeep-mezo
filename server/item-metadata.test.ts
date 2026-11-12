// GET /api/item/<id>: the metadata EmberItems' tokenURI points to. The server reads what the item is from the chain
// (stubbed here), words it with the game's own item rules, keeps it, and limits how often one address may ask.
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RARITIES } from "@/game/catalog";
import { ITEM_KINDS, itemStats, type Item } from "@/game/items";
import { itemImagePath, itemMetadata, type ItemMetadata } from "@/game/item-metadata";
import { createAttestServer, type AttestConfig, type ItemsTarget } from "./attest";

const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OWNER = getAddress("0x00000000000000000000000000000000000000b1");
const SITE = "https://emberdeep.example";

/** A sword whose seed picks the finish and the level perk the tests name. */
function swordWith(perk: string, rarity: number, finish = 5n): Item {
  for (let i = 0n; i < 64n; i++) {
    const item = { kind: 2, rarity, seed: (i << 8n) | finish };
    if (itemStats(item).perk!.id === perk) return item;
  }
  throw new Error(`No sword with ${perk}`);
}

const close: (() => void)[] = [];
afterAll(() => close.forEach(c => c()));

/** A server over a stub chain: `minted` is what exists, `reads` counts the chain reads, `down` makes Mezo not answer. */
async function start(overrides: Partial<AttestConfig> = {}) {
  const chain = { minted: new Map<number, Item>(), reads: 0, down: false, now: 1_800_000_000_000 };
  const items: ItemsTarget = {
    address: getAddress("0x00000000000000000000000000000000000000a1"), chainId: 31611, secret: "test-secret-test-secret-test-secret",
    readItem: async id => {
      chain.reads++;
      if (chain.down) throw new Error("HTTP request failed. fetch failed");
      const item = chain.minted.get(id);
      if (!item) throw new Error('The contract function "ownerOf" reverted with the following signature:\n0xceea21b6');
      return { owner: OWNER as Address, item };
    },
  };
  const server = createAttestServer({
    account: signer, hall: null, chainId: 31611, ttlSeconds: 3600, now: () => chain.now, log: () => {}, items, siteUrl: SITE, ...overrides,
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  close.push(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { chain, base, get: (path: string, init?: RequestInit) => fetch(`${base}${path}`, init) };
}

describe("item metadata", () => {
  it("answers a minted item in the ERC-721 metadata shape, with the game's own numbers", async () => {
    const { chain, get } = await start();
    const sword = swordWith("ember-heart", 3);
    chain.minted.set(12, sword);
    const res = await get("/api/item/12");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const meta = await res.json() as ItemMetadata;
    expect(meta.name).toBe("Moonlit Sword #12");
    expect(meta.image).toBe(`${SITE}/items/nft/sword-legendary.png`);
    expect(meta.external_url).toBe(SITE);
    expect(meta.description).toContain("Legendary sword with a Moonlit finish");
    expect(meta.attributes).toEqual([
      { trait_type: "Kind", value: "Sword" },
      { trait_type: "Rarity", value: "Legendary" },
      { trait_type: "Finish", value: "Moonlit" },
      { trait_type: "Damage", value: itemStats(sword).damage, display_type: "number" },
      { trait_type: "Light per kill", value: 2, display_type: "number" },
      { trait_type: "Level perk", value: "Ember Heart III" },
    ]);
  });

  it("lists only what an item does: a common pickaxe has its gold bonus and nothing else", async () => {
    const { chain, get } = await start();
    chain.minted.set(1, { kind: 0, rarity: 0, seed: 2n });
    const meta = await (await get("/api/item/1")).json() as ItemMetadata;
    expect(meta.name).toBe("Gloomsteel Pickaxe #1");
    expect(meta.image).toBe(`${SITE}/items/nft/pickaxe-common.png`);
    expect(meta.attributes.map(a => a.trait_type)).toEqual(["Kind", "Rarity", "Finish", "Damage", "Gold bonus"]);
    expect(meta.attributes.at(-1)).toEqual({ trait_type: "Gold bonus", value: 15, display_type: "boost_percentage" });
  });

  it("answers 404 for an id that is not minted, and for anything that is not a token id", async () => {
    const { get } = await start();
    const missing = await get("/api/item/7");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.json()).toEqual({ error: "No such item" });
    for (const path of ["/api/item/0", "/api/item/-1", "/api/item/1.5", "/api/item/abc", "/api/item/", "/api/item/1/2", "/api/item/1234567890123456"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  it("reads a minted item from the chain once, and asks again for a missing id only after a while", async () => {
    const { chain, get } = await start();
    chain.minted.set(3, { kind: 1, rarity: 1, seed: 6n });
    await get("/api/item/3");
    await get("/api/item/3");
    expect(chain.reads).toBe(1);

    expect((await get("/api/item/4")).status).toBe(404);
    expect((await get("/api/item/4")).status).toBe(404);
    expect(chain.reads).toBe(2);
    // Minted in the meantime: seen once the short memory of "not minted" runs out.
    chain.minted.set(4, { kind: 3, rarity: 2, seed: 7n });
    chain.now += 31_000;
    const meta = await (await get("/api/item/4")).json() as ItemMetadata;
    expect(meta.name).toBe("Starforged Spear #4");
    expect(chain.reads).toBe(3);
  });

  it("answers 503 when Mezo does not answer, without remembering it", async () => {
    const { chain, get } = await start();
    chain.minted.set(5, { kind: 1, rarity: 0, seed: 0n });
    chain.down = true;
    expect((await get("/api/item/5")).status).toBe(503);
    chain.down = false;
    expect((await get("/api/item/5")).status).toBe(200);
  });

  it("limits how often one address may ask, apart from the signing limit", async () => {
    const { chain, get } = await start({ itemLimit: { max: 3, windowMs: 60_000 }, rateLimit: { max: 1, windowMs: 60_000 } });
    chain.minted.set(1, { kind: 1, rarity: 0, seed: 0n });
    for (let i = 0; i < 3; i++) expect((await get("/api/item/1")).status).toBe(200);
    expect((await get("/api/item/1")).status).toBe(429);
    // Reading metadata did not use up the one signing request, and health is never limited.
    const sign = await get("/api/attest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(sign.status).toBe(400);
    expect((await get("/api/health")).status).toBe(200);
    chain.now += 61_000;
    expect((await get("/api/item/1")).status).toBe(200);
  });

  it("takes GET only, and answers 404 when found weapons are not set up", async () => {
    const { chain, get } = await start();
    chain.minted.set(1, { kind: 1, rarity: 0, seed: 0n });
    expect((await get("/api/item/1", { method: "POST" })).status).toBe(405);
    expect((await get("/api/item/1", { method: "HEAD" })).status).toBe(200);
    const bare = await start({ items: undefined });
    expect((await bare.get("/api/item/1")).status).toBe(404);
  });

  it("links pictures on the site the request came to when no site address is set", async () => {
    const { chain, base, get } = await start({ siteUrl: undefined });
    chain.minted.set(1, { kind: 3, rarity: 1, seed: 0n });
    const meta = await (await get("/api/item/1")).json() as ItemMetadata;
    expect(meta.image).toBe(`${base}/items/nft/spear-rare.png`);
    // Behind Caddy the visitor came over https.
    const https = await (await get("/api/item/1", { headers: { "x-forwarded-proto": "https" } })).json() as ItemMetadata;
    expect(https.image).toBe(`${base.replace("http:", "https:")}/items/nft/spear-rare.png`);
  });

  it("gives an item the game does not know honest metadata, without a picture", async () => {
    const { chain, get } = await start();
    chain.minted.set(9, { kind: 40, rarity: 9, seed: 1n });
    const res = await get("/api/item/9");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "Emberdeep item #9",
      description: "An item from Emberdeep that this version of the game does not know.",
      external_url: SITE,
      attributes: [{ trait_type: "Kind", value: 40, display_type: "number" }, { trait_type: "Rarity", value: 9, display_type: "number" }],
    });
  });
});

describe("item pictures", () => {
  it("exist in the site for every kind and rarity the metadata can link", () => {
    for (let kind = 0; kind < ITEM_KINDS.length; kind++) for (let rarity = 0; rarity < RARITIES.length; rarity++) {
      const item = { kind, rarity, seed: 0n };
      const path = itemImagePath(item);
      expect(itemMetadata(1, item, SITE).image).toBe(`${SITE}/${path}`);
      expect(existsSync(`public/${path}`), `public/${path} (run: node scripts/sprite-sheets.mjs items)`).toBe(true);
    }
  });
});
