import { Flame, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hallConfig } from "@/chain/arc-config";
import { mezoHallAddress } from "@/chain/mezo-config";
import { campMode } from "@/lib/camp-mode";
import { ACTIVE_SHARE, FLASK_PRICE, KEY_PRICE, LOCK_MAX, LOCK_SHARE, MATURITY_ROUNDS, MAX_ROUND_RETURN, REVENUE_SHARE } from "@/game/config";
import { roundShare } from "@/game/economy";
import { percent, usd } from "@/lib/format";
import { useHall } from "@/state/hall";
import { useGame } from "@/state/store";

/** The guide for the Mezo release: no money in camp, real prizes in the Ember Pot. */
const CRYSTAL_STEPS = [
  { title: "Get in", text: "Take a free practice key at the Dungeon Gate and light the lantern. Oil is free in practice. More oil means more light, and light is how far you can see and walk." },
  { title: "Go down", text: "Every step burns light. Collect gold and crystals, fight dimlings, choose a perk at every new level, and take the stairs for richer floors. On floor 7 Cerberus guards the way." },
  { title: "Come home", text: "Walk back to the rift you arrived through to extract. If your light dies first, everything you carried is lost." },
  { title: "Win real MUSD", text: "Open the Ember Pot (the coin at the top). Buy a prize key for 1 MUSD, or with BTC or MEZO. A prize descent starts equal for everyone: bring gold home and press Claim. When the week ends, the pot is split by gold." },
  { title: "Grow your camp", text: "Crystals you bring home buy weapons, armor, potions and Delvers. Draw tickets you find go into the weekly Delver draw." },
];

const STEPS = [
  {
    title: "Get in",
    text: `Buy an entry key (${usd(KEY_PRICE)}) and lantern oil (${usd(FLASK_PRICE)} a flask) at the Dungeon Gate. More oil means more light, and light is how far you can see and how far you can walk.`,
  },
  {
    title: "Go down",
    text: "Every step burns light. Collect gold and crystals, fight dimlings with your weapon, and take the stairs for richer floors. On floor 7 Cerberus, a three-headed hound, guards the way and leaves a hoard chest when it falls.",
  },
  {
    title: "Come home",
    text: "Walk back to the rift you arrived through to extract. If your light dies first, everything you carried is lost.",
  },
  {
    title: "Share the pool",
    text: `Gold you bring home counts toward the round. When it closes, you take the same percentage of the pool as your percentage of the gold, up to ${Math.round(MAX_ROUND_RETURN * 100)}% of what you put into descents that round. ${Math.round(ACTIVE_SHARE * 100)}% of every dollar spent feeds the pool, ${Math.round(LOCK_SHARE * 100)}% the lock pool and ${Math.round(REVENUE_SHARE * 100)}% is the studio's revenue.`,
  },
  {
    title: "Lock to grow",
    text: `Perks you only hold work at reduced strength. Lock a Delver or a stake at the Ember Altar and its perk grows with every round closed, up to ${Math.round(LOCK_MAX * 100)}%. Locks also farm a share of the lock pool, paid once they mature after ${MATURITY_ROUNDS} rounds. Everything here is simulated.`,
  },
];

export function GuidePanel({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="space-y-4">
      <ol className="grid gap-3 sm:grid-cols-2">
        {(campMode.crystals ? CRYSTAL_STEPS : STEPS).map((step, i) => (
          <li key={step.title} className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-lime font-pixel text-xs text-[#150c2b]">{i + 1}</span>
              <span className="font-pixel text-sm">{step.title}</span>
            </div>
            <p className="text-sm text-foreground/80">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        {campMode.crystals
          ? "Camp progress is kept in this browser. Real money lives only in the Ember Pot on Mezo, and your claimed descents go on the Hall of Descents there."
          : "Everything economic here is simulated USDC kept in this browser. The only thing written on chain is a descent you choose to record in the Hall of Descents on Arc."}
        {" "}The other delvers you see in camp are ambience, not other players.
      </p>
      <Button className="font-pixel" onClick={onPlay}><Flame data-icon="inline-start" /> Go to the gate</Button>
    </div>
  );
}

export function HallPanel() {
  const g = useGame();
  const share = roundShare(g.roundGold, g.fieldGold);
  const all: [string, string][] = [
    ["Descents", `${g.stats.runs}`],
    ["Made it home", `${g.stats.extracts}`],
    ["Lost in the dark", `${g.stats.deaths}`],
    ["Deepest floor", g.stats.deepest ? `${g.stats.deepest}` : "-"],
    ["Bosses slain", `${g.stats.bosses}`],
    ["Best round claim", g.stats.bestPayout ? usd(g.stats.bestPayout) : "-"],
    ["Delvers minted", `${g.stats.mints}`],
    ["Expeditions completed", `${g.stats.expeditions}`],
    ["Delvers won in the draw", `${g.heroes.filter(h => h.source === "draw").length}`],
    ["Paid to the studio", usd(g.revenue)],
    ["This round", g.roundGold > 0 ? `${g.roundGold} gold · ${percent(share)} of the gold` : "no gold banked yet"],
  ];
  // The Mezo release has no simulated rounds or studio cut in camp.
  const rows = campMode.crystals ? all.filter(([label]) => !["Best round claim", "Paid to the studio", "This round"].includes(label)) : all;
  const hall = hallConfig() || mezoHallAddress();
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
            <dt className="text-xs tracking-wider text-muted-foreground uppercase">{label}</dt>
            <dd className="font-pixel text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">These numbers are saved only in this browser.{hall && ` The public leaderboard is the Hall of Descents on ${hallConfig() ? "Arc" : "Mezo"}.`}</p>
      {hall && (
        <Button variant="secondary" size="sm" onClick={() => useHall.getState().setOpen(true)}>
          <Trophy data-icon="inline-start" /> Open the Hall of Descents
        </Button>
      )}
    </div>
  );
}
