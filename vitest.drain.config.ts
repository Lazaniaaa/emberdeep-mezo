import { defineConfig } from "vitest/config";

// Optional parameter study only; never part of normal npm test or runtime rules.
export default defineConfig({ test: { include: ["scripts/drain-sweep.ts"], testTimeout: 600_000 } });
