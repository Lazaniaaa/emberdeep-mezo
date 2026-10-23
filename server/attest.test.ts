// The whole path: a bot plays a descent, the server replays and signs it, and the compiled Hall accepts the record.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DESCENT_TYPES, fromWire, hallDomain, type Attestation } from "@/chain/hall-typed";
import { NO_PERKS, WEAPONS } from "@/game/catalog";
import { encodeMove } from "@/game/replay";
import { emptyBag, type RunAction, type RunState } from "@/game/run";
import { simulateDiveRun, simulateFogRun } from "@/game/sim";
import { EVM_CHAIN_ID, EVM_NOW, deployHall } from "../contracts/hall-evm";
import { createAttestServer, type AttestConfig } from "./attest";

const tape = vi.hoisted(() => ({ moves: [] as RunAction[], last: null as RunState | null, on: false }));
vi.mock("@/game/run", async importOriginal => {
  const run = await importOriginal<typeof import("@/game/run")>();
  return {
    ...run,
    applyAction: (s: RunState, a: RunAction) => {
      const next = run.applyAction(s, a);
      if (tape.on && s.status === "playing") { tape.moves.push(a); tape.last = next; }
      return next;
    },
  };
});

function play(bot: () => unknown) {
  tape.moves = []; tape.last = null; tape.on = true;
  try { bot(); } finally { tape.on = false; }
  return { moves: tape.moves.map(encodeMove), final: tape.last! };
}

const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OWNER = "0x00000000000000000000000000000000000000a0" as Hex;
const PLAYER = "0x00000000000000000000000000000000000000B1" as Address;
const setupFor = (seed: number, flasks: number) => ({ seed, flasks, perks: { ...NO_PERKS }, weaponDamage: WEAPONS.dagger.damage, bag: emptyBag() });

let hall: Awaited<ReturnType<typeof deployHall>>;
let base: string;
const close: (() => void)[] = [];

async function start(overrides: Partial<AttestConfig> = {}) {
  const config: AttestConfig = {
    account: signer, hall: hall.address! as Address, chainId: EVM_CHAIN_ID, ttlSeconds: 3600,
    now: () => Number(EVM_NOW) * 1000, log: () => {},
    ...overrides,
  };
  const server = createAttestServer(config);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  close.push(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const post = (url: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(`${url}/api/attest`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeAll(async () => {
  hall = await deployHall(OWNER, signer.address);
  base = await start();
}, 120_000);
afterAll(() => close.forEach(c => c()));

describe("attestation server", () => {
  it("replays a descent that came home, signs exactly its result, and the Hall accepts it", async () => {
    // Three-wide catacombs change the bot's route. Keep an extracting fixture, not an obsolete survival assumption.
    const seed = 8919;
    const { moves, final } = play(() => simulateFogRun(seed, 2));
    expect(final.status).toBe("extracted");
    expect(final.gold).toBeGreaterThan(0);
    expect(final.kills).toBeGreaterThan(0);
    const res = await post(base, { player: PLAYER, setup: setupFor(seed, 2), moves });
    expect(res.status).toBe(200);
    const { descent, signature } = await res.json() as Attestation;
    expect(descent).toMatchObject({ depth: final.deepest, gold: final.gold, kills: final.kills, home: true, deadline: String(EVM_NOW + 3600n) });

    const signed = fromWire(descent);
    const by = await recoverTypedDataAddress({ domain: hallDomain(EVM_CHAIN_ID, hall.address!), types: DESCENT_TYPES, primaryType: "Descent", message: signed, signature });
    expect(by).toBe(signer.address);

    const r = await hall.call(PLAYER, "record", [signed, signature]);
    if (!r.ok) throw new Error(r.error);
    expect(r.logs[0]?.args).toMatchObject({ depth: final.deepest, gold: final.gold, home: true });
  });

  it("signs a lost descent as lost, and the same descent always gets the same runId", async () => {
    const { moves, final } = play(() => simulateDiveRun(77, 1));
    expect(final.status).toBe("dead");
    const body = { player: PLAYER, setup: setupFor(77, 1), moves };
    const a = await (await post(base, body)).json() as Attestation;
    const b = await (await post(base, { ...body, setup: { ...body.setup, runId: "ignored", extra: true } })).json() as Attestation;
    expect(a.descent.home).toBe(false);
    expect(a.descent.runId).toBe(b.descent.runId);
    expect((await post(base, { ...body, player: OWNER })).ok).toBe(true);
    const other = await (await post(base, { ...body, player: OWNER })).json() as Attestation;
    expect(other.descent.runId).not.toBe(a.descent.runId);
  });

  it("refuses moves that do not replay, and never trusts numbers sent with them", async () => {
    const { moves } = play(() => simulateFogRun(4243, 2));
    const cut = await post(base, { player: PLAYER, setup: setupFor(4243, 2), moves: moves.slice(0, -1) });
    expect(cut.status).toBe(422);
    expect((await cut.json() as { error: string }).error).toMatch(/not ended/);
    const extra = await post(base, { player: PLAYER, setup: setupFor(4243, 2), moves: [...moves, "W"] });
    expect(extra.status).toBe(422);
    const boosted = await post(base, { player: PLAYER, setup: { ...setupFor(4243, 2), perks: { ...NO_PERKS, damage: 999 } }, moves });
    expect(boosted.status).toBe(422);
    const claimed = await (await post(base, { player: PLAYER, setup: setupFor(4243, 2), moves, depth: 7, gold: 1e9 })).json() as Attestation;
    expect(claimed.descent.depth).toBeLessThan(7);
  });

  it("refuses bad requests plainly", async () => {
    expect((await post(base, { player: "nope", setup: setupFor(1, 1), moves: ["X"] })).status).toBe(400);
    expect((await post(base, "{not json")).status).toBe(400);
    expect((await post(base, {}, { "content-type": "text/plain" })).status).toBe(415);
    expect((await fetch(`${base}/api/attest`)).status).toBe(405);
    expect((await fetch(`${base}/api/elsewhere`)).status).toBe(404);
    const huge = await post(base, { player: PLAYER, setup: setupFor(1, 1), moves: new Array(300_000).fill("W") });
    expect(huge.status).toBe(413);
  });

  it("reports what it signs for", async () => {
    const health = await (await fetch(`${base}/api/health`)).json() as Record<string, unknown>;
    expect(health).toEqual({ ok: true, signer: signer.address, hall: hall.address, chainId: EVM_CHAIN_ID });
  });

  it("limits how often one address can ask", async () => {
    const limited = await start({ rateLimit: { max: 2, windowMs: 60_000 } });
    const body = { player: PLAYER, setup: setupFor(1, 1), moves: ["X"] };
    expect((await post(limited, body)).status).toBe(200);
    expect((await post(limited, body)).status).toBe(200);
    expect((await post(limited, body)).status).toBe(429);
  });
});
