import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const STAMP_NAME = ".build-stamp";

export const BUILD_INPUTS = [
  "app",
  "components",
  "lib",
  "hooks",
  "bin",
  "public",
  "instrumentation.ts",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "desktop/build.mjs",
  "desktop/build-cache.mjs",
  "desktop/pi-runtime-assets.mjs",
  "desktop/terminal-runtime-assets.mjs",
  "desktop/verify-pi-runtime.mjs",
];

function skipName(name) {
  return name === "node_modules" || name === ".next" || name === ".next-desktop"
    || name === "build" || name.endsWith(".test.mjs") || name.endsWith(".test.ts");
}

export async function hashDesktopBuildInputs(root) {
  const files = [];
  async function walk(abs, rel) {
    let info;
    try { info = await stat(abs); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (info.isDirectory()) {
      for (const name of (await readdir(abs)).sort()) {
        if (skipName(name)) continue;
        await walk(join(abs, name), `${rel}/${name}`);
      }
      return;
    }
    files.push(rel.replaceAll("\\", "/"));
  }
  for (const input of BUILD_INPUTS) await walk(join(root, input), input.replaceAll("\\", "/"));
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(root, file)));
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), files: files.length };
}
