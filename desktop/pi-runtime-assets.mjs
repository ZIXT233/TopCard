import { readdir, access, cp } from 'node:fs/promises';
import { join } from 'node:path';

export async function piPackages(runtime, relative = 'node_modules') {
  let entries;
  try { entries = await readdir(join(runtime, relative), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const base = join(relative, entry.name);
    const packages = entry.name.startsWith('@')
      ? (await readdir(join(runtime, base), { withFileTypes: true })).filter(item => item.isDirectory()).map(item => join(base, item.name))
      : [base];
    for (const pkg of packages) {
      if (entry.name === '@earendil-works') result.push(pkg);
      result.push(...await piPackages(runtime, join(pkg, 'node_modules')));
    }
  }
  return result;
}

// Restore every traced Pi package instance, including npm's nested copies.
// Dynamic OAuth/provider imports and theme assets are invisible to Next tracing.
export async function restorePiRuntime(source, runtime) {
  for (const pkg of await piPackages(runtime)) {
    const dist = join(source, pkg, 'dist');
    try { await access(dist); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await cp(dist, join(runtime, pkg, 'dist'), { recursive: true });
  }
}
