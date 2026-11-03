// Cerberus chests: the server opens one only for a descent that slew Cerberus and came home, rolls it from its secret,
// and the compiled EmberItems accepts the signed drop. Found weapons count only when the player holds them on chain.
// The replay itself is covered by attest.test.ts; here it is stubbed to give the result each case needs.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { dropFromWire, type DropAttestation } from "@/chain/items-typed";
import { NO_PERKS } from "@/game/catalog";
import { itemStats, rollChest, type Item } from "@/game/items";
import { emptyBag, type RunSetup } from "@/game/run";
import { EVM_CHAIN_ID, EVM_NOW, createChain, type Compiled, type Deployed } from "../contracts/evm";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";
import { chestRoll, createAttestServer, dropIdOf, type AttestConfig, type EmptyChest, type ItemsTarget } from "./attest";

const outcome = vi.hoisted(() => ({ bossSlain: true, home: true }));
vi.mock("@/game/replay", async importOriginal => {
  const replay = await importOriginal<typeof import("@/game/replay")>();
  return {
    ...replay,
    replayRun: (rawSetup: unknown) => {
      const setup = replay.validateSetup(rawSetup);
      return { setup, state: {}, depth: 7, gold: 300, kills: 30, ...outcome };
    },
  };
});

const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const PLAYER = getAddress("0x00000000000000000000000000000000000000b1");
const SECRET = "test-secret";
const setup = (seed: number, over: Partial<RunSetup> = {}) => ({ seed, flasks: 3, perks: { ...NO_PERKS }, weaponDamage: 16, bag: emptyBag(), ...over });

let items: Deployed;
const held = new Map<number, { owner: Address; item: Item }>();
const close: (() => void)[] = [];

async function start(overrides: Partial<AttestConfig> = {}) {
  const itemsTarget: ItemsTarget = {
    address: items.address as Address, chainId: EVM_CHAIN_ID, secret: SECRET,
    readItem: async id => { const h = held.get(id); if (!h) throw new Error("not minted"); return h; },
  };
  const server = createAttestServer({
    account: signer, hall: null, chainId: EVM_CHAIN_ID, ttlSeconds: 3600, now: () => Number(EVM_NOW) * 1000, log: () => {},
    items: itemsTarget, ...overrides,
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  close.push(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (body: unknown) => fetch(`${url}/api/attest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeAll(async () => {
  const chain = await createChain();
  items = await chain.deploy(compileContract(CONTRACTS.EmberItems, "EmberItems") as Compiled, [{ type: "address" }, { type: "string" }], [signer.address, ""]);
}, 120_000);
afterAll(() => close.forEach(c => c()));

describe("Cerberus chests", () => {
  it("opens a chest for a descent that slew Cerberus and came home, and EmberItems mints it", async () => {
    const post = await start();
    const res = await post({ player: PLAYER, setup: setup(11), moves: ["X"], target: "drop" });
    expect(res.status).toBe(200);
    const { drop, signature } = await res.json() as DropAttestation;
    const dropId = dropIdOf(PLAYER, 11);
    expect(drop.runId).toBe(dropId);
    expect(dropFromWire(drop)).toMatchObject({ player: PLAYER, ...rollChest(chestRoll(SECRET, dropId)) });
    const r = await items.send(PLAYER, "claimDrop", [dropFromWire(drop), signature]);
    if (!r.ok) throw new Error(r.error);
    expect(String(await items.read("ownerOf", [1n])).toLowerCase()).toBe(PLAYER.toLowerCase());
  });

  it("gives one chest per dungeon seed, whatever else changes in the setup", async () => {
    const post = await start();
    const a = await (await post({ player: PLAYER, setup: setup(12), moves: ["X"], target: "drop" })).json() as DropAttestation;
    const b = await (await post({ player: PLAYER, setup: setup(12, { flasks: 4 }), moves: ["W", "X"], target: "drop" })).json() as DropAttestation;
    expect(b.drop).toMatchObject({ runId: a.drop.runId, kind: a.drop.kind, rarity: a.drop.rarity, seed: a.drop.seed });
    expect((await items.send(PLAYER, "claimDrop", [dropFromWire(a.drop), a.signature])).ok).toBe(true);
    expect(await items.send(PLAYER, "claimDrop", [dropFromWire(b.drop), b.signature])).toMatchObject({ ok: false, error: "AlreadyDropped" });
  });

  it("refuses a descent that did not slay Cerberus, or did not come home", async () => {
    const post = await start();
    outcome.bossSlain = false;
    expect((await post({ player: PLAYER, setup: setup(13), moves: ["X"], target: "drop" })).status).toBe(422);
    outcome.bossSlain = true;
    outcome.home = false;
    expect((await post({ player: PLAYER, setup: setup(13), moves: ["X"], target: "drop" })).status).toBe(422);
    outcome.home = true;
  });

  it("answers an empty chest plainly when the chance misses, and 404 when chests are not set up", async () => {
    const roll = vi.spyOn(await import("@/game/items"), "rollChest");
    roll.mockReturnValueOnce(null);
    const post = await start();
    const empty = await (await post({ player: PLAYER, setup: setup(14), moves: ["X"], target: "drop" })).json() as EmptyChest;
    roll.mockRestore();
    expect(empty).toEqual({ empty: true, dropId: dropIdOf(PLAYER, 14) });
    const bare = await start({ items: undefined });
    expect((await bare({ player: PLAYER, setup: setup(14), moves: ["X"], target: "drop" })).status).toBe(404);
  });

  it("lets a descent carry a found weapon only when its player holds that item", async () => {
    const post = await start();
    const axe: Item = { kind: 1, rarity: 2, seed: 99n };
    const carrying = setup(15, { weaponDamage: itemStats(axe).damage, item: { id: 7, kind: 1, rarity: 2, seed: "99" } });
    expect((await post({ player: PLAYER, setup: carrying, moves: ["X"], target: "drop" })).status).toBe(422); // not minted
    held.set(7, { owner: getAddress("0x00000000000000000000000000000000000000c2"), item: axe });
    expect((await post({ player: PLAYER, setup: carrying, moves: ["X"], target: "drop" })).status).toBe(422); // someone else's
    held.set(7, { owner: PLAYER, item: { ...axe, rarity: 3 } });
    expect((await post({ player: PLAYER, setup: carrying, moves: ["X"], target: "drop" })).status).toBe(422); // not that item
    held.set(7, { owner: PLAYER, item: axe });
    expect((await post({ player: PLAYER, setup: carrying, moves: ["X"], target: "drop" })).status).toBe(200);
  });
});

