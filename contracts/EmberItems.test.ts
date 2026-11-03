// Runs the compiled EmberItems in a real EVM (ethereumjs) and signs drops with viem exactly as the server does.
import { beforeAll, describe, expect, it } from "vitest";
import { hashTypedData, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DROP_TYPES, itemsDomain, type SignedDrop } from "../src/chain/items-typed";
import { EVM_CHAIN_ID, EVM_NOW, createChain, type Compiled, type Deployed } from "./evm";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";

const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const otherKey = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const PLAYER = "0x00000000000000000000000000000000000000b1" as Hex;
const RELAYER = "0x00000000000000000000000000000000000000b2" as Hex;
const STRANGER = "0x00000000000000000000000000000000000000c2" as Hex;
const MINTER = "0x00000000000000000000000000000000000000d4" as Hex;

let chain: Awaited<ReturnType<typeof createChain>>;
let items: Deployed;
let runs = 0;

const drop = (over: Partial<SignedDrop> = {}): SignedDrop => ({
  player: PLAYER, runId: keccak256(toHex(`run-${++runs}`)), kind: 2, rarity: 3, seed: 123_456_789n, deadline: EVM_NOW + 3600n, ...over,
});
const sign = (d: SignedDrop, account = signer) =>
  account.signTypedData({ domain: itemsDomain(EVM_CHAIN_ID, items.address), types: DROP_TYPES, primaryType: "Drop", message: d });
const owner = async (id: bigint) => String(await items.read("ownerOf", [id])).toLowerCase();

describe("EmberItems", () => {
  beforeAll(async () => {
    chain = await createChain();
    items = await chain.deploy(compileContract(CONTRACTS.EmberItems, "EmberItems") as Compiled,
      [{ type: "address" }, { type: "string" }], [signer.address, "https://items.example/"]);
  }, 120_000);

  it("starts empty, owned by the deployer, with the given signer", async () => {
    expect(await items.read("name")).toBe("Emberdeep Items");
    expect(await items.read("symbol")).toBe("EMBERITEM");
    expect(String(await items.read("owner")).toLowerCase()).toBe(chain.deployer);
    expect(await items.read("signer")).toBe(signer.address);
    expect(await items.read("totalMinted")).toBe(0n);
  });

  it("mints a signed drop to its player, whoever sends it, and stores what it is", async () => {
    const d = drop();
    const r = await items.send(RELAYER, "claimDrop", [d, await sign(d)]);
    if (!r.ok) throw new Error(r.error);
    expect(await owner(1n)).toBe(PLAYER);
    expect(await items.read("itemOf", [1n])).toEqual({ kind: 2, rarity: 3, seed: 123_456_789n });
    expect(await items.read("dropped", [d.runId])).toBe(true);
    expect(await items.read("tokenURI", [1n])).toBe("https://items.example/1");
    const minted = r.logs.find(l => l.eventName === "ItemMinted");
    expect(minted?.args).toMatchObject({ id: 1n, kind: 2, rarity: 3, seed: 123_456_789n, runId: d.runId });
    expect(r.gas).toBeLessThan(150_000n);
  });

  it("computes the same digest the signer signs", async () => {
    const d = drop();
    const expected = hashTypedData({ domain: itemsDomain(EVM_CHAIN_ID, items.address), types: DROP_TYPES, primaryType: "Drop", message: d });
    expect(await items.read("digest", [d])).toBe(expected);
  });

  it("mints a descent's drop only once", async () => {
    const d = drop();
    const sig = await sign(d);
    expect((await items.send(PLAYER, "claimDrop", [d, sig])).ok).toBe(true);
    expect(await items.send(PLAYER, "claimDrop", [d, sig])).toMatchObject({ ok: false, error: "AlreadyDropped" });
  });

  it("refuses another key's signature, a changed drop and a late one", async () => {
    const d = drop();
    expect(await items.send(PLAYER, "claimDrop", [d, await sign(d, otherKey)])).toMatchObject({ ok: false, error: "BadSignature" });
    const sig = await sign(d);
    expect(await items.send(PLAYER, "claimDrop", [{ ...d, rarity: 4 }, sig])).toMatchObject({ ok: false, error: "BadSignature" });
    expect(await items.send(PLAYER, "claimDrop", [{ ...d, player: STRANGER }, sig])).toMatchObject({ ok: false, error: "BadSignature" });
    expect(await items.send(PLAYER, "claimDrop", [d, "0x1234"])).toMatchObject({ ok: false, error: "BadSignature" });
    const late = drop({ deadline: EVM_NOW - 1n });
    expect(await items.send(PLAYER, "claimDrop", [late, await sign(late)])).toMatchObject({ ok: false, error: "Expired" });
  });

  it("lets only allowed minters mint directly", async () => {
    expect(await items.send(MINTER, "mint", [PLAYER, 1, 0, 7n])).toMatchObject({ ok: false, error: "NotMinter" });
    expect(await items.send(STRANGER, "setMinter", [MINTER, true])).toMatchObject({ ok: false, error: "NotOwner" });
    expect((await items.send(chain.deployer, "setMinter", [MINTER, true])).ok).toBe(true);
    const r = await items.send(MINTER, "mint", [STRANGER, 1, 0, 7n]);
    if (!r.ok) throw new Error(r.error);
    const id = await items.read("totalMinted") as bigint;
    expect(await owner(id)).toBe(STRANGER);
    expect(await items.read("itemOf", [id])).toEqual({ kind: 1, rarity: 0, seed: 7n });
    await items.send(chain.deployer, "setMinter", [MINTER, false]);
    expect(await items.send(MINTER, "mint", [PLAYER, 1, 0, 7n])).toMatchObject({ ok: false, error: "NotMinter" });
  });

  it("transfers like any ERC-721, so a marketplace can sell items", async () => {
    expect((await items.send(PLAYER, "transferFrom", [PLAYER, STRANGER, 1n])).ok).toBe(true);
    expect(await owner(1n)).toBe(STRANGER);
    expect(await items.read("supportsInterface", ["0x80ac58cd"])).toBe(true);
  });

  it("pauses new mints but not transfers, for the owner only", async () => {
    expect(await items.send(STRANGER, "setPaused", [true])).toMatchObject({ ok: false, error: "NotOwner" });
    await items.send(chain.deployer, "setPaused", [true]);
    const d = drop();
    expect(await items.send(PLAYER, "claimDrop", [d, await sign(d)])).toMatchObject({ ok: false, error: "IsPaused" });
    expect((await items.send(STRANGER, "transferFrom", [STRANGER, PLAYER, 1n])).ok).toBe(true);
    await items.send(chain.deployer, "setPaused", [false]);
    expect((await items.send(PLAYER, "claimDrop", [d, await sign(d)])).ok).toBe(true);
  });

  it("follows a rotated signer and hands over ownership in two steps", async () => {
    expect((await items.send(chain.deployer, "setSigner", [otherKey.address])).ok).toBe(true);
    const d = drop();
    expect(await items.send(PLAYER, "claimDrop", [d, await sign(d)])).toMatchObject({ ok: false, error: "BadSignature" });
    expect((await items.send(PLAYER, "claimDrop", [d, await sign(d, otherKey)])).ok).toBe(true);
    await items.send(chain.deployer, "setSigner", [signer.address]);

    await items.send(chain.deployer, "transferOwnership", [STRANGER]);
    expect(await items.send(PLAYER, "acceptOwnership")).toMatchObject({ ok: false, error: "NotPendingOwner" });
    expect((await items.send(STRANGER, "acceptOwnership")).ok).toBe(true);
    expect(String(await items.read("owner")).toLowerCase()).toBe(STRANGER);
  });

  it("answers only for minted ids", async () => {
    expect(await items.send(PLAYER, "tokenURI", [999n])).toMatchObject({ ok: false, error: "TokenDoesNotExist" });
    expect(await items.send(PLAYER, "itemOf", [999n])).toMatchObject({ ok: false, error: "TokenDoesNotExist" });
  });
});
