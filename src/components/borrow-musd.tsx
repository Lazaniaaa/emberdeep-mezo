// "Short of MUSD? Borrow it against your BTC": shown where the game asks for MUSD the wallet does not hold. It reads
// Mezo's loan terms (its smallest loan, its fee, its own BTC price) and the player's trove, and borrows the MUSD from
// Mezo's own lending contracts in one transaction: it opens a trove with the BTC as collateral, or borrows more from the
// player's trove, at a safe loan-to-value. The trove is the player's, to repay or close in Mezo's app.
import { useEffect, useState } from "react";
import { ExternalLink, Landmark, Loader2 } from "lucide-react";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { shortfall, type TroveAction } from "@/chain/borrow";
import { MEZO_BORROW, mezoTxUrl } from "@/chain/mezo-config";
import type { BorrowStep } from "@/chain/mezo";
import { tokens } from "@/lib/format";
import { useWallet } from "@/state/wallet";

const STEP_LABEL: Record<BorrowStep, string> = {
  switching: "Switching to Mezo…",
  signing: "Confirm the loan in your wallet…",
  confirming: "Opening it on Mezo…",
};
/** BTC kept aside for the transaction's own gas. */
const GAS_MARGIN = 10n ** 13n;

/** `what` names the thing the MUSD is for ("1 key", "the cheapest weapon here"), so the card says why it is there. */
export function BorrowMusd({ need, have, btc, what, onBorrowed }: { need: bigint; have: bigint; btc: bigint; what?: string; onBorrowed?: () => void }) {
  const account = useWallet(s => s.account);
  const missing = shortfall(need, have);
  const [action, setAction] = useState<TroveAction | null>(null);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [step, setStep] = useState<BorrowStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const key = account && missing > 0n ? `${account}:${missing}` : null;

  useEffect(() => {
    if (!key || planFor === key) return;
    let active = true;
    void import("@/chain/mezo").then(m => m.planBorrow(account as Address, missing))
      .then(p => { if (active) { setAction(p.action); setPlanFor(key); } })
      .catch(() => { /* the card still links to Mezo's app */ });
    return () => { active = false; };
  }, [key, planFor, account, missing]);

  if (hash) {
    return (
      <div className="space-y-1 rounded-lg border border-lime/40 bg-lime/[0.06] p-2.5 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-lime"><Landmark className="size-3.5" aria-hidden /> Borrowed on Mezo: the MUSD is in your wallet</p>
        <p className="text-muted-foreground">Your BTC stays locked in your Mezo loan until you repay it, in Mezo's app.</p>
        <div className="flex flex-wrap gap-x-3">
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoTxUrl(hash)} target="_blank" rel="noreferrer">Loan transaction <ExternalLink className="size-3" aria-hidden /></a>
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={MEZO_BORROW.url} target="_blank" rel="noreferrer">Manage it on Mezo <ExternalLink className="size-3" aria-hidden /></a>
        </div>
      </div>
    );
  }
  if (missing === 0n) return null;

  const plan = planFor === key ? action : null;
  const ltv = Math.round(MEZO_BORROW.maxLtv * 100);
  const short = plan !== null && btc < plan.send + GAS_MARGIN;
  const borrow = async () => {
    if (!plan || !account) return;
    setError(null);
    try {
      const { injectedProvider } = await import("@/chain/wallet");
      const provider = injectedProvider();
      if (!provider) throw new Error("No browser wallet found. Install MetaMask, Rabby or another EVM wallet.");
      const mezo = await import("@/chain/mezo");
      try {
        setHash(await mezo.borrowMusd(provider, account as Address, plan, setStep));
        onBorrowed?.();
      } catch (e) {
        setError(mezo.explainMezoError(e));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground"><Landmark className="size-3.5" aria-hidden /> Short of MUSD? Borrow it against your BTC on Mezo</p>
      <p className="text-muted-foreground">
        You need {tokens(missing)} MUSD more{what ? ` for ${what}` : ""}. Paying with BTC sells it; a Mezo loan keeps it.
        {plan?.kind === "open" && <> This opens one in a single transaction: ≈{tokens(plan.send, 4)} BTC locked as collateral, {tokens(plan.borrow)} MUSD borrowed{plan.borrow > missing ? " (Mezo lends no less; what you do not spend stays in your wallet)" : ""}, a loan worth {ltv}% of the collateral.</>}
        {plan?.kind === "adjust" && <> This borrows {tokens(plan.borrow)} MUSD more on your Mezo loan{plan.send > 0n ? <>, adding ≈{tokens(plan.send, 4)} BTC to keep it at {ltv}%</> : null}.</>}
        {" "}Your BTC stays yours: repay the MUSD in Mezo's app to unlock it. Above {ltv}%, a market drop can liquidate the loan.
      </p>
      {account && plan && (
        <Button size="sm" className="w-full" onClick={() => void borrow()} disabled={!!step || short}>
          {step ? <><Loader2 className="animate-spin" data-icon="inline-start" /> {STEP_LABEL[step]}</> : <>Borrow {tokens(plan.borrow)} MUSD on Mezo</>}
        </Button>
      )}
      {error && <p className="text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {short && (
          <a className="inline-flex items-center gap-1 text-lime underline underline-offset-2" href={MEZO_BORROW.faucet} target="_blank" rel="noreferrer">
            Get testnet BTC (you hold {tokens(btc, 4)}) <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        <a className="inline-flex items-center gap-1 underline underline-offset-2" href={MEZO_BORROW.url} target="_blank" rel="noreferrer">
          Or borrow in Mezo's app <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
