// After a prize descent that slew Cerberus and came home: once its gold is claimed into the Ember Pot, open its chest.
// The game's server replays the descent, checks the pot holds it, rolls what is inside and mints it to the player's
// wallet on Mezo, paying the gas. An unopened chest is kept, and the Armory lists it until it is opened.
import { Check, ExternalLink, Gift, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mezoItemUrl, mezoTxUrl } from "@/chain/mezo-config";
import { RARITY_INFO } from "@/game/catalog";
import { CHEST_CHANCE, MAINNET_CHEST_CHANCE, itemName, rarityOf, type OwnedItem } from "@/game/items";
import { chestsOf, useItems, type ChestStatus, type PendingChest } from "@/state/items";
import { useRun } from "@/state/run-store";
import { useWallet } from "@/state/wallet";
import { FoundWeaponRow, ItemIcon } from "./found-weapon";

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
        <p className="text-sm text-muted-foreground">Claim the gold above first. Then the chest opens: it holds a weapon, minted to your wallet as an NFT on Mezo, to carry into your next descent or sell at the Market.</p>
      ) : (
        <Button className="w-full" variant="outline" onClick={() => void wallet.connect()}><Wallet data-icon="inline-start" /> Connect a wallet to claim and open it</Button>
      )}
    </div>
  );
}

/** Cerberus's hoard chest in the loot sheet (public/props/loot.png): six cells of 112 x 96, the hoard the last. */
const HOARD_CELL = 5, CELL_W = 112, CELL_H = 96, CELLS = 6, SHOW = 2;

/**
 * The chest itself: still until it is opened, rattling while the server opens it, then a burst in the rarity's colour
 * and the weapon rising out of it. With reduced motion every step shows at once, in its final state.
 */
function ChestStage({ phase, item }: { phase: "closed" | "opening" | "open" | "empty"; item: OwnedItem | null }) {
  const color = item ? RARITY_INFO[rarityOf(item)].color : "#ffb547";
  const open = phase === "open" || phase === "empty";
  return (
    <div className="relative grid h-52 place-items-center overflow-hidden" aria-hidden>
      {open && item && (
        <>
          <div className="absolute size-44 rounded-full opacity-40"
            style={{ background: `repeating-conic-gradient(${color}55 0deg 12deg, transparent 12deg 30deg)`, animation: "chest-rays 9s linear infinite", maskImage: "radial-gradient(circle, black 30%, transparent 70%)" }} />
          <div className="absolute size-32 rounded-full" style={{ background: `radial-gradient(circle, ${color} 0%, ${color}66 35%, transparent 70%)`, animation: "chest-burst 0.9s ease-out forwards" }} />
        </>
      )}
      <div className="pixelated relative mt-6" style={{
        width: CELL_W * SHOW, height: CELL_H * SHOW,
        backgroundImage: `url(${import.meta.env.BASE_URL}props/loot.png)`, backgroundSize: `${CELL_W * CELLS * SHOW}px ${CELL_H * SHOW}px`,
        backgroundPosition: `${-HOARD_CELL * CELL_W * SHOW}px 0`, imageRendering: "pixelated", transformOrigin: "50% 90%",
        animation: phase === "opening" ? "chest-rattle 0.35s ease-in-out infinite" : open ? "chest-open 0.6s ease-out forwards" : undefined,
      }} />
      {open && item && (
        <div className="absolute top-2 flex flex-col items-center gap-1" style={{ animation: "item-rise 0.9s cubic-bezier(.2,.9,.3,1.2) 0.25s both" }}>
          <ItemIcon item={item} scale={2} />
          <span className="font-pixel text-xs" style={{ color, textShadow: `0 0 8px ${color}` }}>{itemName(item)}</span>
        </div>
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
        <ChestStage phase="open" item={item} />
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
          {item && mezoItemUrl(item.id) && <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoItemUrl(item.id)!} target="_blank" rel="noreferrer">The NFT on Mezo <ExternalLink className="size-3" aria-hidden /></a>}
          <button type="button" className="underline underline-offset-2" onClick={() => setMarketOpen(true)}>Sell it at the Market</button>
        </div>
      </div>
    );
  }
  if (job.status === "empty") return <><ChestStage phase="empty" item={null} /><p className="text-sm text-muted-foreground">The chest was empty this time.</p></>;
  if (!pending) return null;
  return (
    <>
      <ChestStage phase={busy ? "opening" : "closed"} item={null} />
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
