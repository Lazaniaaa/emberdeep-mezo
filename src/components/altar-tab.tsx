import { useState } from "react";
import { Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { playSfx } from "@/audio/sfx";
import { ACTIVE_SHARE, DRAW_MINTS, HOLD_FACTOR, LOCK_MAX, LOCK_SHARE, RARITY_SUPPLY, REVENUE_SHARE, SIGIL_DROP_CHANCE, SIGIL_RARITY_WEIGHTS } from "@/game/config";
import { mintsLeft } from "@/game/economy";
import { CLASSES, CLASS_IDS, RARITIES, RARITY_INFO, classPerkText, type HeroNft, type Rarity } from "@/game/catalog";
import { heroLockKey, strength } from "@/game/locks";
import { usd } from "@/lib/format";
import { campMode, crystalsFor } from "@/lib/camp-mode";
import { Price } from "./camp-ui";
import { InsufficientFunds, SoldOut, useGame } from "@/state/store";
import { nftVisual } from "./hero-info";
import { HeroAvatar } from "./art";
import { ExpeditionPanel } from "./expedition-panel";
import { LockPanel } from "./lock-panel";

export function AltarTab() {
  const game = useGame();
  const [revealed, setRevealed] = useState<HeroNft | null>(null);

  const mint = (rarity: Rarity) => {
    try {
      const hero = game.mint(rarity);
      playSfx("mint", game.muted);
      setRevealed(hero);
    } catch (e) {
      toast.error(e instanceof InsufficientFunds ? `Not enough ${campMode.crystals ? "crystals" : "USDC"} to mint ${RARITY_INFO[rarity].label}.` : e instanceof SoldOut ? e.message : "Mint failed.");
    }
  };

  return (
    <Tabs defaultValue="mint">
      <TabsList>
        <TabsTrigger value="mint">Mint</TabsTrigger>
        {!campMode.crystals && <TabsTrigger value="lock">Lock</TabsTrigger>}
        <TabsTrigger value="expedition">Expedition</TabsTrigger>
      </TabsList>
      <TabsContent value="mint" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-pixel">The Ember Altar</CardTitle>
            <CardDescription>
              {campMode.crystals ? (
                <>Mint a Delver with crystals: a character with a class perk for practice descents. Higher rarity, stronger perk. Delvers also come free: from a Soul Sigil in a Sealed Vault, or {DRAW_MINTS} a week from the ticket draw. You own <span className="text-crystal">{game.crystals} crystals</span>.</>
              ) : (
                <>Mint a Delver: a character with a class perk. Higher rarity, stronger perk. Of every mint, {Math.round(ACTIVE_SHARE * 100)}% refills the reward pool, {Math.round(LOCK_SHARE * 100)}% feeds the lock pool and {Math.round(REVENUE_SHARE * 100)}% is the studio's revenue. Delvers also come free: from a Soul Sigil in a Sealed Vault, or {DRAW_MINTS} a week from the ticket draw.
              Perks are shown at the {Math.round(HOLD_FACTOR * 100)}% strength of a Delver you only hold. Lock it on the Lock tab and it grows up to {Math.round(LOCK_MAX * 100)}%.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {RARITIES.map(r => {
                const info = RARITY_INFO[r];
                const left = mintsLeft(r, game.minted[r]);
                const affordable = (campMode.crystals ? game.crystals >= crystalsFor(info.price) : game.balance >= info.price) && left > 0;
                return (
                  <div key={r} className="flex flex-col gap-3 rounded-xl border bg-black/40 p-4" style={{ borderColor: `${info.color}55` }}>
                    <div className="flex items-center justify-between">
                      <span className="font-pixel" style={{ color: info.color }}>{info.label}</span>
                      <HeroAvatar portrait={{ kind: CLASS_IDS[info.tier + 1], rarity: r }} px={3} />
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: info.color }}>
                        {left > 0 ? `${left} of ${RARITY_SUPPLY[r]} left` : `Sold out · all ${RARITY_SUPPLY[r]} minted`}
                      </div>
                      <div className="font-pixel text-xl"><Price cents={info.price} /></div>
                      {!campMode.crystals && <div className="text-xs text-muted-foreground">simulated USDC · {usd(info.price * (1 - REVENUE_SHARE))} back to players</div>}
                    </div>
                    <ul className="space-y-0.5 text-xs text-foreground/80">
                      {CLASS_IDS.slice(0, 3).map(c => <li key={c}>{CLASSES[c].name}: {classPerkText(c, info.tier)}</li>)}
                      <li className="text-muted-foreground">…and 3 more classes</li>
                      {r === "legendary" && !campMode.crystals && <li style={{ color: info.color }}>Bonus: +1 light radius once its lock reaches full strength</li>}
                    </ul>
                    <Button className="mt-auto" onClick={() => mint(r)} disabled={!affordable} style={affordable ? { background: info.color, color: "#000" } : undefined}>
                      <Flame data-icon="inline-start" /> {left > 0 ? "Mint" : "Sold out"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Supply is fixed forever: {RARITIES.map(r => `${RARITY_SUPPLY[r]} ${RARITY_INFO[r].label}`).join(", ")}. Part of it was already minted by other delvers. A Soul Sigil never mints a sold-out rarity. Class is random within the tier you pick. Sealed Vaults (depth 3+) hold a Soul Sigil {Math.round(SIGIL_DROP_CHANCE * 100)}% of the time: a free mint rolled at {Object.entries(SIGIL_RARITY_WEIGHTS).map(([k, v]) => `${v / 100}% ${k}`).join(", ")}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-pixel">Your Delvers ({game.heroes.length})</CardTitle>
            <CardDescription>{campMode.crystals ? "Saved in this browser for now. On-chain Delvers with a MUSD marketplace on Mezo come in the next wave." : "Simulated NFTs saved in this browser. In production these would be ERC-721s minted on Arc."}</CardDescription>
          </CardHeader>
          <CardContent>
            {game.heroes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Delvers yet. Mint one above, or bring a Soul Sigil home from the deep.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {game.heroes.map(h => {
                  const lock = game.locks.find(l => l.key === heroLockKey(h.id));
                  const v = nftVisual(h, strength(lock, game.round));
                  return (
                    <div key={h.id} className="flex flex-col items-center gap-1 rounded-lg border bg-black/40 p-2 text-center" style={{ borderColor: `${v.color}44` }}>
                      {v.portrait ? <HeroAvatar portrait={v.portrait} px={4} /> : null}
                      <span className="font-pixel text-[10px]" style={{ color: v.color }}>{v.name}</span>
                      {lock && <span className="text-[10px] text-lime">Locked</span>}
                      <span className="text-[10px] text-muted-foreground">{v.perk}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <MintReveal hero={revealed} onClose={() => setRevealed(null)} />
      </TabsContent>
      {!campMode.crystals && (
        <TabsContent value="lock">
          <LockPanel />
        </TabsContent>
      )}
      <TabsContent value="expedition">
        <ExpeditionPanel />
      </TabsContent>
    </Tabs>
  );
}

export function MintReveal({ hero, onClose }: { hero: HeroNft | null; onClose: () => void }) {
  const v = hero ? nftVisual(hero) : null;
  return (
    <Dialog open={!!hero} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {v && hero && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-pixel" style={{ color: v.color }}>
                <Sparkles className="size-4" /> {RARITY_INFO[hero.rarity].label} Delver minted
              </DialogTitle>
              <DialogDescription>{CLASSES[hero.classId].blurb}</DialogDescription>
            </DialogHeader>
            <div className="relative grid place-items-center overflow-hidden rounded-xl bg-black py-8" style={{ boxShadow: `inset 0 0 60px ${v.color}33` }}>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className="ember" style={{ left: `${8 + i * 9}%`, animationDelay: `${(i * 0.37) % 3}s`, background: v.color, boxShadow: `0 0 6px ${v.color}` }} />
              ))}
              {v.portrait && <HeroAvatar portrait={v.portrait} px={9} />}
            </div>
            <div className="text-center">
              <div className="font-pixel">{v.name}</div>
              <div className="text-sm" style={{ color: v.color }}>{v.perk}</div>
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="w-full">Equip and return to camp</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
