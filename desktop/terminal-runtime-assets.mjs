import { cp, access } from 'node:fs/promises';
import { join } from 'node:path';

export async function restoreTerminalRuntime(source, target, platform = process.platform, arch = process.arch) {
  const relative = 'node_modules/node-pty';
  // Worker entry points are loaded by filename and are invisible to Next tracing.
  // Copy the complete JS runtime, not just the platform native binary.
  await cp(join(source, relative, 'lib'), join(target, relative, 'lib'), { recursive: true });
  await cp(join(source, relative, 'prebuilds', `${platform}-${arch}`), join(target, relative, 'prebuilds', `${platform}-${arch}`), { recursive: true });
  if (platform === 'win32') {
    await access(join(target, relative, 'lib/worker/conoutSocketWorker.js'));
    await access(join(target, relative, 'lib/shared/conout.js'));
  }
}
