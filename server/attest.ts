// The Emberdeep attestation server. It replays a finished descent from its setup and moves, and only then signs it
// for one of three targets: the Hall of Descents on Arc (contracts/EmberdeepHall.sol), the same Hall on Mezo, or the
// Ember Pot on Mezo (a real MUSD prize pool, which takes only the equal prize loadout). It never holds funds. On Arc the
// player submits the signed record from their own wallet. On Mezo Testnet it can also relay: a separate relayer key,
// funded with a little testnet BTC, sends the record and pays the gas, for a player who signed one login message.
//
//   node attest.mjs keygen [keyfile]   create a key (once: the signing key, or the relayer key) and print its address
//   node attest.mjs address [keyfile]  print the address of an existing key
//   node attest.mjs                    serve (configured by the environment, see CONFIG below)
//
// Built into one file by `npm run server:build` (server-dist/attest.mjs).
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import {
  createPublicClient, createWalletClient, defineChain, encodeAbiParameters, getAddress, http, isAddress, keccak256, parseAbi,
  toHex, verifyMessage, type Abi, type Address, type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { BOSS_DEPTH } from "@/game/config";
import { isPrizeSetup } from "@/game/prize";
import { ReplayError, replayRun } from "@/game/replay";
import { DESCENT_TYPES, fromWire, hallDomain, toWire, type Attestation, type SignedDescent } from "@/chain/hall-typed";
import { RUN_RECORD_TYPES, potDomain, runFromWire, runToWire, type PotAttestation, type RunRecord } from "@/chain/pot-typed";
import { RELAY_LOGIN_SECONDS, relayMessage } from "@/chain/relay-auth";
import { MEZO_NETWORK, MEZO_POT, mezoHallAddress } from "@/chain/mezo-config";
import { startAutoPayout } from "./payout";
import { waitForReceipt } from "@/chain/receipt";

/** One contract call the relayer sends. */
export type RelayCall = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/**
 * The relayer: its own key (never the signing key), on Mezo Testnet. `send` simulates the call (so a refusal costs no
 * gas and is explained), sends it, waits for it and returns the hash; calls go one at a time so nonces never clash.
 */
export type Relay = { address: Address; send: (call: RelayCall) => Promise<Hex> };

const RELAY_HALL_ABI = parseAbi([
  "struct Descent { address player; bytes32 runId; uint8 depth; uint32 gold; uint16 kills; bool home; bool bossSlain; uint64 deadline; }",
  "function record(Descent d, bytes signature)",
]);
const RELAY_POT_ABI = parseAbi(["function recordRun(address player, bytes32 runId, uint256 gold, uint256 deadline, bytes signature)"]);

/** A Hall of Descents on some chain. */
export type HallTarget = { address: Address; chainId: number };

/** The Ember Pot: its round clock and gold cap are immutable on chain and repeated here. */
export type PotTarget = { address: Address; chainId: number; launchTime: number; roundSeconds: number; maxGold: number };

/** What a request asks to be signed for. Requests without a target are for the Hall on Arc, as before. */
export type TargetId = "arc" | "mezo" | "pot";

export type AttestConfig = {
  account: PrivateKeyAccount;
  /** The Hall on Arc, or null when this server signs for Mezo only. */
  hall: Address | null;
  chainId: number;
  /** The Hall on Mezo, when it is deployed. */
  mezoHall?: HallTarget;
  /** The Ember Pot on Mezo. */
  pot?: PotTarget;
  /** The relayer for Mezo Testnet. Without it /api/relay answers 404 and players send records themselves. */
  relay?: Relay;
  /** How long a signature stays valid. The player has this long to send the record. */
  ttlSeconds: number;
  now?: () => number;
  /** Requests one address may make per window. */
  rateLimit?: { max: number; windowMs: number };
  log?: (line: string) => void;
};

const MAX_BODY = 1_000_000;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Past this the connection is simply cut. Caddy also caps the body in production. */
const DRAIN_LIMIT = 16 * MAX_BODY;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Too large: keep reading so the answer can be sent, but keep none of it.
      if (size <= MAX_BODY) chunks.push(chunk);
      else if (size > DRAIN_LIMIT) req.destroy();
    });
    req.on("end", () => (size > MAX_BODY ? reject(new HttpError(413, "The request is too large")) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** The address a request came from. The server listens on localhost behind Caddy, which sets X-Forwarded-For. */
function clientAddress(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  const last = (Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)?.split(",").at(-1)?.trim();
  return last || req.socket.remoteAddress || "unknown";
}

/** A descent is identified by who played it, what it started with and every move, so the same descent signs to one runId. */
export function runIdOf(player: Address, setup: unknown, moves: readonly string[]): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
    [player, keccak256(toHex(JSON.stringify(setup))), keccak256(toHex(moves.join(",")))],
  ));
}

/** A pot signature never outlives its round: the contract checks it against the round it is sent in. */
const POT_ROUND_MARGIN = 120;

export async function attest(config: AttestConfig, body: unknown): Promise<Attestation | PotAttestation> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.player !== "string" || !isAddress(b.player)) throw new HttpError(400, "player must be an address");
  const player = getAddress(b.player);
  const target = (b.target ?? "arc") as TargetId;
  if (target !== "arc" && target !== "mezo" && target !== "pot") throw new HttpError(400, "target must be arc, mezo or pot");
  if (target === "arc" && !config.hall) throw new HttpError(404, "The Hall on Arc is not set up on this server");
  if (target === "mezo" && !config.mezoHall) throw new HttpError(404, "The Hall on Mezo is not set up on this server");
  if (target === "pot" && !config.pot) throw new HttpError(404, "The Ember Pot is not set up on this server");

  let result;
  try {
    // Includes deterministic level-perk offers/ranks/slot limits; illegal K<id> choices become HTTP 422.
    result = replayRun(b.setup, b.moves);
  } catch (e) {
    if (e instanceof ReplayError) throw new HttpError(422, `The descent does not replay: ${e.message}`);
    throw e;
  }

  const now = Math.floor((config.now ?? Date.now)() / 1000);
  const runId = runIdOf(player, result.setup, b.moves as string[]);

  if (target === "pot") {
    const pot = config.pot!;
    if (!isPrizeSetup(result.setup)) throw new HttpError(422, "Only a prize descent (the equal loadout) can enter the Ember Pot");
    if (!result.home) throw new HttpError(422, "Only a descent that came home can enter the Ember Pot");
    if (result.gold <= 0) throw new HttpError(422, "A descent with no gold adds nothing to the Ember Pot");
    const round = Math.floor((now - pot.launchTime) / pot.roundSeconds);
    if (round < 0) throw new HttpError(409, "The Ember Pot has not opened yet");
    const roundEnd = pot.launchTime + (round + 1) * pot.roundSeconds;
    const deadline = Math.min(now + config.ttlSeconds, roundEnd - POT_ROUND_MARGIN);
    if (deadline <= now) throw new HttpError(409, "This pot round is closing. Try again in a few minutes, for the next round.");
    const run: RunRecord = {
      player, runId, gold: BigInt(Math.min(pot.maxGold, result.gold)), roundId: BigInt(round), deadline: BigInt(deadline),
    };
    const signature = await config.account.signTypedData({
      domain: potDomain(pot.chainId, pot.address), types: RUN_RECORD_TYPES, primaryType: "RunRecord", message: run,
    });
    return { run: runToWire(run), signature };
  }

  const hall = target === "mezo" ? config.mezoHall! : { address: config.hall!, chainId: config.chainId };
  const descent: SignedDescent = {
    player,
    runId,
    depth: Math.min(BOSS_DEPTH, result.depth),
    gold: Math.min(0xffff_ffff, result.gold),
    kills: Math.min(0xffff, result.kills),
    home: result.home,
    bossSlain: result.bossSlain,
    deadline: BigInt(now + config.ttlSeconds),
  };
  const signature = await config.account.signTypedData({
    domain: hallDomain(hall.chainId, hall.address), types: DESCENT_TYPES, primaryType: "Descent", message: descent,
  });
  return { descent: toWire(descent), signature };
}

/** A relayer error a player can act on, from a reverted simulation; anything else stays a server error. */
function relayRefusal(e: unknown): HttpError | null {
  const text = `${(e as { shortMessage?: string })?.shortMessage ?? ""} ${(e as Error)?.message ?? ""}`;
  for (const [pattern, message] of [
    [/No key/, "You have no Ember Pot key on Mezo. Buy one, then record again."],
    [/Run already recorded|AlreadyRecorded/, "This descent is recorded already."],
    [/Expired/, "The signature ran out. Record it again."],
    [/Bad signature|BadSignature/, "The contract did not accept the server's signature. Record it again."],
    [/insufficient funds|exceeds the balance/i, "The game's relayer is out of testnet BTC for gas. Record it with your own wallet for now."],
  ] as const) if (pattern.test(text)) return new HttpError(pattern.source.startsWith("insufficient") ? 503 : 409, message);
  return null;
}

/** Checks the player's login for relaying: their own signature over the login message, still valid. */
export async function checkLogin(player: Address, b: Record<string, unknown>, nowSeconds: number) {
  const until = b.until;
  if (!Number.isSafeInteger(until) || typeof b.login !== "string" || !/^0x[0-9a-fA-F]+$/.test(b.login)) throw new HttpError(401, "Sign in to let the game record for you");
  if ((until as number) <= nowSeconds) throw new HttpError(401, "Your sign-in ran out. Sign in again");
  if ((until as number) > nowSeconds + RELAY_LOGIN_SECONDS + 300) throw new HttpError(401, "That sign-in lasts too long");
  const ok = await verifyMessage({ address: player, message: relayMessage(player, until as number), signature: b.login as Hex }).catch(() => false);
  if (!ok) throw new HttpError(401, "The sign-in signature is not from this wallet");
}

/** Replays, signs and sends a descent to the Hall on Mezo or the Ember Pot, paid by the relayer. */
export async function relay(config: AttestConfig, body: unknown): Promise<{ hash: Hex; attestation: Attestation | PotAttestation }> {
  if (!config.relay) throw new HttpError(404, "This server does not relay");
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.target !== "mezo" && b.target !== "pot") throw new HttpError(400, "Only Mezo records are relayed (target mezo or pot)");
  if (typeof b.player !== "string" || !isAddress(b.player)) throw new HttpError(400, "player must be an address");
  await checkLogin(getAddress(b.player), b, Math.floor((config.now ?? Date.now)() / 1000));
  const attestation = await attest(config, body);
  const call: RelayCall = "run" in attestation
    ? (() => {
      const r = runFromWire(attestation.run);
      return { address: config.pot!.address, abi: RELAY_POT_ABI, functionName: "recordRun", args: [r.player, r.runId, r.gold, r.deadline, attestation.signature] };
    })()
    : { address: config.mezoHall!.address, abi: RELAY_HALL_ABI, functionName: "record", args: [fromWire(attestation.descent), attestation.signature] };
  try {
    return { hash: await config.relay.send(call), attestation };
  } catch (e) {
    throw relayRefusal(e) ?? e;
  }
}

/** The relayer on Mezo Testnet, from its key file and RPC. */
export function createRelay(account: PrivateKeyAccount, chainId: number, rpc: string): Relay {
  const chain = defineChain({ id: chainId, name: "Mezo Testnet", nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const reader = createPublicClient({ chain, transport: http(rpc) });
  const writer = createWalletClient({ account, chain, transport: http(rpc) });
  let queue: Promise<unknown> = Promise.resolve();
  return {
    address: account.address,
    send: call => {
      const job = queue.then(async () => {
        const { request } = await reader.simulateContract({ ...call, account } as never);
        const hash = await writer.writeContract(request as never);
        const receipt = await waitForReceipt(reader, hash, 90_000);
        if (receipt.status !== "success") throw new Error(`The relayed transaction reverted (${hash})`);
        return hash;
      });
      queue = job.catch(() => {});
      return job;
    },
  };
}

export function createAttestServer(config: AttestConfig): Server {
  const limit = config.rateLimit ?? { max: 20, windowMs: 10 * 60_000 };
  const hits = new Map<string, { count: number; reset: number }>();
  const log = config.log ?? (line => console.log(line));

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        send(res, 200, {
          ok: true, signer: config.account.address, hall: config.hall, chainId: config.chainId,
          mezoHall: config.mezoHall?.address ?? null, pot: config.pot?.address ?? null,
          ...(config.relay ? { relayer: config.relay.address } : {}),
        });
        return;
      }
      if (url.pathname !== "/api/attest" && url.pathname !== "/api/relay") throw new HttpError(404, "Not found");
      if (req.method !== "POST") throw new HttpError(405, "Use POST");
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "Send JSON");

      const now = (config.now ?? Date.now)();
      const who = clientAddress(req);
      const hit = hits.get(who);
      if (!hit || hit.reset <= now) hits.set(who, { count: 1, reset: now + limit.windowMs });
      else if (++hit.count > limit.max) throw new HttpError(429, "Too many requests. Wait a few minutes.");
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);

      let body: unknown;
      try { body = JSON.parse(await readBody(req)); } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, "The body is not JSON"); }
      if (url.pathname === "/api/relay") {
        const { hash, attestation } = await relay(config, body);
        log(`relayed ${"run" in attestation ? `pot ${attestation.run.player} gold ${attestation.run.gold}` : `hall ${attestation.descent.player} depth ${attestation.descent.depth}`} tx ${hash}`);
        send(res, 200, { hash, ...attestation });
        return;
      }
      const attestation = await attest(config, body);
      if ("run" in attestation) {
        const r = attestation.run;
        log(`signed pot ${r.player} round ${r.roundId} gold ${r.gold} run ${r.runId.slice(0, 10)}`);
      } else {
        const d = attestation.descent;
        log(`signed ${d.player} depth ${d.depth} gold ${d.gold} ${d.home ? "home" : "lost"} run ${d.runId.slice(0, 10)}`);
      }
      send(res, 200, attestation);
    } catch (e) {
      if (e instanceof HttpError) { send(res, e.status, { error: e.message }); return; }
      log(`error ${e instanceof Error ? e.message : String(e)}`);
      send(res, 500, { error: "Something went wrong on the server" });
    }
  });
}

// ── running it ─────────────────────────────────────────────────────────────────────────────────────────

const DEFAULT_KEY_FILE = "/etc/emberdeep/signer.key";

/**
 * A fresh secp256k1 key from Node's own CSPRNG. (viem's generatePrivateKey needs the global Web Crypto object, which
 * Node 18, Ubuntu 24.04's version, does not expose by default.)
 */
function newPrivateKey(): Hex {
  for (;;) {
    const key = `0x${randomBytes(32).toString("hex")}` as Hex;
    try { privateKeyToAccount(key); return key; } catch { /* outside the curve order: astronomically rare, draw again */ }
  }
}

function loadKey(file: string): PrivateKeyAccount {
  const key = readFileSync(file, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${file} does not hold a private key`);
  return privateKeyToAccount(key as Hex);
}

function main(argv: string[]) {
  const [command, file = process.env.SIGNER_KEY_FILE ?? DEFAULT_KEY_FILE] = argv;
  if (command === "keygen") {
    if (existsSync(file)) {
      console.log(`A key already exists in ${file}. Its address: ${loadKey(file).address}`);
      return;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${newPrivateKey()}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    console.log(`New signing key written to ${file} (readable by its owner only).`);
    console.log(`Signer address (deploy the Hall with it): ${loadKey(file).address}`);
    return;
  }
  if (command === "address") {
    console.log(loadKey(file).address);
    return;
  }

  const optional = (key: string) => {
    const v = process.env[key];
    if (!v) return null;
    if (!isAddress(v)) throw new Error(`${key} is not an address`);
    return getAddress(v);
  };
  // Arc is optional: a server without HALL_ADDRESS signs for Mezo only.
  const hall = optional("HALL_ADDRESS");
  const mezoChainId = Number(process.env.MEZO_CHAIN_ID ?? MEZO_NETWORK.id);
  const relayerFile = process.env.RELAYER_KEY_FILE;
  const relayer = relayerFile && existsSync(relayerFile)
    ? createRelay(loadKey(relayerFile), mezoChainId, process.env.MEZO_RPC ?? "https://rpc.test.mezo.org")
    : null;
  // The Mezo contracts come from the same build as the site (src/chain/mezo-config.ts); the environment only overrides.
  const mezoHallEnv = optional("MEZO_HALL_ADDRESS");
  const mezoHall = mezoHallEnv ?? (mezoHallAddress() ? getAddress(mezoHallAddress()!) : null);
  const pot = optional("MEZO_POT_ADDRESS") ?? getAddress(MEZO_POT.address);
  const config: AttestConfig = {
    account: loadKey(file),
    hall,
    chainId: Number(process.env.HALL_CHAIN_ID ?? 5042),
    ...(mezoHall ? { mezoHall: { address: mezoHall, chainId: mezoChainId } } : {}),
    ...(pot ? {
      pot: {
        address: pot, chainId: mezoChainId,
        launchTime: Number(process.env.MEZO_POT_LAUNCH ?? MEZO_POT.launchTime),
        roundSeconds: Number(process.env.MEZO_POT_ROUND_SECONDS ?? MEZO_POT.roundSeconds),
        maxGold: Number(process.env.MEZO_POT_MAX_GOLD ?? MEZO_POT.maxGoldPerRun),
      },
    } : {}),
    ...(relayer ? { relay: relayer } : {}),
    ttlSeconds: Number(process.env.SIGN_TTL_SECONDS ?? 3600),
  };
  if (relayer && relayer.address === config.account.address) throw new Error("The relayer must have its own key, never the signing key");
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  createAttestServer(config).listen(port, host, () => {
    console.log(`Emberdeep attestation on http://${host}:${port}, signer ${config.account.address}`);
    if (config.hall) console.log(`  Hall on Arc ${config.hall} (chain ${config.chainId})`);
    if (config.mezoHall) console.log(`  Hall on Mezo ${config.mezoHall.address} (chain ${config.mezoHall.chainId})`);
    if (config.pot) console.log(`  Ember Pot ${config.pot.address} (chain ${config.pot.chainId})`);
    if (config.relay) console.log(`  Relayer ${config.relay.address} pays the gas on Mezo Testnet`);
  });
  // When a pot week ends, the relayer pays everyone out; anyone else could too, so this never holds the pot back.
  if (config.relay && config.pot && process.env.AUTO_PAYOUT !== "off") {
    const rpc = process.env.MEZO_RPC ?? MEZO_NETWORK.rpcs[0];
    const reader = createPublicClient({ transport: http(rpc) });
    startAutoPayout(reader, config.relay, { address: config.pot.address, launchTime: config.pot.launchTime, roundSeconds: config.pot.roundSeconds }, line => console.log(line));
    console.log("  Pays out each ended pot week automatically");
  }
}

// Runs only as the built server, never when the tests import this file.
if (process.argv[1]?.endsWith("attest.mjs")) main(process.argv.slice(2));
