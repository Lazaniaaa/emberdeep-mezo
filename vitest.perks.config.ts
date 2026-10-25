import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['scripts/perks-fixture.ts'],testTimeout:120000}});
