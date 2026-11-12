// The development-only Wave 2 deploy page (deploy-mezo.html). From the browser wallet, in order: EmberPotV3, a key
// router for it, EmberItems, EmberMarket (its fee into the new pot), and the market opened to the items. Each address is
// kept in localStorage as soon as its transaction lands, so the page always knows the next step.
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

type Saved = {
  owner?: Address; signer?: Address;
  pot?: Address; launchTime?: string; router?: Address; items?: Address; market?: Address; listed?: Hex;
  args?: Partial<Record<string, Hex>>;
};
const STORE = "emberdeep-deploy-mezo-wave2";
const load = (): Saved => { try { return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Saved; } catch { return {}; } };
let saved = load();
const save = (patch: Partial<Saved>) => { saved = { ...saved, ...patch }; try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* kept for this tab only */ } };

type Step = { key: "pot" | "router" | "items" | "market" | "listed"; title: string; run: (ctx: Ctx) => Promise<Partial<Saved>> };
type Ctx = { account: Address; provider: Eip1193; signer: Address; baseUri: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signerInput = $<HTMLInputElement>("signer");
const baseUriInput = $<HTMLInputElement>("baseuri");
const nextButton = $<HTMLButtonElement>("next");
const out = $("out");
const say = (text: string, cls = "") => { out.className = cls; out.textContent = text; };
$("fee").textContent = `${Number(FEE_BPS) / 100}%`;
signerInput.value = saved.signer ?? DEFAULT_SIGNER;

let account: Address | null = null;
let provider: Eip1193 | null = null;

const artifact = async (name: string) => await (await fetch(`/contracts/out/${name}.json`)).json() as { abi: Abi; bytecode: Hex };

/** Deploys a compiled contract and answers its address, with the encoded constructor arguments for verifying it. */
async function deploy(ctx: Ctx, name: string, args: readonly unknown[]): Promise<{ address: Address; args: Hex }> {
  const { abi, bytecode } = await artifact(name);
  const wallet = createWalletClient({ account: ctx.account, chain: MEZO, transport: custom(ctx.provider) });
  say(`Confirm the ${name} deployment in your wallet…`);
  const hash = await wallet.deployContract({ abi, bytecode, args: args as never });
  say(`Sent ${hash}\nWaiting for Mezo…`);
  const receipt = await waitForReceipt(reader, hash);
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`The ${name} deployment failed (${hash}).`);
  const ctor = abi.find(x => x.type === "constructor") as { inputs: readonly AbiParameter[] } | undefined;
  return { address: receipt.contractAddress, args: encodeAbiParameters(ctor?.inputs ?? [], args as never) };
}

const STEPS: Step[] = [
  {
    key: "pot", title: "EmberPotV3: the weekly MUSD prize pool (1 MUSD a key, the round clock starts now)",
    run: async ctx => {
      const r = await deploy(ctx, "EmberPotV3", potArgs(TOKENS, ctx.account, ctx.signer, MEZO_POT.maxGoldPerRun, MEZO_POT.roundSeconds));
      const launchTime = await reader.readContract({ address: r.address, abi: [{ type: "function", name: "launchTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }], functionName: "launchTime" });
      return { pot: r.address, launchTime: launchTime.toString(), args: { ...saved.args, EmberPotV3: r.args } };
    },
  },
  {
    key: "router", title: "EmberKeyRouter: keys for BTC or MEZO, swapped on Tigris, for the new pot",
    run: async ctx => {
      const r = await deploy(ctx, "EmberKeyRouter", routerArgs(saved.pot!, TOKENS, TIGRIS));
      return { router: r.address, args: { ...saved.args, EmberKeyRouter: r.args } };
    },
  },
  {
    key: "items", title: "EmberItems: the found weapons, minted from the server's signed chest drops",
    run: async ctx => {
      const r = await deploy(ctx, "EmberItems", itemsArgs(ctx.signer, ctx.baseUri));
      return { items: r.address, args: { ...saved.args, EmberItems: r.args } };
    },
  },
  {
    key: "market", title: `EmberMarket: items for MUSD, BTC or MEZO; ${Number(FEE_BPS) / 100}% of each sale into the new pot`,
    run: async ctx => {
      const r = await deploy(ctx, "EmberMarket", marketArgs(saved.pot!, TOKENS, TIGRIS));
      return { market: r.address, args: { ...saved.args, EmberMarket: r.args } };
    },
  },
  {
    key: "listed", title: "Open the market to EmberItems (setCollection)",
    run: async ctx => {
      const { abi } = await artifact("EmberMarket");
      const wallet = createWalletClient({ account: ctx.account, chain: MEZO, transport: custom(ctx.provider) });
      const call = { address: saved.market!, abi, functionName: "setCollection", args: [saved.items!, true] } as const;
      await reader.simulateContract({ ...call, account: ctx.account });
      say("Confirm setCollection in your wallet…");
      const hash = await wallet.writeContract(call);
      const receipt = await waitForReceipt(reader, hash);
      if (receipt.status !== "success") throw new Error(`setCollection failed (${hash}).`);
      return { listed: hash };
    },
  },
];

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
  nextButton.disabled = !next || !account || !provider || !isAddress(signerInput.value.trim()) || !ownerOk;
  nextButton.textContent = next ? "Run the next step" : "All done";
  if (!ownerOk) say(`These contracts are owned by ${saved.owner}. Connect that wallet to go on.`, "err");
  $("config").textContent = next ? "" : [
    `// src/chain/mezo-config.ts`,
    `MEZO_POT.address    = "${saved.pot}"`,
    `MEZO_POT.launchTime = ${saved.launchTime}`,
    `KEY_ROUTER          = "${saved.router}"`,
    `ITEMS               = "${saved.items}"`,
    `MARKET              = "${saved.market}"`,
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
    const patch = await step.run({ account, provider, signer: saved.signer ?? signer, baseUri: baseUriInput.value.trim() });
    save(patch);
    say(`Done: ${step.title.split(":")[0]}.`, "ok");
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
  say("");
  render();
});

signerInput.addEventListener("input", render);
render();
