import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const chatWindow = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const settingsPanel = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const chatAppearanceHook = await readFile(new URL("../hooks/useChatAppearance.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { clampChatContentFontSize } = await jiti.import("../hooks/useChatAppearance.ts");

test("chat content follows the available card width without a separate width preference", () => {
  assert.doesNotMatch(chatWindow, /chat-content-max-width|max-w-\[820px\]|maxWidth: 820/);
  assert.doesNotMatch(chatInput, /chat-content-max-width|maxWidth: 820/);
  assert.doesNotMatch(globals, /--chat-content-max-width/);
  assert.doesNotMatch(settingsPanel, /settings-chat-content-width|chatContentWidth/);
  assert.doesNotMatch(chatAppearanceHook, /pi-chat-content-width|clampChatContentWidth|setWidth/);
});

test("General chat settings retain the font-size preference", () => {
  assert.match(chatInput, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /type="range"/);
  assert.match(settingsPanel, /min=\{CHAT_CONTENT_FONT_SIZE_MIN\}/);
  assert.match(settingsPanel, /max=\{CHAT_CONTENT_FONT_SIZE_MAX\}/);
  assert.match(chatAppearanceHook, /persistentStorage\(\)\.setItem/);
});

test("chat font size preserves the default and bounds stored or supplied values", () => {
  for (const value of [undefined, null, "invalid", Infinity, NaN]) {
    assert.equal(clampChatContentFontSize(value), 14);
  }
  assert.equal(clampChatContentFontSize(8), 12);
  assert.equal(clampChatContentFontSize("18"), 18);
  assert.equal(clampChatContentFontSize(18.7), 19);
  assert.equal(clampChatContentFontSize(30), 24);
});
