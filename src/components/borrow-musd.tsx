// "Short of MUSD? Borrow it against your BTC": shown where the game asks for MUSD. It reads Mezo's loan terms (its
// smallest loan, its fee, its own BTC price) and the player's trove, lets the player choose how much to borrow, and
// borrows it from Mezo's own lending contracts in one transaction: it opens a trove with the BTC as collateral, or
// borrows more from the player's trove, at a safe loan-to-value. The trove is the player's, to repay or close in Mezo's app.
import { useEffect, useState } from "react";
import { ExternalLink, Landmark, Loader2 } from "lucide-react";
import { formatUnits, parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { shortfall, troveAction, type BorrowTerms, type Trove } from "@/chain/borrow";
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
/** What is offered on a trove the player has already, when nothing is short: more on a loan has no floor. */
const OFFER = 100n * 10n ** 18n;
const UNIT = 10n ** 18n;

/** Whole MUSD, up to two decimals, as the amount field shows it. */
const asText = (v: bigint) => {
  const cents = (v + UNIT / 100n - 1n) / (UNIT / 100n);
  return formatUnits(cents * (UNIT / 100n), 18).replace(/\.0$/, "");
};

/** `what` names the thing the MUSD is for ("1 key", "the cheapest weapon here"), so the card says why it is there. */
export function BorrowMusd({ need, have, btc, what, onBorrowed }: { need: bigint; have: bigint; btc: bigint; what?: string; onBorrowed?: () => void }) {
  const account = useWallet(s => s.account);
  // A wallet that holds enough MUSD can still choose to borrow: the card then folds into one line until opened.
  const [offered, setOffered] = useState(false);
  const short = shortfall(need, have);
  const open = short > 0n || offered;
  // Mezo's terms and the player's trove, read once for the wallet; the amount is the player's to change.
  const [loaded, setLoaded] = useState<{ account: string; terms: BorrowTerms; trove: Trove | null } | null>(null);
  // What the player typed, for the wallet it was typed for: another wallet starts from its own suggestion.
  const [typed, setTyped] = useState<{ account: string; text: string } | null>(null);
  const [step, setStep] = useState<BorrowStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !account || loaded?.account === account) return;
    let active = true;
    void import("@/chain/mezo").then(m => m.planBorrow(account as Address, UNIT))
      .then(p => { if (active) setLoaded({ account, terms: p.terms, trove: p.trove }); })
      .catch(() => { /* the card still links to Mezo's app */ });
    return () => { active = false; };
  }, [open, account, loaded]);

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
  if (!open) {
    return account ? (
      <button type="button" onClick={() => setOffered(true)}
        className="flex w-full items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-left text-xs hover:border-white/25">
        <Landmark className="size-3.5" aria-hidden /> Borrow MUSD against your BTC on Mezo <span className="text-muted-foreground">· keep the BTC</span>
      </button>
    ) : null;
  }

  const terms = loaded?.account === account ? loaded.terms : null;
  const trove = loaded?.account === account ? loaded.trove : null;
  // What the field starts at: what is missing; else 100 more on a trove, or Mezo's smallest loan for a new one.
  const suggested = short > 0n ? short : trove ? OFFER : terms?.minDebt ?? 0n;
  const text = typed && typed.account === account ? typed.text
    : terms ? asText(!trove && suggested < terms.minDebt ? terms.minDebt : suggested) : "";
  const amount = /^\d+(\.\d{1,2})?$/.test(text.trim()) ? parseUnits(text.trim(), 18) : 0n;
  // A new trove must be at least Mezo's smallest loan; more on a trove has no floor.
  const belowMin = !!terms && !trove && amount > 0n && amount < terms.minDebt;
  const plan = terms && amount > 0n && !belowMin ? troveAction(amount, terms, trove) : null;
  const ltv = Math.round(MEZO_BORROW.maxLtv * 100);
  const lowBtc = plan !== null && btc < plan.send + GAS_MARGIN;
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
      <p className="flex items-center gap-1.5 font-medium text-foreground"><Landmark className="size-3.5" aria-hidden /> {short > 0n ? "Short of MUSD? Borrow it against your BTC on Mezo" : "Borrow MUSD against your BTC on Mezo"}</p>
      <p className="text-muted-foreground">
        {short > 0n ? <>You need {tokens(short)} MUSD more{what ? ` for ${what}` : ""}. Paying with BTC sells it; a Mezo loan keeps it.</>
          : <>Spend MUSD on keys and weapons and keep your BTC.</>}
        {terms && (trove
          ? <> You have a Mezo loan: borrow any amount more on it.</>
          : <> This opens a Mezo loan; Mezo lends no less than {tokens(terms.minDebt)} MUSD, and what you do not spend stays in your wallet.</>)}
      </p>
      {account && terms && (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Borrow</span>
          <input value={text} onChange={e => setTyped({ account: account as string, text: e.target.value })} inputMode="decimal" aria-label="MUSD to borrow"
            className="h-8 w-28 rounded-md border border-white/15 bg-black/40 px-2 text-sm outline-none focus:border-white/40" disabled={!!step} />
          <span className="text-muted-foreground">MUSD</span>
        </label>
      )}
      {belowMin && <p className="text-destructive">A new Mezo loan is at least {tokens(terms!.minDebt)} MUSD.</p>}
      {plan && (
        <p className="text-muted-foreground">
          {plan.kind === "open"
            ? <>≈{tokens(plan.send, 6)} BTC locked as collateral, a loan worth {ltv}% of it.</>
            : plan.send > 0n ? <>Adds ≈{tokens(plan.send, 6)} BTC to your loan to keep it at {ltv}%.</> : <>Your loan has room for it: no BTC added.</>}
          {" "}Your BTC stays yours: repay the MUSD in Mezo's app to unlock it. Above {ltv}%, a market drop can liquidate the loan.
        </p>
      )}
      {account && plan && (
        <Button size="sm" className="w-full" onClick={() => void borrow()} disabled={!!step || lowBtc}>
          {step ? <><Loader2 className="animate-spin" data-icon="inline-start" /> {STEP_LABEL[step]}</> : <>Borrow {tokens(plan.borrow)} MUSD on Mezo</>}
        </Button>
      )}
      {error && <p className="text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {lowBtc && (
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
