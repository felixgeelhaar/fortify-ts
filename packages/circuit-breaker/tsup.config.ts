import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: ['es2020', 'node18'],
  platform: 'neutral',
  splitting: false,
  treeshake: true,
  external: ['@fortify-ts/core'],
});
