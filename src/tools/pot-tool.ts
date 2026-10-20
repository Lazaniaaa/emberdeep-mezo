// Development-only test page (pot-tool.html): shows an Ember Pot's ended rounds and pays one by its formula.
import { createPublicClient, createWalletClient, custom, defineChain, fallback, formatUnits, http, parseAbi, type Address } from "viem";
import { ARC_NETWORKS } from "@/chain/arc-config";
import { injectedProvider, type Eip1193 } from "@/chain/wallet";

const n = ARC_NETWORKS.testnet;
const chain = defineChain({
  id: n.id, name: n.name, nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [...n.rpcs] } }, blockExplorers: { default: { name: "Arc Testnet Explorer", url: n.explorer } },
});
const reader = createPublicClient({ chain, transport: fallback(n.rpcs.map(u => http(u))) });
const abi = parseAbi([
  "function currentRound() view returns (uint256)", "function roundPot(uint256) view returns (uint256)",
  "function totalGold(uint256) view returns (uint256)", "function totalDistributed(uint256) view returns (uint256)",
  "function goldOf(uint256,address) view returns (uint256)", "function paid(uint256,address) view returns (bool)",
  "function distribute(uint256 roundId, address[] players)",
]);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const out = $("out"), rounds = $("rounds"), walletLine = $("wallet");
let account: Address | null = null, provider: Eip1193 | null = null;
const pot = () => $<HTMLInputElement>("pot").value.trim() as Address;
const players = () => $<HTMLTextAreaElement>("players").value.split(/\s+/).filter(Boolean) as Address[];
const usdc = (v: bigint) => formatUnits(v, 6);
const read = <T>(functionName: string, args: unknown[] = []) => reader.readContract({ address: pot(), abi, functionName: functionName as never, args: args as never }) as Promise<T>;

$("connect").addEventListener("click", async () => {
  try {
    provider = injectedProvider();
    if (!provider) throw new Error("No browser wallet found.");
    account = ((await provider.request({ method: "eth_requestAccounts" })) as string[])[0] as Address;
    const chainId = `0x${chain.id.toString(16)}`;
    try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }); }
    catch { await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [...n.rpcs], blockExplorerUrls: [n.explorer] }] }); }
    walletLine.textContent = `${account} on ${chain.name}`; walletLine.className = "mono ok";
  } catch (e) { walletLine.textContent = e instanceof Error ? e.message.split("\n")[0] : String(e); walletLine.className = "mono err"; }
});

async function load() {
  out.textContent = "Reading…"; rounds.innerHTML = "";
  const cur = await read<bigint>("currentRound");
  for (let r = 0n; r < cur; r++) {
    const [p, g, d] = await Promise.all([read<bigint>("roundPot", [r]), read<bigint>("totalGold", [r]), read<bigint>("totalDistributed", [r])]);
    if (p === 0n && g === 0n) continue;
    const lines: string[] = [];
    const unpaid: Address[] = [];
    for (const pl of players()) {
      const [gold, done] = await Promise.all([read<bigint>("goldOf", [r, pl]), read<boolean>("paid", [r, pl])]);
      if (gold === 0n) continue;
      const share = g ? (p * gold) / g : 0n;
      lines.push(`${pl}: gold ${gold}, share ${usdc(share)} USDC, ${done ? "PAID" : "unpaid"}`);
      if (!done) unpaid.push(pl);
    }
    const box = document.createElement("div");
    box.innerHTML = `<h2>Round ${r}: pot ${usdc(p)} USDC, gold ${g}, distributed ${usdc(d)} USDC</h2><pre class="mono">${lines.join("\n") || "no listed player has gold"}</pre>`;
    if (unpaid.length) {
      const b = document.createElement("button");
      b.textContent = `Distribute round ${r} (${unpaid.length} players)`;
      b.addEventListener("click", () => void distribute(r, unpaid, b));
      box.append(b);
    }
    rounds.append(box);
  }
  out.textContent = `Current round: ${cur}. Ended rounds with money are listed below.`;
}

async function distribute(r: bigint, list: Address[], b: HTMLButtonElement) {
  if (!account || !provider) { out.textContent = "Connect the wallet first."; return; }
  b.disabled = true;
  try {
    const wallet = createWalletClient({ account, chain, transport: custom(provider) });
    out.textContent = "Confirm in your wallet…";
    const hash = await wallet.writeContract({ address: pot(), abi, functionName: "distribute", args: [r, list] });
    out.textContent = `Sent ${hash}, waiting…`;
    const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 120_000 });
    await load();
    out.innerHTML = `${receipt.status === "success" ? "Paid." : "Failed."} <a href="${n.explorer}/tx/${hash}" target="_blank" style="color:#c6f15a">${hash}</a>`;
  } catch (e) { out.textContent = e instanceof Error ? e.message.split("\n")[0] : String(e); b.disabled = false; }
}

$("load").addEventListener("click", () => void load().catch(e => { out.textContent = String(e); }));
