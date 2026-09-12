import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { THEME_INIT_SCRIPT, THEME_OPTIONS, isDarkTheme, isThemePreference } from "./theme.ts";

const hookSource = await readFile(new URL("../hooks/useTheme.ts", import.meta.url), "utf8");

test("exposes only light, dark, and system themes", () => {
  assert.deepEqual(THEME_OPTIONS.map(({ id }) => id), ["light", "dark", "auto"]);
});

test("first paint restores the three supported choices and falls back to the system for retired, invalid, or blocked storage", () => {
  for (const systemDark of [false, true]) {
    for (const stored of [...THEME_OPTIONS.map(({ id }) => id), "mist", "rose", "pine", null, "", "unknown", new Error("Blocked")]) {
      const root = { dataset: {}, classList: { toggle: (name, value) => { root[name] = value; } } };
      runInNewContext(THEME_INIT_SCRIPT, {
        localStorage: { getItem: () => { if (stored instanceof Error) throw stored; return stored; } },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: { documentElement: root },
      });
      const expected = isThemePreference(stored) && stored !== "auto" ? stored : systemDark ? "dark" : "light";
      assert.equal(root.dataset.theme, expected);
      assert.equal(root.dark, isDarkTheme(expected));
    }
  }
});

test("synchronizes theme changes between the queue and detached tabs", () => {
  assert.match(hookSource, /window\.addEventListener\("storage", syncThemeFromStorage\)/);
  assert.match(hookSource, /event\.key !== null && event\.key !== STORAGE_KEY/);
  assert.match(hookSource, /setThemeState\(preference, theme, false\)/);
});
