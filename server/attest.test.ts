// The whole path: a bot plays a descent, the server replays and signs it, and the compiled Hall accepts the record.
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { recoverMessageAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DESCENT_TYPES, fromWire, hallDomain, type Attestation } from "@/chain/hall-typed";
import { RUN_RECORD_TYPES, potDomain, runFromWire, type PotAttestation } from "@/chain/pot-typed";
import { relayMessage } from "@/chain/relay-auth";
import { NO_PERKS, WEAPONS } from "@/game/catalog";
import { encodeMove,decodeMove } from "@/game/replay";
import { applyAction,startRun,emptyBag, type RunAction, type RunState } from "@/game/run";
import {PERK_IDS} from '@/game/level-perks';
import { simulateDiveRun, simulateFogRun } from "@/game/sim";
import { EVM_CHAIN_ID, EVM_NOW, deployHall } from "../contracts/hall-evm";
import { createAttestServer, signStart, type AttestConfig, type RelayCall } from "./attest";
import { START_TTL_SECONDS, startMessage } from "@/game/prize";

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
/** A prize descent with a start signed by the server's key, as /api/start would give it. */
const prizeFor = async (player: Address, seed: number, flasks = 3, issued = Number(EVM_NOW)) =>
  ({ ...setupFor(seed, flasks), start: await signStart(signer, player, seed, null, issued) });

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
  it('attests a replay with four perk slots and rank III, rejects a forged offer and fifth perk',async()=>{
    const setup=setupFor(77,5),{moves,final}=play(()=>simulateDiveRun(77,5));
    expect(final.levelPerks).toHaveLength(4);expect(final.levelPerks!.some(p=>p.rank===3)).toBe(true);
    expect((await post(base,{player:PLAYER,setup,moves})).status).toBe(200);
    let s=startRun(setup),checkedOffer=false,checkedFifth=false;
    for(let i=0;i<moves.length;i++){
      if(moves[i].startsWith('K')){
        if(!checkedOffer){const invalid=PERK_IDS.find(id=>!s.perkChoice!.options.includes(id))!,bad=[...moves];bad[i]=`K${invalid}`;expect((await post(base,{player:PLAYER,setup,moves:bad})).status).toBe(422);checkedOffer=true;}
        if(!checkedFifth&&s.levelPerks?.length===4){const invalid=PERK_IDS.find(id=>!s.levelPerks!.some(p=>p.id===id))!,bad=[...moves];bad[i]=`K${invalid}`;expect((await post(base,{player:PLAYER,setup,moves:bad})).status).toBe(422);checkedFifth=true;}
      }
      s=applyAction(s,decodeMove(moves[i]));
    }
    expect(checkedOffer&&checkedFifth).toBe(true);
  },60000);
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
    expect(health).toEqual({ ok: true, signer: signer.address, hall: hall.address, chainId: EVM_CHAIN_ID, mezoHall: null, pot: null, items: null });
  });

  it("signs for the Hall on Mezo with its own domain, and only when it is set up", async () => {
    expect((await post(base, { player: PLAYER, setup: setupFor(1, 1), moves: ["X"], target: "mezo" })).status).toBe(404);
    expect((await post(base, { player: PLAYER, setup: setupFor(1, 1), moves: ["X"], target: "moon" })).status).toBe(400);
    const mezo = await start({ hall: OWNER as Address, mezoHall: { address: hall.address! as Address, chainId: EVM_CHAIN_ID } });
    const { moves } = play(() => simulateFogRun(8919, 2));
    const { descent, signature } = await (await post(mezo, { player: OWNER, setup: setupFor(8919, 2), moves, target: "mezo" })).json() as Attestation;
    const r = await hall.call(PLAYER, "record", [fromWire(descent), signature]);
    expect(r.ok).toBe(true);
  });

  it("signs the Ember Pot only for a prize descent that came home, inside the current round", async () => {
    const POT = "0x00000000000000000000000000000000000000e7" as Address;
    const launch = Number(EVM_NOW) - 3 * 604_800 - 1000; // round 3, ends in 604,800 - 1,000 seconds
    const potUrl = await start({ pot: { address: POT, chainId: 31611, launchTime: launch, roundSeconds: 604_800, maxGold: 5000 } });
    let found: { seed: number; moves: string[]; gold: number } | null = null;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const { moves, final } = play(() => simulateFogRun(seed, 3));
      if (final.status === "extracted" && final.gold > 0) found = { seed, moves, gold: final.gold };
    }
    expect(found).not.toBeNull();
    const { seed, moves, gold } = found!;

    const res = await post(potUrl, { player: PLAYER, setup: await prizeFor(PLAYER, seed), moves, target: "pot" });
    expect(res.status).toBe(200);
    const { run, signature } = await res.json() as PotAttestation;
    expect(run).toMatchObject({ player: PLAYER, gold: String(gold), roundId: "3", deadline: String(EVM_NOW + 3600n) });
    const by = await recoverTypedDataAddress({ domain: potDomain(31611, POT), types: RUN_RECORD_TYPES, primaryType: "RunRecord", message: runFromWire(run), signature });
    expect(by).toBe(signer.address);

    // Any other loadout is refused: the pot pays real MUSD, and the simulated loadout cannot be proven.
    const richer = await post(potUrl, { player: PLAYER, setup: await prizeFor(PLAYER, seed, 4), moves, target: "pot" });
    expect(richer.status).toBe(422);
    const lost = play(() => simulateDiveRun(77, 3));
    expect(lost.final.status).toBe("dead");
    expect((await post(potUrl, { player: PLAYER, setup: await prizeFor(PLAYER, 77), moves: lost.moves, target: "pot" })).status).toBe(422);

    // Near the end of a round the signature would land in the next one, so it is refused.
    const closing = await start({ pot: { address: POT, chainId: 31611, launchTime: Number(EVM_NOW) - 604_800 + 60, roundSeconds: 604_800, maxGold: 5000 } });
    expect((await post(closing, { player: PLAYER, setup: await prizeFor(PLAYER, seed), moves, target: "pot" })).status).toBe(409);
    // A deadline never passes the round's end.
    const late = await start({ pot: { address: POT, chainId: 31611, launchTime: Number(EVM_NOW) - 604_800 + 1000, roundSeconds: 604_800, maxGold: 5000 } });
    const capped = await (await post(late, { player: PLAYER, setup: await prizeFor(PLAYER, seed), moves, target: "pot" })).json() as PotAttestation;
    expect(Number(capped.run.deadline)).toBe(Number(EVM_NOW) + 1000 - 120);
  }, 120_000);

  it("starts prize descents itself: one seed a player, signed, claimed once", async () => {
    // A map the bot brings home, played two ways (the second waits once first), for the one-claim rule below.
    let found: { seed: number; moves: string[]; other: string[] } | null = null;
    for (let seed = 1; seed < 80 && !found; seed++) {
      const { moves, final } = play(() => simulateFogRun(seed, 3));
      if (final.status !== "extracted" || final.gold <= 0) continue;
      const other = ["W", ...moves];
      let s = startRun(setupFor(seed, 3));
      for (const m of other) s = applyAction(s, decodeMove(m));
      if (s.status === "extracted" && s.gold > 0) found = { seed, moves, other };
    }
    expect(found).not.toBeNull();
    const { seed, moves, other } = found!;

    // The server hands out that map first, then another.
    const seeds = [seed, seed + 1000];
    const POT = "0x00000000000000000000000000000000000000e7" as Address;
    const url = await start({
      pot: { address: POT, chainId: 31611, launchTime: Number(EVM_NOW) - 1000, roundSeconds: 604_800, maxGold: 5000 },
      pickSeed: () => seeds.shift()!,
    });
    const ask = async (body: unknown) => (await fetch(`${url}/api/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    type Started = { seed: number; start: { issued: number; signature: Hex } };

    // The server picks the seed and signs it with the weapon; asking again gives the same seed, whatever the weapon.
    const first = await (await ask({ player: PLAYER })).json() as Started;
    expect(first.seed).toBe(seed);
    expect(first.start.issued).toBe(Number(EVM_NOW));
    expect(await recoverMessageAddress({ message: startMessage(PLAYER, seed, null, first.start.issued), signature: first.start.signature as Hex })).toBe(signer.address);
    const withAxe = await (await ask({ player: PLAYER, item: 7 })).json() as Started;
    expect(withAxe.seed).toBe(seed);
    expect(await recoverMessageAddress({ message: startMessage(PLAYER, seed, 7, first.start.issued), signature: withAxe.start.signature as Hex })).toBe(signer.address);
    expect((await ask({ player: "nope" })).status).toBe(400);
    expect((await fetch(`${base}/api/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player: PLAYER }) })).status).toBe(404);

    const claim = (setup: unknown, m = moves) => post(url, { player: PLAYER, setup, moves: m, target: "pot" });
    // No start, a start someone else signed, one for another weapon or another seed, or one too old: refused.
    expect((await claim(setupFor(seed, 3))).status).toBe(422);
    const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
    expect((await claim({ ...setupFor(seed, 3), start: await signStart(stranger, PLAYER, seed, null, Number(EVM_NOW)) })).status).toBe(422);
    expect((await claim({ ...setupFor(seed, 3), start: withAxe.start })).status).toBe(422);
    expect((await claim({ ...setupFor(seed, 3), start: await signStart(signer, PLAYER, seed + 1, null, Number(EVM_NOW)) })).status).toBe(422);
    expect((await claim(await prizeFor(PLAYER, seed, 3, Number(EVM_NOW) - START_TTL_SECONDS - 1))).status).toBe(409);

    // Claimed once: the same descent again is fine (a retried claim), another way of playing that map is not, and
    // the next start is a new seed.
    const setup = { ...setupFor(seed, 3), start: first.start };
    expect((await claim(setup)).status).toBe(200);
    expect((await claim(setup)).status).toBe(200);
    expect((await claim(setup, other)).status).toBe(409);
    expect((await (await ask({ player: PLAYER })).json() as Started).seed).toBe(seed + 1000);
  }, 120_000);

  it("relays Mezo records for a player who signed in, and for nobody else", async () => {
    const player = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
    const POT = "0x00000000000000000000000000000000000000e7" as Address;
    const sent: RelayCall[] = [];
    let fail: string | null = null;
    const relay = { address: OWNER as Address, send: async (call: RelayCall) => { if (fail) throw new Error(fail); sent.push(call); return "0xabc" as Hex; } };
    const launch = Number(EVM_NOW) - 1000;
    const url = await start({ relay, mezoHall: { address: hall.address! as Address, chainId: 31611 }, pot: { address: POT, chainId: 31611, launchTime: launch, roundSeconds: 604_800, maxGold: 5000 } });
    const until = Number(EVM_NOW) + 3600;
    const login = await player.signMessage({ message: relayMessage(player.address, until) });
    let found: { seed: number; moves: string[] } | null = null;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const { moves, final } = play(() => simulateFogRun(seed, 3));
      if (final.status === "extracted" && final.gold > 0) found = { seed, moves };
    }
    const body = { player: player.address, setup: await prizeFor(player.address, found!.seed), moves: found!.moves, target: "pot", until, login };
    const relayPost = (b: unknown) => fetch(`${url}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

    expect((await relayPost({ ...body, login: undefined })).status).toBe(401);
    const stranger = await privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a").signMessage({ message: relayMessage(player.address, until) });
    expect((await relayPost({ ...body, login: stranger })).status).toBe(401);
    expect((await relayPost({ ...body, until: Number(EVM_NOW) - 1 })).status).toBe(401);
    expect((await relayPost({ ...body, target: "arc" })).status).toBe(400);
    expect(sent).toHaveLength(0);

    const ok = await relayPost(body);
    expect(ok.status).toBe(200);
    expect((await ok.json() as { hash: string }).hash).toBe("0xabc");
    expect(sent[0]).toMatchObject({ address: POT, functionName: "recordRun" });
    expect((sent[0].args[0] as string).toLowerCase()).toBe(player.address.toLowerCase());

    expect((await relayPost({ ...body, target: "mezo" })).status).toBe(200);
    expect(sent[1]).toMatchObject({ address: hall.address, functionName: "record" });

    fail = "execution reverted: No key";
    const refused = await relayPost(body);
    expect(refused.status).toBe(409);
    expect((await refused.json() as { error: string }).error).toMatch(/no Ember Pot key/);
    expect((await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status).toBe(404);
  }, 120_000);

  it("limits how often one address can ask", async () => {
    const limited = await start({ rateLimit: { max: 2, windowMs: 60_000 } });
    const body = { player: PLAYER, setup: setupFor(1, 1), moves: ["X"] };
    expect((await post(limited, body)).status).toBe(200);
    expect((await post(limited, body)).status).toBe(200);
    expect((await post(limited, body)).status).toBe(429);
  });
});
