import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campbellTerminalTheme,
  harnessTerminalTheme,
  isWindowsConptyHost,
  resolveTerminalThemeProfile,
  solarizedTerminalTheme,
  terminalThemeHostFromDocument,
} from "./terminal-theme.ts";

test("keeps Solarized on POSIX hosts and Campbell on native Windows ConPTY", () => {
  assert.equal(solarizedTerminalTheme(true).background, "#002b36");
  assert.equal(solarizedTerminalTheme(false).background, "#fdf6e3");
  assert.equal(harnessTerminalTheme(true).background, "#002b36");
  assert.equal(harnessTerminalTheme(false).background, "#fdf6e3");

  const campbell = campbellTerminalTheme();
  assert.equal(campbell.background, "#0C0C0C");
  assert.equal(campbell.black, "#0C0C0C");
  assert.equal(harnessTerminalTheme(false, "campbell").background, "#0C0C0C");
  assert.equal(harnessTerminalTheme(true, "grok").background, "#131313");
});

test("Windows ConPTY detection ignores SSH and non-Windows desktops", () => {
  assert.equal(isWindowsConptyHost({ desktopPlatform: "win32" }), true);
  assert.equal(isWindowsConptyHost({ desktopPlatform: "darwin" }), false);
  assert.equal(isWindowsConptyHost({ desktopPlatform: "linux" }), false);
  assert.equal(isWindowsConptyHost({ remote: true, desktopPlatform: "win32" }), false);
  assert.equal(isWindowsConptyHost({ platform: "Win32", userAgent: "Mozilla/5.0" }), true);
  assert.equal(isWindowsConptyHost({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh)" }), false);
  assert.equal(isWindowsConptyHost({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }), true);
});

test("Grok wins over Campbell; otherwise Windows local resolves to Campbell", () => {
  assert.equal(resolveTerminalThemeProfile("grok", { desktopPlatform: "win32" }), "grok");
  assert.equal(resolveTerminalThemeProfile(undefined, { desktopPlatform: "win32" }), "campbell");
  assert.equal(resolveTerminalThemeProfile(undefined, { remote: true, desktopPlatform: "win32" }), undefined);
  assert.equal(resolveTerminalThemeProfile(undefined, { desktopPlatform: "darwin" }), undefined);
  assert.equal(resolveTerminalThemeProfile("campbell", { desktopPlatform: "darwin" }), "campbell");
});

test("document host reads the desktop platform and navigator", () => {
  assert.deepEqual(
    terminalThemeHostFromDocument(true, { dataset: { desktopPlatform: "win32" } }, { platform: "Win32", userAgent: "Windows" }),
    { remote: true, desktopPlatform: "win32", platform: "Win32", userAgent: "Windows" },
  );
});

test("the panel resolves a live profile and SSH harnesses opt out of Campbell", async () => {
  const panel = await readFile(new URL("../components/TerminalPanel.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/HarnessCard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const queue = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
  assert.match(panel, /resolveTerminalThemeProfile/);
  assert.match(panel, /remote = false/);
  assert.match(card, /remote=\{harness\.remote\}/);
  assert.match(css, /data-terminal-theme="campbell"/);
  assert.match(queue, /data-terminal-theme="campbell"/);
});
