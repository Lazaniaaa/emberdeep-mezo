// "Short of MUSD? Borrow it against your BTC": shown where the game asks for MUSD the wallet does not hold. It works
// out the BTC to lock at a safe loan-to-value and sends the player to Mezo's own app, where the loan is made.
import { useEffect, useState } from "react";
import { ExternalLink, Landmark } from "lucide-react";
import { collateralFor, shortfall } from "@/chain/borrow";
import { MEZO_BORROW } from "@/chain/mezo-config";
import { tokens } from "@/lib/format";

export function BorrowMusd({ need, have, btc }: { need: bigint; have: bigint; btc: bigint }) {
  const missing = shortfall(need, have);
  const [price, setPrice] = useState<bigint | null>(null);
  useEffect(() => {
    if (missing === 0n || price !== null) return;
    let active = true;
    void import("@/chain/mezo").then(m => m.btcPrice()).then(p => { if (active) setPrice(p); }).catch(() => { /* the card still links to Mezo */ });
    return () => { active = false; };
  }, [missing, price]);
  if (missing === 0n) return null;

  const lock = price ? collateralFor(missing, price) : null;
  const ltv = Math.round(MEZO_BORROW.maxLtv * 100);
  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground"><Landmark className="size-3.5" aria-hidden /> Short of MUSD? Borrow it against your BTC</p>
      <p className="text-muted-foreground">
        You need {tokens(missing)} MUSD more.
        {lock !== null && <> Borrowing it at {ltv}% loan-to-value means locking ≈{tokens(lock, 6)} BTC on Mezo; you hold {tokens(btc, 6)} BTC.</>}
        {" "}Your BTC stays yours: repay the MUSD to unlock it. Keep the loan at {ltv}% or less, or a market drop can liquidate it.
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <a className="inline-flex items-center gap-1 text-lime underline underline-offset-2" href={MEZO_BORROW.url} target="_blank" rel="noreferrer">
          Borrow MUSD on Mezo <ExternalLink className="size-3" aria-hidden />
        </a>
        {lock !== null && btc < lock && (
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={MEZO_BORROW.faucet} target="_blank" rel="noreferrer">
            Get testnet BTC <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
