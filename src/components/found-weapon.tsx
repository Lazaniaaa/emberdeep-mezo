// How a found weapon (an EmberItems NFT) looks everywhere it appears: its icon on a backdrop in its finish and rarity
// colours, its name, and what it does in a descent.
import { useMemo, type ReactNode } from "react";
import { RARITY_INFO } from "@/game/catalog";
import { ITEM_KIND_INFO, finishOf, itemName, itemStats, kindOf, rarityOf, type Item } from "@/game/items";
import { LEVEL_PERKS, rankLabel } from "@/game/level-perks";
import { FOUND_ART } from "@/render/item-art";
import { spriteToDataUrl } from "@/render/pixel-art";
import { cn } from "@/lib/utils";

export function ItemIcon({ item, px = 3, className }: { item: Item; px?: number; className?: string }) {
  const src = useMemo(() => spriteToDataUrl(FOUND_ART[item.kind]!, px), [item.kind, px]);
  const color = RARITY_INFO[rarityOf(item)].color;
  const tint = finishOf(item).tint;
  return (
    <div className={cn("grid shrink-0 place-items-center rounded-lg", className)}
      style={{ border: `2px solid ${color}`, background: `radial-gradient(circle at 50% 40%, ${tint}66, #120c1f 75%)`, boxShadow: rarityOf(item) === "legendary" ? `0 0 12px ${color}88` : undefined }}>
      <img src={src} alt="" aria-hidden className="pixelated block p-1" draggable={false} />
    </div>
  );
}

/** What the item adds to a descent, as short phrases. */
export function itemEffects(item: Item): string[] {
  const s = itemStats(item);
  const out = [`${s.damage} dmg`];
  if (s.perks.lightOnKill) out.push(`+${s.perks.lightOnKill} light per kill`);
  if (s.perks.goldPct) out.push(`+${s.perks.goldPct}% gold`);
  if (s.perk) out.push(`${LEVEL_PERKS[s.perk.id].name} ${rankLabel(s.perk.rank)}`);
  return out;
}

/** A row for a found weapon: icon, name, rarity, effects, and whatever action goes on the right. */
export function FoundWeaponRow({ item, children, note }: { item: Item & { id: number }; children?: ReactNode; note?: ReactNode }) {
  const rarity = RARITY_INFO[rarityOf(item)];
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
      <ItemIcon item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel text-sm">{itemName(item)}</span>
          <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase" style={{ color: rarity.color, borderColor: `${rarity.color}66` }}>{rarity.label}</span>
          <span className="text-[10px] text-muted-foreground">#{item.id}</span>
        </div>
        <p className="text-xs text-muted-foreground">{itemEffects(item).join(" · ")}</p>
        <p className="text-[11px] text-muted-foreground/70">{note ?? ITEM_KIND_INFO[kindOf(item)].blurb}</p>
      </div>
      {children}
    </div>
  );
}
