// Shared look of the camp windows (see components/camp-ui.tsx): accent colours by window and the dialog frame.
import type { CSSProperties } from "react";

/** Accent colours by window. */
export const ACCENT = {
  gate: "#c6f15a",
  altar: "#c77dff",
  armory: "#ff9f5a",
  board: "#ff7ac0",
  vault: "#57d9c8",
  guide: "#c6f15a",
  hall: "#ffd166",
  pot: "#ffc94d",
} as const;

/** The frame class for a camp window's dialog: dark, roomy, a thin accent edge. */
export const WINDOW_CLASS = "max-h-[90dvh] overflow-y-auto border-0 bg-[#0f0b17] p-5 shadow-2xl sm:p-6";

/** Style for a dialog that carries an accent: a hairline in the accent and a soft glow. */
export const windowStyle = (accent: string): CSSProperties => ({
  boxShadow: `0 0 0 1px ${accent}40, 0 24px 80px -24px ${accent}55`,
  ["--accent" as string]: accent,
});
