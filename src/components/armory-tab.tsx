import { Check, Gem, Shield, Swords } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { playSfx } from "@/audio/sfx";
import { REVENUE_SHARE } from "@/game/config";
import {
  ARMORS, ARMOR_IDS, POTIONS, SHOP_POTION_IDS, WEAPONS, WEAPON_IDS, type ArmorId, type PotionId, type WeaponId,
} from "@/game/catalog";
import { usd } from "@/lib/format";
import { campMode, crystalsFor } from "@/lib/camp-mode";
import { Price } from "./camp-ui";

/** Whether the player can pay a cents price plus a crystal price, in the build's economy. */
const affordable = (balance: number, crystals: number, cents: number, extraCrystals: number) =>
  campMode.crystals ? crystals >= crystalsFor(cents) + extraCrystals : balance >= cents && crystals >= extraCrystals;
import { InsufficientFunds, useGame } from "@/state/store";
import { ItemArt } from "./art";

export function ArmoryTab() {
  const game = useGame();

  const buy = (label: string, act: () => void) => {
    try { act(); playSfx("buy", game.muted); toast.success(label); }
    catch (e) { toast.error(e instanceof InsufficientFunds ? e.message : "Purchase failed."); }
  };
  const buyPotion = (id: PotionId, pay: "usdc" | "crystals") => {
    try { game.buyPotion(id, pay); playSfx("buy", game.muted); }
    catch (e) { toast.error(e instanceof InsufficientFunds ? e.message : "Purchase failed."); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-pixel"><Swords className="size-4" /> Weapons</CardTitle>
            <CardDescription>Permanent. Damage decides how many swings a dimling takes, and every swing costs a step of light.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {WEAPON_IDS.map(id => {
              const w = WEAPONS[id];
              const owned = game.weapons.includes(id);
              const equipped = game.weapon === id;
              return (
                <div key={id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
                  <ItemArt id={id} px={3} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-pixel text-sm">{w.name}</span>
                      <Badge variant="outline">{w.damage} dmg</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{w.blurb}</p>
                  </div>
                  {owned ? (
                    <Button size="sm" variant={equipped ? "secondary" : "outline"} disabled={equipped} onClick={() => game.equipWeapon(id)}>
                      {equipped ? <><Check data-icon="inline-start" /> Equipped</> : "Equip"}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => buy(`${w.name} forged and equipped.`, () => game.buyWeapon(id as WeaponId))} disabled={!affordable(game.balance, game.crystals, w.price, w.crystals)}>
                      <Price cents={w.price} crystals={w.crystals} />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-pixel"><Shield className="size-4" /> Armor</CardTitle>
            <CardDescription>Permanent. Armor thins the light dimlings drink from you. It stacks with class perks up to 80%.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ARMOR_IDS.filter(id => id !== "none").map(id => {
              const a = ARMORS[id];
              const owned = game.armors.includes(id);
              const equipped = game.armor === id;
              return (
                <div key={id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
                  <ItemArt id={id as Exclude<ArmorId, "none">} px={3} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-pixel text-sm">{a.name}</span>
                      <Badge variant="outline">-{Math.round(a.drainReduce * 100)}% drain</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.blurb}</p>
                  </div>
                  {owned ? (
                    <Button size="sm" variant={equipped ? "secondary" : "outline"} onClick={() => game.equipArmor(equipped ? "none" : id)}>
                      {equipped ? <><Check data-icon="inline-start" /> Worn</> : "Wear"}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => buy(`${a.name} fitted and worn.`, () => game.buyArmor(id))} disabled={!affordable(game.balance, game.crystals, a.price, a.crystals)}>
                      <Price cents={a.price} crystals={a.crystals} />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-pixel">Potions</CardTitle>
          <CardDescription>
            Carried into every descent and only consumed when used. {campMode.crystals
              ? "Craft them with crystals you brought home."
              : `Pay in simulated USDC (${Math.round((1 - REVENUE_SHARE) * 100)}% goes back to players) or craft with crystals you brought home.`}
            {" "}You own <span className="text-crystal">{game.crystals} crystals</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {SHOP_POTION_IDS.map(id => {
            const p = POTIONS[id];
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
                <ItemArt id={id} px={3} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-sm">{p.name}</span>
                    <Badge variant="secondary">×{game.potions[id]}</Badge>
                    <kbd className="rounded border border-white/20 px-1 text-[10px] text-muted-foreground">{p.key}</kbd>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.blurb}</p>
                </div>
                <div className="flex gap-1.5">
                  {!campMode.crystals && (
                    <Button size="sm" onClick={() => buyPotion(id, "usdc")} disabled={game.balance < p.price} aria-label={`Buy ${p.name} for ${usd(p.price)}`}>
                      {usd(p.price)}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => buyPotion(id, "crystals")} disabled={game.crystals < p.crystals} aria-label={`Craft ${p.name} for ${p.crystals} crystals`}>
                    {p.crystals} <Gem className="text-crystal" />
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-sigil/40 bg-black/40 p-3">
            <ItemArt id="heal" px={3} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-sm">{POTIONS.heal.name}</span>
                <Badge variant="secondary">×{game.potions.heal}</Badge>
                <kbd className="rounded border border-white/20 px-1 text-[10px] text-muted-foreground">{POTIONS.heal.key}</kbd>
              </div>
              <p className="text-xs text-muted-foreground">{POTIONS.heal.blurb}</p>
            </div>
            <Badge variant="outline" className="text-sigil">Not for sale</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
