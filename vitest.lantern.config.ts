import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["scripts/lantern-boss-metrics.ts"], testTimeout: 600_000 } });
