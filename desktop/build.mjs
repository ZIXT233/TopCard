import { restorePiRuntime } from './pi-runtime-assets.mjs';
import { mkdtemp, cp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const staging = await mkdtemp(join(tmpdir(), 'topcard-desktop-'));
const output = process.env.TOPCARD_DESKTOP_RUNTIME_DIR ? resolve(process.env.TOPCARD_DESKTOP_RUNTIME_DIR) : join(root, 'build', 'desktop-runtime');
const run = (file, args, cwd, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { cwd, env, stdio: 'inherit', shell: false });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});
try {
  console.log(`Isolated production staging: ${staging}`);
  const excluded = new Set(['.git', '.next', '.topcard', '.card-queue', 'build', 'dist', 'node_modules', 'test-results']);
  await cp(root, staging, { recursive: true, filter: path => {
    const name = path.slice(root.length + 1).split(/[\\/]/)[0];
    return !excluded.has(name) && !name.startsWith('.env');
  } });
  // Preserve the installed native prebuilds without rebuilding the live checkout.
  await cp(join(root, 'node_modules'), join(staging, 'node_modules'), { recursive: true });
  await run(process.execPath, [join(staging, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], staging,
    { ...process.env, TOPCARD_DESKTOP_BUILD: '1', NEXT_TELEMETRY_DISABLED: '1' });
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  await cp(join(staging, '.next/standalone'), output, { recursive: true });
  await cp(join(staging, '.next/static'), join(output, '.next/static'), { recursive: true });
  await cp(join(root, 'public'), join(output, 'public'), { recursive: true });
  await cp(join(root, 'bin'), join(output, 'bin'), { recursive: true });
  await restorePiRuntime(staging, output);
  await run(process.execPath, [join(root, 'desktop/verify-pi-runtime.mjs'), output], output);
  // Next's base server trace includes its optional image optimizer even with
  // images.unoptimized=true. Desktop serves originals, so omit that native
  // dependency explicitly (route tracing excludes do not trim the base trace).
  await rm(join(output, 'node_modules/sharp'), { recursive: true, force: true });
  await rm(join(output, 'node_modules/@img'), { recursive: true, force: true });
  // node-pty chooses its native prebuild dynamically, which Next cannot trace.
  const ptyPrebuild = `${process.platform}-${process.arch}`;
  await cp(
    join(staging, 'node_modules/node-pty/prebuilds', ptyPrebuild),
    join(output, 'node_modules/node-pty/prebuilds', ptyPrebuild),
    { recursive: true },
  );
  await run(process.execPath, [join(output, 'bin/prepare-terminal.js')], output);
  console.log(`Desktop runtime ready: ${output}`);
} finally { await rm(staging, { recursive: true, force: true }); }
