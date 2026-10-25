// The Emberdeep attestation server. It replays a finished descent from its setup and moves, and only then signs it
// for the Hall of Descents on Arc (contracts/EmberdeepHall.sol). It never holds funds and never sends a transaction:
// the player submits the signed record from their own wallet.
//
//   node attest.mjs keygen [keyfile]   create the signing key (once) and print its address
//   node attest.mjs address [keyfile]  print the address of an existing key
//   node attest.mjs                    serve (configured by the environment, see CONFIG below)
//
// Built into one file by `npm run server:build` (server-dist/attest.mjs).
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import { encodeAbiParameters, getAddress, isAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { BOSS_DEPTH } from "@/game/config";
import { ReplayError, replayRun } from "@/game/replay";
import { DESCENT_TYPES, hallDomain, toWire, type Attestation, type SignedDescent } from "@/chain/hall-typed";

export type AttestConfig = {
  account: PrivateKeyAccount;
  hall: Address;
  chainId: number;
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

export async function attest(config: AttestConfig, body: unknown): Promise<Attestation> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.player !== "string" || !isAddress(b.player)) throw new HttpError(400, "player must be an address");
  const player = getAddress(b.player);

  let result;
  try {
    // Includes deterministic level-perk offers/ranks/slot limits; illegal K<id> choices become HTTP 422.
    result = replayRun(b.setup, b.moves);
  } catch (e) {
    if (e instanceof ReplayError) throw new HttpError(422, `The descent does not replay: ${e.message}`);
    throw e;
  }

  const now = Math.floor((config.now ?? Date.now)() / 1000);
  const descent: SignedDescent = {
    player,
    runId: runIdOf(player, result.setup, b.moves as string[]),
    depth: Math.min(BOSS_DEPTH, result.depth),
    gold: Math.min(0xffff_ffff, result.gold),
    kills: Math.min(0xffff, result.kills),
    home: result.home,
    bossSlain: result.bossSlain,
    deadline: BigInt(now + config.ttlSeconds),
  };
  const signature = await config.account.signTypedData({
    domain: hallDomain(config.chainId, config.hall), types: DESCENT_TYPES, primaryType: "Descent", message: descent,
  });
  return { descent: toWire(descent), signature };
}

export function createAttestServer(config: AttestConfig): Server {
  const limit = config.rateLimit ?? { max: 20, windowMs: 10 * 60_000 };
  const hits = new Map<string, { count: number; reset: number }>();
  const log = config.log ?? (line => console.log(line));

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        send(res, 200, { ok: true, signer: config.account.address, hall: config.hall, chainId: config.chainId });
        return;
      }
      if (url.pathname !== "/api/attest") throw new HttpError(404, "Not found");
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
      const attestation = await attest(config, body);
      const d = attestation.descent;
      log(`signed ${d.player} depth ${d.depth} gold ${d.gold} ${d.home ? "home" : "lost"} run ${d.runId.slice(0, 10)}`);
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

  const hall = process.env.HALL_ADDRESS ?? "";
  if (!isAddress(hall)) throw new Error("Set HALL_ADDRESS to the deployed Hall's address");
  const config: AttestConfig = {
    account: loadKey(file),
    hall: getAddress(hall),
    chainId: Number(process.env.HALL_CHAIN_ID ?? 5042),
    ttlSeconds: Number(process.env.SIGN_TTL_SECONDS ?? 3600),
  };
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  createAttestServer(config).listen(port, host, () => {
    console.log(`Emberdeep attestation on http://${host}:${port}, signer ${config.account.address}, Hall ${config.hall} on chain ${config.chainId}`);
  });
}

// Runs only as the built server, never when the tests import this file.
if (process.argv[1]?.endsWith("attest.mjs")) main(process.argv.slice(2));
