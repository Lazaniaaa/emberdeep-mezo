import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CampScene } from "@/components/camp-scene";
import { EmberPotDialog } from "@/components/ember-pot-dialog";
import { HallDialog } from "@/components/hall-dialog";
import { ReportDialog } from "@/components/report-dialog";
import { cn } from "@/lib/utils";
import { useRun } from "@/state/run-store";
import { useGame } from "@/state/store";
import { useSoundtrack } from "@/audio/use-soundtrack";

const RunView = lazy(() => import("@/components/run-view").then(module => ({ default: module.RunView })));

export default function App() {
  const inRun = useRun(s => s.run !== null);
  const reducedMotion = useGame(s => s.reducedMotion);
  const muted = useGame(s => s.muted);
  useSoundtrack(muted);

  return (
    <TooltipProvider>
      {inRun ? (
        <div className={cn(reducedMotion && "reduced-motion")}>
          <Suspense fallback={<p className="fixed inset-0 grid place-items-center bg-black text-muted-foreground">Entering the deep…</p>}><RunView /></Suspense>
        </div>
      ) : (
        <div className={cn(reducedMotion && "reduced-motion")}><CampScene /></div>
      )}
      {!inRun && <ReportDialog />}
      <HallDialog />
      <EmberPotDialog />
      <Toaster theme="dark" position="bottom-center" />
    </TooltipProvider>
  );
}

