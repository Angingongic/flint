import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Node's scripts/*.test.mjs suites run separately through test:ci.
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
