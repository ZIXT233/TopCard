import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
const jiti = createJiti(import.meta.url);
const { validateTerminalFiles, saveTerminalFiles } = await jiti.import("./terminal-files.ts");
const { terminalImagePaste } = await jiti.import("./terminal-images.ts");
const { dropFilesError, droppedFiles } = await jiti.import("./file-drop.ts");
test("terminal file drops preserve binary data and quote names without submitting", async () => {
  const file = new File([new Uint8Array([0,255,3,4])], "中文 file $(echo bad).bin");
  assert.equal(validateTerminalFiles([file]), null);
  const paths = await saveTerminalFiles(process.cwd(), [file]);
  try {
    assert.deepEqual(await readFile(paths[0]), Buffer.from([0,255,3,4]));
    if (process.platform !== "win32") assert.equal((await stat(paths[0])).mode & 0o777, 0o600);
    const pasted = terminalImagePaste(paths, true);
    assert.ok(pasted.startsWith("\x1b[200~"));
    assert.ok(!pasted.includes("\r"));
    if (process.platform !== "win32") assert.ok(pasted.includes("'" + paths[0] + "'"));
  } finally { await rm(dirname(paths[0]), { recursive:true, force:true }); }
});
test("invalid names, control sequences, duplicate files and oversized drops are rejected", () => {
  for (const files of [[], [new File(["a"], "../oops")], [new File(["a"], "escape\x1b.png")], [new File([], "a"), new File([], "a")]]) assert.equal(typeof validateTerminalFiles(files), "string");
  assert.equal(dropFilesError([{size:26 * 1024 * 1024}]), "files.dropLimits");
  assert.throws(() => droppedFiles({items:[{webkitGetAsEntry:()=>({isDirectory:true})}],files:[]}), /files.dropDirectories/);
});
