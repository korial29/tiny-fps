import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { Sequencer } from './test/sequencer';

const root = fileURLToPath(new URL('.', import.meta.url));

const isBuildingDemo = process.env.BUILD_DEMO === 'true';
const isBuildingServer = process.env.BUILD_SERVER === 'true';
const isBuildingLocal = process.env.BUILD_LOCAL === 'true';

// Four builds share this file:
// - default: the browser client (dist/index.js)
// - BUILD_LOCAL: the same-browser host (dist/local.js). Built apart from the client so
//   neither carries the other's code in a shared chunk; both are size-gated by scripts/size.mjs
// - BUILD_SERVER: the Node WebSocket adapter and its CLI
// - BUILD_DEMO: the static demo deployed to gh-pages
const libBuild = {
  lib: {
    entry: {
      [isBuildingLocal ? 'local' : 'index']: resolve(
        root,
        isBuildingLocal ? 'src/local/index.ts' : 'src/client/index.ts',
      ),
    },
    formats: ['es' as const],
  },
  emptyOutDir: false,
  target: 'es2022',
  // Terser leaves room in the gzip budgets for both browser libraries.
  minify: 'terser' as const,
  terserOptions: { compress: { passes: 2 } },
  // Vite keeps whitespace in ES library output; ship it fully minified.
  rolldownOptions: { output: { minify: true } },
};

const serverBuild = {
  ssr: true,
  emptyOutDir: false,
  target: 'node20',
  rollupOptions: {
    input: {
      server: resolve(root, 'src/server/index.ts'),
      cli: resolve(root, 'src/server/cli.ts'),
    },
    external: ['ws', /^node:/],
    output: { format: 'es' as const, entryFileNames: '[name].js' },
  },
};

const demoBuild = {
  outDir: resolve(root, 'dist-demo'),
  emptyOutDir: true,
  target: 'es2022',
};

export default defineConfig({
  // The demo's local rooms are per build (demo/main.ts).
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  root: isBuildingDemo ? resolve(root, 'demo') : root,
  base: isBuildingDemo ? '/tiny-fps/' : undefined,
  build: isBuildingDemo ? demoBuild : isBuildingServer ? serverBuild : libBuild,
  test: {
    root,
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The moon's scenery is built whole in several tests: seconds each on a CI runner, past the default 5 s.
    // A runner's four workers share its four vCPUs: a 20 s test there took 32 s on a busy run.
    testTimeout: 60_000,
    // Shards by each file's time (test/durations.json), not by a hash of its path.
    sequence: { sequencer: Sequencer },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json'],
    },
  },
});
