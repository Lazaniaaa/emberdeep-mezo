// After a prize descent that slew Cerberus and came home: once its gold is claimed into the Ember Pot, open its chest.
// The game's server replays the descent, checks the pot holds it, rolls what is inside and mints it to the player's
// wallet on Mezo, paying the gas. An unopened chest is kept, and the Armory lists it until it is opened.
import { Check, ExternalLink, Gift, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mezoTxUrl } from "@/chain/mezo-config";
import { CHEST_CHANCE, MAINNET_CHEST_CHANCE } from "@/game/items";
import { chestsOf, useItems, type ChestStatus, type PendingChest } from "@/state/items";
import { useRun } from "@/state/run-store";
import { useWallet } from "@/state/wallet";
import { FoundWeaponRow } from "./found-weapon";

const LABEL: Partial<Record<ChestStatus, string>> = {
  login: "Sign in once in your wallet…",
  opening: "Opening the chest on Mezo…",
};

/** The chest of the descent the run report shows (the last one that ended). */
export function ChestPanel() {
  const wallet = useWallet();
  const seed = useRun(s => s.lastDescent?.setup.seed ?? null);
  const pending = useItems(s => chestsOf(s.chests, wallet.account).find(c => c.setup.seed === seed) ?? null);
  const opened = useItems(s => s.chestFor !== null && s.chestFor === seed && (s.chest.status === "done" || s.chest.status === "empty"));

  return (
    <div className="space-y-2 rounded-lg border border-sigil/50 bg-sigil/[0.07] p-3">
      <p className="flex items-center gap-1.5 font-pixel text-sm text-sigil"><Gift className="size-4" aria-hidden /> Cerberus left a chest</p>
      {pending || opened ? <ChestOpener pending={pending} seed={seed} /> : wallet.account ? (
        <p className="text-sm text-muted-foreground">Claim the gold above first: the chest opens once this descent is in the Ember Pot.</p>
      ) : (
        <Button className="w-full" variant="outline" onClick={() => void wallet.connect()}><Wallet data-icon="inline-start" /> Connect a wallet to claim and open it</Button>
      )}
    </div>
  );
}

/** Opens one kept chest, then shows what was in it. */
export function ChestOpener({ pending, seed }: { pending: PendingChest | null; seed: number | null }) {
  const { chestFor, chest, openChest, equip, setMarketOpen } = useItems();
  const carriedId = useItems(s => s.equipped?.id ?? null);
  const job = chestFor !== null && chestFor === seed ? chest : { status: "idle" as const, item: null, hash: null, error: null };
  const busy = job.status === "login" || job.status === "opening";

  if (job.status === "done") {
    const item = job.item;
    return (
      <div className="space-y-2">
        {item ? (
          <FoundWeaponRow item={item}>
            <Button size="sm" variant={carriedId === item.id ? "secondary" : "outline"} onClick={() => equip(carriedId === item.id ? null : item)}>
              {carriedId === item.id ? <><Check data-icon="inline-start" /> Carried</> : "Carry it"}
            </Button>
          </FoundWeaponRow>
        ) : (
          <p className="text-sm">A weapon is in your wallet. See it in the Armory.</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {job.hash && <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoTxUrl(job.hash)} target="_blank" rel="noreferrer">Mint transaction <ExternalLink className="size-3" aria-hidden /></a>}
          <button type="button" className="underline underline-offset-2" onClick={() => setMarketOpen(true)}>Sell it at the Market</button>
        </div>
      </div>
    );
  }
  if (job.status === "empty") return <p className="text-sm text-muted-foreground">The chest was empty this time.</p>;
  if (!pending) return null;
  return (
    <>
      <Button className="w-full font-pixel" variant="secondary" onClick={() => void openChest(pending)} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Gift data-icon="inline-start" />}
        {LABEL[job.status] ?? "Open the chest"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        A pickaxe, axe, sword or spear, minted to your wallet on Mezo. The game checks every move and pays the gas.
        {CHEST_CHANCE >= 1 ? ` Always holds a weapon on testnet; ${Math.round(MAINNET_CHEST_CHANCE * 100)}% on mainnet.` : ""}
      </p>
      {job.status === "error" && job.error && <p className="text-xs text-destructive" role="alert">{job.error}</p>}
    </>
  );
}
