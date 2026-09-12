import { piPackages } from './pi-runtime-assets.mjs';
import { mkdtemp, rm, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the packaged SDK, not the development dependency tree. No prompt,
// provider request, user configuration or existing session is touched.
const runtime = resolve(process.argv[2]);
const sdkRoot = join(runtime, 'node_modules/@earendil-works/pi-coding-agent/dist');
for (const asset of ['modes/interactive/theme/dark.json', 'modes/interactive/theme/light.json', 'core/export-html/template.html', 'core/export-html/template.css']) {
  await access(join(sdkRoot, asset));
}
for (const pkg of await piPackages(runtime)) {
  if (!pkg.endsWith('/pi-ai')) continue;
  const oauth = join(runtime, pkg, 'dist/auth/oauth');
  for (const file of await readdir(oauth)) {
    if (file.endsWith('.js')) await import(pathToFileURL(join(oauth, file)).href);
  }
  const loaders = await import(pathToFileURL(join(oauth, 'load.js')).href);
  await loaders.loadOpenAICodexOAuth();
}
const temp = await mkdtemp(join(tmpdir(), 'topcard-pi-runtime-check-'));
try {
  const { createAgentSession, SessionManager, SettingsManager, DefaultResourceLoader } = await import(pathToFileURL(join(sdkRoot, 'index.js')).href);
  const settingsManager = SettingsManager.inMemory({});
  const resourceLoader = new DefaultResourceLoader({ cwd: temp, agentDir: temp, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd: temp, agentDir: temp, settingsManager, resourceLoader, sessionManager: SessionManager.inMemory(temp), tools: [] });
  session.dispose();
  console.log('Packaged Pi AgentSession creation passed');
} finally { await rm(temp, { recursive: true, force: true }); }
