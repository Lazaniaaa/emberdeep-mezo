// After a descent that slew Cerberus and came home: open its chest. The game's server replays the descent, rolls what
// is inside and mints it to the player's wallet on Mezo, paying the gas.
import { ExternalLink, Gift, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mezoTxUrl } from "@/chain/mezo-config";
import { CHEST_CHANCE, MAINNET_CHEST_CHANCE } from "@/game/items";
import { useItems, type ChestStatus } from "@/state/items";
import type { RunReport } from "@/state/store";
import { useWallet } from "@/state/wallet";
import { FoundWeaponRow } from "./found-weapon";

const LABEL: Partial<Record<ChestStatus, string>> = {
  login: "Sign in once in your wallet…",
  opening: "Opening the chest on Mezo…",
};

export function ChestPanel({ report }: { report: RunReport }) {
  const wallet = useWallet();
  const { chestFor, chest, openChest, equip, setMarketOpen } = useItems();
  const job = chestFor === report ? chest : { status: "idle" as const, item: null, hash: null, error: null };
  const busy = job.status === "login" || job.status === "opening";

  return (
    <div className="space-y-2 rounded-lg border border-sigil/50 bg-sigil/[0.07] p-3">
      <p className="flex items-center gap-1.5 font-pixel text-sm text-sigil"><Gift className="size-4" aria-hidden /> Cerberus left a chest</p>
      {job.status === "done" ? (
        <div className="space-y-2">
          {job.item ? (
            <FoundWeaponRow item={job.item}>
              <Button size="sm" variant="secondary" onClick={() => equip(job.item)}>Carry it</Button>
            </FoundWeaponRow>
          ) : (
            <p className="text-sm">A weapon is in your wallet. See it in the Armory.</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {job.hash && <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoTxUrl(job.hash)} target="_blank" rel="noreferrer">Mint transaction <ExternalLink className="size-3" aria-hidden /></a>}
            <button type="button" className="underline underline-offset-2" onClick={() => setMarketOpen(true)}>Sell it at the Market</button>
          </div>
        </div>
      ) : job.status === "empty" ? (
        <p className="text-sm text-muted-foreground">The chest was empty this time.</p>
      ) : wallet.account ? (
        <>
          <Button className="w-full font-pixel" variant="secondary" onClick={() => void openChest(report)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Gift data-icon="inline-start" />}
            {LABEL[job.status] ?? "Open the chest"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            A pickaxe, axe, sword or spear, minted to your wallet on Mezo. The game checks every move and pays the gas.
            {CHEST_CHANCE >= 1 ? ` Always holds a weapon on testnet; ${Math.round(MAINNET_CHEST_CHANCE * 100)}% on mainnet.` : ""}
          </p>
          {job.status === "error" && job.error && <p className="text-xs text-destructive" role="alert">{job.error}</p>}
        </>
      ) : (
        <Button className="w-full" variant="outline" onClick={() => void wallet.connect()}><Wallet data-icon="inline-start" /> Connect a wallet to open it</Button>
      )}
    </div>
  );
}
