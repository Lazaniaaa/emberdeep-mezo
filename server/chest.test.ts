// Cerberus chests: the server opens one only for a prize descent that slew Cerberus, came home and is already in the
// Ember Pot, rolls it from its secret, and the compiled EmberItems accepts the signed drop. Found weapons count only when
// the player holds them on chain. The replay itself is covered by attest.test.ts; here it is stubbed to give the result
// each case needs.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { dropFromWire, type DropAttestation } from "@/chain/items-typed";
import { rollChest, type Item } from "@/game/items";
import { prizeSetup } from "@/game/prize";
import { validateSetup } from "@/game/replay";
import { EVM_CHAIN_ID, EVM_NOW, createChain, type Compiled, type Deployed } from "../contracts/evm";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";
import { chestRoll, createAttestServer, runIdOf, signStart, type AttestConfig, type EmptyChest, type ItemsTarget } from "./attest";

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
const OTHER = getAddress("0x00000000000000000000000000000000000000c2");
const SECRET = "test-secret";
const MOVES = ["X"];

let items: Deployed;
const held = new Map<number, { owner: Address; item: Item }>();
/** The runIds the stub Ember Pot holds. */
const recorded = new Set<string>();
const close: (() => void)[] = [];

/** Puts a descent in the stub pot, as a Claim would, and answers its runId. */
function claimed(setup: unknown, player: Address = PLAYER) {
  const runId = runIdOf(player, validateSetup(setup), MOVES);
  recorded.add(runId);
  return runId;
}

async function start(overrides: Partial<AttestConfig> = {}) {
  const itemsTarget: ItemsTarget = {
    address: items.address as Address, chainId: EVM_CHAIN_ID, secret: SECRET,
    readItem: async id => { const h = held.get(id); if (!h) throw new Error("ownerOf reverted"); return h; },
  };
  const server = createAttestServer({
    account: signer, hall: null, chainId: EVM_CHAIN_ID, ttlSeconds: 3600, now: () => Number(EVM_NOW) * 1000, log: () => {},
    items: itemsTarget,
    pot: {
      address: getAddress("0x00000000000000000000000000000000000000d3"), chainId: EVM_CHAIN_ID, launchTime: 0, roundSeconds: 604800,
      maxGold: 5000, runRecorded: async runId => recorded.has(runId),
    },
    ...overrides,
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  close.push(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (body: unknown) => fetch(`${url}/api/attest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const ask = (setup: unknown, player: Address = PLAYER) => ({ player, setup, moves: MOVES, target: "drop" });

beforeAll(async () => {
  const chain = await createChain();
  items = await chain.deploy(compileContract(CONTRACTS.EmberItems, "EmberItems") as Compiled, [{ type: "address" }, { type: "string" }], [signer.address, ""]);
}, 120_000);
afterAll(() => close.forEach(c => c()));

describe("Cerberus chests", () => {
  it("opens the chest of a prize descent in the pot, and EmberItems mints it", async () => {
    const post = await start();
    const runId = claimed(prizeSetup(11));
    const res = await post(ask(prizeSetup(11)));
    expect(res.status).toBe(200);
    const { drop, signature } = await res.json() as DropAttestation;
    expect(drop.runId).toBe(runId);
    expect(dropFromWire(drop)).toMatchObject({ player: PLAYER, ...rollChest(chestRoll(SECRET, runId)) });
    const r = await items.send(PLAYER, "claimDrop", [dropFromWire(drop), signature]);
    if (!r.ok) throw new Error(r.error);
    expect(String(await items.read("ownerOf", [1n])).toLowerCase()).toBe(PLAYER.toLowerCase());
  });

  it("waits for the Claim, and the same moves under another player open nothing", async () => {
    const post = await start();
    expect((await post(ask(prizeSetup(12)))).status).toBe(409);
    claimed(prizeSetup(12));
    expect((await post(ask(prizeSetup(12)))).status).toBe(200);
    expect((await post(ask(prizeSetup(12), OTHER))).status).toBe(409);
  });

  it("gives one chest per pot record", async () => {
    const post = await start();
    claimed(prizeSetup(13));
    const a = await (await post(ask(prizeSetup(13)))).json() as DropAttestation;
    const b = await (await post(ask(prizeSetup(13)))).json() as DropAttestation;
    expect(b.drop).toMatchObject({ runId: a.drop.runId, kind: a.drop.kind, rarity: a.drop.rarity, seed: a.drop.seed });
    expect((await items.send(PLAYER, "claimDrop", [dropFromWire(a.drop), a.signature])).ok).toBe(true);
    expect(await items.send(PLAYER, "claimDrop", [dropFromWire(b.drop), b.signature])).toMatchObject({ ok: false, error: "AlreadyDropped" });
  });

  it("refuses a practice descent, or one that did not slay Cerberus or come home", async () => {
    const post = await start();
    const practice = { ...prizeSetup(14), flasks: 5 };
    claimed(practice);
    expect((await post(ask(practice))).status).toBe(422);
    claimed(prizeSetup(14));
    outcome.bossSlain = false;
    expect((await post(ask(prizeSetup(14)))).status).toBe(422);
    outcome.bossSlain = true;
    outcome.home = false;
    expect((await post(ask(prizeSetup(14)))).status).toBe(422);
    outcome.home = true;
  });

  it("answers an empty chest plainly when the chance misses, and 404 when chests are not set up", async () => {
    const roll = vi.spyOn(await import("@/game/items"), "rollChest");
    roll.mockReturnValueOnce(null);
    const post = await start();
    const runId = claimed(prizeSetup(15));
    const empty = await (await post(ask(prizeSetup(15)))).json() as EmptyChest;
    roll.mockRestore();
    expect(empty).toEqual({ empty: true, dropId: runId });
    const bare = await start({ items: undefined });
    expect((await bare(ask(prizeSetup(15)))).status).toBe(404);
  });

  it("lets a prize descent into the pot with a found weapon only when its player holds that item", async () => {
    const post = await start();
    const axe: Item = { kind: 1, rarity: 2, seed: 99n };
    const weapon = { id: 7, kind: 1, rarity: 2, seed: "99" };
    // The start the server gave for this seed and this weapon (server/attest.ts, /api/start).
    const carrying = prizeSetup(16, weapon, await signStart(signer, PLAYER, 16, weapon.id, Number(EVM_NOW)));
    const claim = { ...ask(carrying), target: "pot" };
    expect((await post(claim)).status).toBe(422); // not minted
    held.set(7, { owner: OTHER, item: axe });
    expect((await post(claim)).status).toBe(422); // someone else's
    held.set(7, { owner: PLAYER, item: { ...axe, rarity: 3 } });
    expect((await post(claim)).status).toBe(422); // not that item
    held.set(7, { owner: PLAYER, item: axe });
    expect((await post(claim)).status).toBe(200);
  });

  it("still opens the chest of a claimed descent after its weapon was sold", async () => {
    const post = await start();
    const carrying = prizeSetup(18, { id: 9, kind: 3, rarity: 1, seed: "5" });
    // Never in the pot: no chest, whoever holds the weapon.
    held.set(9, { owner: PLAYER, item: { kind: 3, rarity: 1, seed: 5n } });
    expect((await post(ask(carrying))).status).toBe(409);
    // Claimed while the player held it, then sold: the pot's record is what the chest answers to.
    const runId = claimed(carrying);
    held.set(9, { owner: OTHER, item: { kind: 3, rarity: 1, seed: 5n } });
    const res = await post(ask(carrying));
    expect(res.status).toBe(200);
    expect((await res.json() as DropAttestation).drop).toMatchObject({ player: PLAYER, runId });
    // The buyer cannot open it: under their address the same moves are another record, which the pot does not hold.
    expect((await post(ask(carrying, OTHER))).status).toBe(409);
  });

  it("tells Mezo not answering apart from a weapon the player does not hold", async () => {
    const post = await start({
      items: { address: items.address as Address, chainId: EVM_CHAIN_ID, secret: SECRET, readItem: async () => { throw new Error("fetch failed"); } },
    });
    const carrying = prizeSetup(17, { id: 8, kind: 1, rarity: 2, seed: "99" });
    expect((await post({ ...ask(carrying), target: "pot" })).status).toBe(503);
  });
});
