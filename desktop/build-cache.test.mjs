import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashDesktopBuildInputs } from "./build-cache.mjs";

test("desktop input hashes are stable and change when a tracked file changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "topcard-desktop-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(join(root, "app", "page.tsx"), "export default function Page(){return null}\n");
  await writeFile(join(root, "package.json"), "{\"name\":\"fixture\"}\n");
  const first = await hashDesktopBuildInputs(root);
  assert.equal((await hashDesktopBuildInputs(root)).digest, first.digest);
  assert.ok(first.files >= 2);
  await writeFile(join(root, "app", "page.tsx"), "export default function Page(){return 'x'}\n");
  const second = await hashDesktopBuildInputs(root);
  assert.notEqual(second.digest, first.digest);
});

test("desktop build reuses the checkout Next cache and skips a clean node_modules copy", async () => {
  const build = await readFile(new URL("./build.mjs", import.meta.url), "utf8");
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(config, /distDir: "\.next-desktop"/);
  assert.match(ignore, /\/\.next-desktop\//);
  assert.match(build, /cache hit/);
  assert.match(build, /hashDesktopBuildInputs/);
  assert.match(build, /\.next-desktop/);
  assert.match(build, /buildTemp/);
  assert.match(build, /TEMP: buildTemp/);
  assert.match(build, /DEFAULT_HEAP_MB = 16384/);
  assert.match(build, /--max-old-space-size=\$\{heapMb\}/);
  assert.match(build, /TOPCARD_DESKTOP_HEAP_MB/);
  assert.doesNotMatch(build, /cp\(join\(root, 'node_modules'\)/);
  assert.doesNotMatch(build, /mkdtemp/);
});
