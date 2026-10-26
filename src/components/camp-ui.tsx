// The one look every camp window shares: a header with an icon tile, sections as quiet cards, number tiles, and a
// price that reads as crystals in the Mezo release or as simulated dollars elsewhere. Each window has its own accent
// colour; the frame, spacing and type are the same everywhere.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Gem } from "lucide-react";
import { campMode, crystalsFor } from "@/lib/camp-mode";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function WindowHead({ icon: Icon, title, subtitle, accent, badge }: { icon: LucideIcon; title: string; subtitle?: ReactNode; accent: string; badge?: ReactNode }) {
  return (
    <header className="flex items-start gap-3 border-b border-white/10 pb-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}1c`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}50` }}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-pixel text-lg leading-tight" style={{ color: accent }}>{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </header>
  );
}

/** A section inside a window: a quiet card with a small uppercase title. */
export function Section({ title, icon: Icon, action, children, className, tone }: {
  title?: ReactNode; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; tone?: string;
}) {
  return (
    <section className={cn("space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4", className)}
      style={tone ? { borderColor: `${tone}45`, background: `${tone}0d` } : undefined}>
      {(title || action) && (
        <div className="flex items-center gap-2">
          {title && (
            <h3 className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] uppercase" style={{ color: tone ?? "var(--accent, #a59bb3)" }}>
              {Icon && <Icon className="size-3.5" aria-hidden />}{title}
            </h3>
          )}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A number tile: label, big value, an optional line under it. */
export function Tile({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2.5", className)}>
      <div className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 font-pixel text-base leading-tight" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** A price: crystals with the gem in the Mezo release, simulated dollars in other builds. `crystals` adds a crystal cost on top. */
export function Price({ cents, crystals = 0, className }: { cents: number; crystals?: number; className?: string }) {
  if (campMode.crystals) {
    const total = crystalsFor(cents) + crystals;
    return <span className={cn("inline-flex items-center gap-1", className)}>{total === 0 ? "Free" : <>{total}<Gem className="size-3.5 text-crystal" aria-label="crystals" /></>}</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {usd(cents)}{crystals > 0 && <> + {crystals}<Gem className="size-3.5 text-crystal" aria-label="crystals" /></>}
    </span>
  );
}
