import { restorePiRuntime } from './pi-runtime-assets.mjs';
import { restoreTerminalRuntime } from './terminal-runtime-assets.mjs';
import { hashDesktopBuildInputs, STAMP_NAME } from './build-cache.mjs';
import { mkdir, rm, cp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const distDir = '.next-desktop';
const output = process.env.TOPCARD_DESKTOP_RUNTIME_DIR ? resolve(process.env.TOPCARD_DESKTOP_RUNTIME_DIR) : join(root, 'build', 'desktop-runtime');
// Keep Next/webpack off the user %TEMP%: Windows driver leftovers there (e.g. DIFXAPI.dll)
// can make readlink throw EPERM and abort the production compile.
const buildTemp = join(root, 'build', 'desktop-tmp');
const force = process.env.TOPCARD_DESKTOP_FORCE === '1' || process.argv.includes('--force');
const DEFAULT_HEAP_MB = 16384;
const run = (file, args, cwd, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { cwd, env, stdio: 'inherit', shell: false });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});
const heapMbFromOptions = (options) => {
  const match = /\b--max-old-space-size=(\d+)\b/.exec(options ?? '');
  return match ? Number(match[1]) : 0;
};
const resolveHeapMb = (env = process.env) => {
  const fromEnv = Number(env.TOPCARD_DESKTOP_HEAP_MB);
  const requested = Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : Math.max(heapMbFromOptions(env.NODE_OPTIONS), DEFAULT_HEAP_MB);
  return requested;
};
const withHeap = (env, heapMb) => {
  const previous = (env.NODE_OPTIONS ?? '').replace(/\b--max-old-space-size=\d+\b/g, '').replace(/\s+/g, ' ').trim();
  return { ...env, NODE_OPTIONS: `${previous} --max-old-space-size=${heapMb}`.trim() };
};
const started = performance.now();
const stage = async (label, work) => {
  const begin = performance.now();
  console.log(`[desktop-build] start ${label}`);
  const result = await work();
  console.log(`[desktop-build] ${label}: ${((performance.now() - begin) / 1000).toFixed(1)}s`);
  return result;
};

// Build in the checkout with a separate Next cache so `npm run dev` keeps `.next`.
const { digest, files } = await stage('hash inputs', () => hashDesktopBuildInputs(root));
const stampPath = join(output, STAMP_NAME);
const previous = existsSync(stampPath) ? (await readFile(stampPath, 'utf8')).trim() : '';
const reusable = !force && previous === digest && existsSync(join(output, 'server.js'));
if (reusable) {
  console.log(`[desktop-build] cache hit ${digest.slice(0, 12)} (${files} files)`);
} else {
  if (force) console.log('[desktop-build] forced rebuild');
  else if (previous) console.log(`[desktop-build] cache miss ${digest.slice(0, 12)} (${files} files)`);
  else console.log(`[desktop-build] no stamp (${files} files)`);
  const heapMb = resolveHeapMb(process.env);
  console.log(`[desktop-build] next heap ${heapMb} MB (override with TOPCARD_DESKTOP_HEAP_MB or NODE_OPTIONS)`);
  await mkdir(buildTemp, { recursive: true });
  await stage('next build --webpack', () => run(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'],
    root,
    withHeap({
      ...process.env,
      TOPCARD_DESKTOP_BUILD: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      TEMP: buildTemp,
      TMP: buildTemp,
      TMPDIR: buildTemp,
    }, heapMb),
  ));
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  await stage('copy standalone/static/public/bin', async () => {
    await cp(join(root, distDir, 'standalone'), output, { recursive: true });
    await cp(join(root, distDir, 'static'), join(output, distDir, 'static'), { recursive: true });
    await cp(join(root, 'public'), join(output, 'public'), { recursive: true });
    await cp(join(root, 'bin'), join(output, 'bin'), { recursive: true });
  });
  await stage('restore Pi runtime', () => restorePiRuntime(root, output));
  await stage('verify Pi runtime', () => run(process.execPath, [join(root, 'desktop/verify-pi-runtime.mjs'), output], output));
  // Next's base server trace includes its optional image optimizer even with
  // images.unoptimized=true. Desktop serves originals, so omit that native
  // dependency explicitly (route tracing excludes do not trim the base trace).
  await rm(join(output, 'node_modules/sharp'), { recursive: true, force: true });
  await rm(join(output, 'node_modules/@img'), { recursive: true, force: true });
  await stage('restore terminal runtime', () => restoreTerminalRuntime(root, output));
  await stage('prepare-terminal', () => run(process.execPath, [join(output, 'bin/prepare-terminal.js')], output));
  await writeFile(stampPath, `${digest}\n`);
}
console.log(`Desktop runtime ready: ${output}`);
console.log(`[desktop-build] total: ${((performance.now() - started) / 1000).toFixed(1)}s`);
