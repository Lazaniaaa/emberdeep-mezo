import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["scripts/mycelium-metrics.ts"], testTimeout: 600_000 } });
