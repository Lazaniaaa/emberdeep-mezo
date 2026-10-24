import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["scripts/late-tiles-metrics.ts"], testTimeout: 600_000 } });
