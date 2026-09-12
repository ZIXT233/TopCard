import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
const jiti = createJiti(import.meta.url);
const { validateTerminalImages, saveTerminalImages, terminalImagePaste } = await jiti.import("./terminal-images.ts");
const image = { type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=" };

test("clipboard images survive local storage byte-for-byte with private permissions", async () => {
  const paths = await saveTerminalImages(process.cwd(), [image]);
  try {
    assert.deepEqual(await readFile(paths[0]), Buffer.from(image.data, "base64"));
    if (process.platform !== "win32") assert.equal((await stat(paths[0])).mode & 0o777, 0o600);
    assert.equal(terminalImagePaste(paths, true), `\x1b[200~${paths[0]} \x1b[201~`);
    assert.ok(!terminalImagePaste(paths, false).includes("\r"));
  } finally { await rm(dirname(paths[0]), { recursive: true, force: true }); }
});

test("reject empty, oversized, malformed and spoofed clipboard attachments", () => {
  assert.equal(validateTerminalImages([image]), null);
  for (const images of [undefined, [], [image, ...Array(10).fill(image)], [{ ...image, data: "???" }], [{ ...image, data: Buffer.from("#!/bin/sh\necho unsafe").toString("base64") }]]) {
    assert.equal(typeof validateTerminalImages(images), "string");
  }
});

test("SSH upload sends binary bytes to the remote machine and returns only remote paths", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const { runInNewContext } = await import("node:vm");
  const ts = await import("typescript");
  const require = createRequire(import.meta.url);
  const attachments = await jiti.import("./image-attachments.ts");
  const calls = [];
  const exports = {};
  const source = readFileSync(new URL("./terminal-images.ts", import.meta.url), "utf8");
  const output = ts.default.transpileModule(source, { compilerOptions: { module: ts.default.ModuleKind.CommonJS, target: ts.default.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(output, { exports, Buffer, process, require(id) {
    if (id === "./image-attachments") return attachments;
    if (id === "./ssh-workspace") return {
      loadSshWorkspace: async () => ({ sshHost: "fixture-host", cwd: "/remote/project" }),
      shellQuote: (s) => `'${s.replaceAll("'", `'"'"'`)}'`,
      sshExec: async (host, command, input) => {
        calls.push({ host, command, input });
        return Buffer.from(input ? "" : "/tmp/topcard-images-fixture\n");
      },
    };
    return require(id);
  } });
  const paths = await exports.saveTerminalImages("/local/metadata", [image]);
  assert.match(paths[0], /^\/tmp\/topcard-images-fixture\/[a-f0-9-]+\.png$/);
  assert.equal(calls[1].host, "fixture-host");
  assert.deepEqual(calls[1].input, Buffer.from(image.data, "base64"));
  assert.ok(calls[1].command.includes(paths[0]));
});
