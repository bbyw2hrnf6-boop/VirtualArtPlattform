import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = fileURLToPath(new URL('../artifacts/production-budget-check/', import.meta.url));

// Exercise both production-only SDK branches with a public, nonfunctional
// fixture. Keep these test bytes outside dist and the generated Functions shell.
await build({
  root,
  mode: 'production',
  define: {
    'import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY': JSON.stringify('6LbuildCheckOnly_a1B2c3D4e5F6g7H8i9J0k1L2'),
    'import.meta.env.VITE_TELEMETRY_MODE': JSON.stringify('functions'),
    'import.meta.env.VITE_TELEMETRY_ENVIRONMENT': JSON.stringify('production'),
  },
  build: { outDir },
});
execFileSync(process.execPath, [
  fileURLToPath(new URL('./check-performance-budgets.mjs', import.meta.url)), outDir,
], { cwd: root, stdio: 'inherit' });
