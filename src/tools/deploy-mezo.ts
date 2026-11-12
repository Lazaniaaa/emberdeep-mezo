// The development-only Wave 2 deploy page (deploy-mezo.html). From the browser wallet, in order: EmberPotV3, a key
// router for it, EmberItems, EmberMarket (its fee into the new pot), and the market opened to the items. Each address is
// kept in localStorage as soon as its transaction lands, and a transaction that was sent but not yet seen to land is kept
// too, so the page always knows the next step and never sends the same one twice.
import {
  createPublicClient, createWalletClient, custom, defineChain, encodeAbiParameters, fallback, formatUnits, http, isAddress,
  type Abi, type AbiParameter, type Address, type Hex,
} from "viem";
import { MEZO_NETWORK, MEZO_POT, MEZO_TOKENS, TIGRIS } from "@/chain/mezo-config";
import { injectedProvider, type Eip1193 } from "@/chain/wallet";
import { waitForReceipt } from "@/chain/receipt";
import { MARKET_FEE_BPS, itemsArgs, marketArgs, potArgs, routerArgs } from "./mezo-deploy-args";

const MEZO = defineChain({
  id: MEZO_NETWORK.id, name: MEZO_NETWORK.name, nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [...MEZO_NETWORK.rpcs] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: MEZO_NETWORK.explorer } },
});
const reader = createPublicClient({ chain: MEZO, transport: fallback(MEZO_NETWORK.rpcs.map(url => http(url))) });

/** The game server's signing key since 2026-10-26 (its backup is in the owner's emberdeep-keys folder). */
const DEFAULT_SIGNER = "0xc0702Ec1ee458D746aE4DDEd8316c3D397001240";
const FEE_BPS = MARKET_FEE_BPS;
const TOKENS = { MUSD: MEZO_TOKENS.MUSD.address, BTC: MEZO_TOKENS.BTC.address, MEZO: MEZO_TOKENS.MEZO.address } as const;

type StepKey = "pot" | "router" | "items" | "market" | "listed";
type Saved = {
  owner?: Address; signer?: Address; baseUri?: string;
  pot?: Address; launchTime?: string; router?: Address; items?: Address; market?: Address; listed?: Hex;
  args?: Partial<Record<string, Hex>>;
  /** A step's transaction that was sent and has not been seen to land yet (the tab closed, or Mezo was slow). */
  pending?: { key: StepKey; hash: Hex } | null;
};
const STORE = "emberdeep-deploy-mezo-wave2";
const load = (): Saved => { try { return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Saved; } catch { return {}; } };
let saved = load();
const save = (patch: Partial<Saved>) => { saved = { ...saved, ...patch }; try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* kept for this tab only */ } };

type Step = { key: StepKey; title: string; run: (ctx: Ctx) => Promise<Partial<Saved>> };
type Ctx = { account: Address; provider: Eip1193; signer: Address; baseUri: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signerInput = $<HTMLInputElement>("signer");
const baseUriInput = $<HTMLInputElement>("baseuri");
const nextButton = $<HTMLButtonElement>("next");
const forgetButton = $<HTMLButtonElement>("forget");
const uriButton = $<HTMLButtonElement>("seturi");
const out = $("out");
const say = (text: string, cls = "") => { out.className = cls; out.textContent = text; };
$("fee").textContent = `${Number(FEE_BPS) / 100}%`;
signerInput.value = saved.signer ?? DEFAULT_SIGNER;
baseUriInput.value = saved.baseUri ?? "";

/** tokenURI is the base URI followed by the token id, so a base must be a web address that ends in a slash. */
const baseUriOk = (value: string) => value === "" || /^https?:\/\/[^\s/]+\/(\S*\/)?$/.test(value);

let account: Address | null = null;
let provider: Eip1193 | null = null;

const artifact = async (name: string) => await (await fetch(`/contracts/out/${name}.json`)).json() as { abi: Abi; bytecode: Hex };

/**
 * Sends a step's transaction once and waits for it. The hash is kept the moment the wallet answers, so if the tab closes
 * or Mezo is slow, the next press waits for that same transaction instead of sending (and paying for) a second one.
 */
async function landed(key: StepKey, what: string, send: () => Promise<Hex>) {
  let hash = saved.pending?.key === key ? saved.pending.hash : null;
  if (hash) {
    say(`Waiting for the ${what} sent earlier:\n${hash}`);
  } else {
    say(`Confirm the ${what} in your wallet…`);
    hash = await send();
    save({ pending: { key, hash } });
    say(`Sent ${hash}\nWaiting for Mezo…`);
  }
  // Not landed in time: the hash stays kept, and pressing the button again goes on waiting for it.
  const receipt = await waitForReceipt(reader, hash);
  save({ pending: null });
  if (receipt.status !== "success") throw new Error(`The ${what} failed (${hash}). Press the button to send it again.`);
  return { hash, receipt };
}

/** Deploys a compiled contract and answers its address, with the encoded constructor arguments for verifying it. */
async function deploy(ctx: Ctx, key: StepKey, name: string, args: readonly unknown[]): Promise<{ address: Address; args: Hex }> {
  const { abi, bytecode } = await artifact(name);
  const wallet = createWalletClient({ account: ctx.account, chain: MEZO, transport: custom(ctx.provider) });
  const { hash, receipt } = await landed(key, `${name} deployment`, () => wallet.deployContract({ abi, bytecode, args: args as never }));
  if (!receipt.contractAddress) throw new Error(`The ${name} deployment made no contract (${hash}).`);
  const ctor = abi.find(x => x.type === "constructor") as { inputs: readonly AbiParameter[] } | undefined;
  return { address: receipt.contractAddress, args: encodeAbiParameters(ctor?.inputs ?? [], args as never) };
}

const STEPS: Step[] = [
  {
    key: "pot", title: "EmberPotV3: the weekly MUSD prize pool (1 MUSD a key, the round clock starts now)",
    run: async ctx => {
      const r = await deploy(ctx, "pot", "EmberPotV3", potArgs(TOKENS, ctx.account, ctx.signer, MEZO_POT.maxGoldPerRun, MEZO_POT.roundSeconds));
      // Mezo's RPC can miss a contract for a moment after it lands. The address is what must not be lost (the next
      // press would deploy a second pot), so it is kept first; the launch time is read again later if this read fails.
      save({ pot: r.address, args: { ...saved.args, EmberPotV3: r.args } });
      await readLaunchTime();
      return {};
    },
  },
  {
    key: "router", title: "EmberKeyRouter: keys for BTC or MEZO, swapped on Tigris, for the new pot",
    run: async ctx => {
      const r = await deploy(ctx, "router", "EmberKeyRouter", routerArgs(saved.pot!, TOKENS, TIGRIS));
      return { router: r.address, args: { ...saved.args, EmberKeyRouter: r.args } };
    },
  },
  {
    key: "items", title: "EmberItems: the found weapons, minted from the server's signed chest drops",
    run: async ctx => {
      const r = await deploy(ctx, "items", "EmberItems", itemsArgs(ctx.signer, ctx.baseUri));
      return { items: r.address, args: { ...saved.args, EmberItems: r.args } };
    },
  },
  {
    key: "market", title: `EmberMarket: items for MUSD, BTC or MEZO; ${Number(FEE_BPS) / 100}% of each sale into the new pot`,
    run: async ctx => {
      const r = await deploy(ctx, "market", "EmberMarket", marketArgs(saved.pot!, TOKENS, TIGRIS));
      return { market: r.address, args: { ...saved.args, EmberMarket: r.args } };
    },
  },
  {
    key: "listed", title: "Open the market to EmberItems (setCollection)",
    run: async ctx => {
      const { abi } = await artifact("EmberMarket");
      const wallet = createWalletClient({ account: ctx.account, chain: MEZO, transport: custom(ctx.provider) });
      const call = { address: saved.market!, abi, functionName: "setCollection", args: [saved.items!, true] } as const;
      const { hash } = await landed("listed", "setCollection", async () => {
        await reader.simulateContract({ ...call, account: ctx.account });
        return wallet.writeContract(call);
      });
      return { listed: hash };
    },
  },
];

/** The new pot's round clock starts at its deployment: read once from the contract and kept. */
async function readLaunchTime() {
  if (!saved.pot || saved.launchTime) return;
  try {
    const launchTime = await reader.readContract({ address: saved.pot, abi: [{ type: "function", name: "launchTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }], functionName: "launchTime" });
    save({ launchTime: launchTime.toString() });
  } catch { /* asked again on the next step, or when the page opens */ }
}

const nextStep = () => STEPS.find(s => !saved[s.key]);

function render() {
  const next = nextStep();
  $("steps").innerHTML = "";
  for (const s of STEPS) {
    const li = document.createElement("li");
    const value = saved[s.key];
    li.className = value ? "done" : s === next ? "next" : "";
    li.textContent = value ? `${s.title}\n   ✓ ${value}` : s.title;
    li.style.whiteSpace = "pre-wrap";
    $("steps").append(li);
  }
  const ownerOk = !saved.owner || !account || saved.owner.toLowerCase() === account.toLowerCase();
  const pending = saved.pending ?? null;
  // The base URI goes into EmberItems when it is deployed; once that step is sent, the kept one is what counts.
  const uriOk = baseUriOk(baseUriInput.value.trim());
  const uriBlocks = next?.key === "items" && !pending && !uriOk;
  nextButton.disabled = !next || !account || !provider || !isAddress(signerInput.value.trim()) || !ownerOk || uriBlocks;
  nextButton.textContent = !next ? "All done" : pending ? "Keep waiting for the sent transaction" : "Run the next step";
  forgetButton.hidden = !pending;
  uriButton.hidden = !saved.items;
  uriButton.disabled = !account || !provider || !ownerOk || !uriOk || baseUriInput.value.trim() === "" || !!pending;
  $("urihint").className = uriOk ? "" : "err";
  if (!ownerOk) say(`These contracts are owned by ${saved.owner}. Connect that wallet to go on.`, "err");
  const oldPot = saved.pot && saved.pot.toLowerCase() !== MEZO_POT.address.toLowerCase()
    ? `MEZO_RETIRED_POTS   = [{ address: "${MEZO_POT.address}", launchTime: ${MEZO_POT.launchTime}, roundSeconds: ${MEZO_POT.roundSeconds} }]  // the pot this one replaces`
    : null;
  $("config").textContent = next ? "" : [
    `// src/chain/mezo-config.ts`,
    `MEZO_POT.address    = "${saved.pot}"`,
    `MEZO_POT.launchTime = ${saved.launchTime ?? "(not read yet: reload this page, or read launchTime() on the explorer)"}`,
    ...(oldPot ? [oldPot] : []),
    `KEY_ROUTER          = "${saved.router}"`,
    `ITEMS               = "${saved.items}"`,
    `MARKET              = "${saved.market}"`,
    ``,
    saved.baseUri
      ? `// Item metadata: EmberItems answers tokenURI(id) = ${saved.baseUri}<id>`
      : `// Item metadata: no base URI yet. Enter https://<your site>/api/item/ above and press "Set the base URI on EmberItems".`,
    ``,
    `// Constructor arguments, for verifying on ${MEZO_NETWORK.explorer}`,
    ...Object.entries(saved.args ?? {}).map(([name, args]) => `${name}: ${args?.slice(2)}`),
  ].join("\n");
}

$("connect").addEventListener("click", async () => {
  try {
    provider = injectedProvider();
    if (!provider) throw new Error("No browser wallet found.");
    account = (await provider.request({ method: "eth_requestAccounts" }) as string[])[0] as Address;
    const chainId = `0x${MEZO.id.toString(16)}`;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 4902 && !/unrecognized|not been added/i.test((error as Error).message ?? "")) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId, chainName: MEZO.name, nativeCurrency: MEZO.nativeCurrency, rpcUrls: MEZO.rpcUrls.default.http, blockExplorerUrls: [MEZO.blockExplorers.default.url] }],
      });
    }
    const balance = await reader.getBalance({ address: account });
    $("wallet").textContent = `${account}, ${formatUnits(balance, 18)} BTC for gas`;
    $("wallet").className = "mono ok";
  } catch (e) {
    $("wallet").textContent = e instanceof Error ? e.message.split("\n")[0] : String(e);
    $("wallet").className = "mono err";
  }
  render();
});

nextButton.addEventListener("click", async () => {
  const step = nextStep();
  if (!step || !account || !provider) return;
  const signer = signerInput.value.trim() as Address;
  nextButton.disabled = true;
  try {
    // The first step fixes who owns everything and which key signs; later steps must match it.
    if (!saved.owner) save({ owner: account, signer });
    // The base URI is fixed when the items deployment is sent, so the arguments printed for verifying match it.
    if (step.key === "items" && !saved.pending) save({ baseUri: baseUriInput.value.trim() });
    const patch = await step.run({ account, provider, signer: saved.signer ?? signer, baseUri: saved.baseUri ?? "" });
    save(patch);
    await readLaunchTime();
    say(`Done: ${step.title.split(":")[0]}.`, "ok");
  } catch (e) {
    say(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : String(e), "err");
  }
  render();
});

forgetButton.addEventListener("click", () => {
  const pending = saved.pending;
  if (!pending) return;
  if (!confirm(`Forget ${pending.hash}? Do this only if the explorer shows it was dropped: if it lands after all, the next press deploys a second copy.`)) return;
  save({ pending: null });
  say("Forgotten. The next press sends the step again.");
  render();
});

// Changing the metadata address later (a new server or domain): the owner calls setBaseURI on the deployed EmberItems.
uriButton.addEventListener("click", async () => {
  const value = baseUriInput.value.trim();
  if (!account || !provider || !saved.items || !baseUriOk(value) || value === "") return;
  uriButton.disabled = true;
  try {
    const { abi } = await artifact("EmberItems");
    const wallet = createWalletClient({ account, chain: MEZO, transport: custom(provider) });
    const call = { address: saved.items, abi, functionName: "setBaseURI", args: [value] } as const;
    await reader.simulateContract({ ...call, account });
    say("Confirm setBaseURI in your wallet…");
    const hash = await wallet.writeContract(call);
    const receipt = await waitForReceipt(reader, hash);
    if (receipt.status !== "success") throw new Error(`setBaseURI failed (${hash}).`);
    save({ baseUri: value });
    say(`Done: tokenURI(id) is now ${value}<id>`, "ok");
  } catch (e) {
    say(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : String(e), "err");
  }
  render();
});

$("reset").addEventListener("click", () => {
  if (!confirm("Forget the addresses this page has deployed? The contracts stay on chain; this page only starts again from the pot.")) return;
  saved = {};
  try { localStorage.removeItem(STORE); } catch { /* nothing kept */ }
  signerInput.value = DEFAULT_SIGNER;
  baseUriInput.value = "";
  say("");
  render();
});

signerInput.addEventListener("input", render);
baseUriInput.addEventListener("input", render);
render();
void readLaunchTime().then(render);
