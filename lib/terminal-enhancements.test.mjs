import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { enhancedTerminalKey: key, decodeTerminalClipboard: decode } = await jiti.import("./terminal-enhancements.ts");
const plain = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
test("enhanced keys preserve composition and distinguish Enter modifiers", () => {
  assert.equal(key({ ...plain, key: "Enter" }, true), null);
  assert.equal(key({ ...plain, key: "Enter", shiftKey: true }, true), "\x1b[13;2u");
  assert.equal(key({ ...plain, key: "Enter", ctrlKey: true }, false), "\x1b[13;5u");
  assert.equal(key({ ...plain, key: "Enter", shiftKey: true, isComposing: true }, true), null);
  assert.equal(key({ ...plain, key: "Backspace", metaKey: true }, true), "\x15");
  assert.equal(key({ ...plain, key: "ArrowLeft", altKey: true }, true), "\x1bb");
  assert.equal(key({ ...plain, key: "ArrowLeft", altKey: true }, false), null);
  assert.equal(key({ ...plain, key: "c", ctrlKey: true }, false), null);
});
test("OSC 52 decodes UTF-8 writes while ignoring reads and malformed/oversized data", () => {
  assert.equal(decode(`c;${Buffer.from("远程复制 ✓").toString("base64")}`), "远程复制 ✓");
  assert.equal(decode("c;"), "");
  for (const invalid of ["c;?", "not a target;YQ==", "c;%%%%", "c;/w==", "c;" + "a".repeat(1_400_001)]) assert.equal(decode(invalid), null);
});
