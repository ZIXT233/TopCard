import type { ITheme } from "@xterm/xterm";

// Original Solarized ANSI palette, shared by the light and dark variants.
const ansi: ITheme = {
  black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
  blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
  brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
  brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
};
export function solarizedTerminalTheme(dark: boolean): ITheme {
  return { ...ansi,
    background: dark ? "#002b36" : "#fdf6e3",
    foreground: dark ? "#839496" : "#657b83",
    cursor: dark ? "#93a1a1" : "#586e75",
    cursorAccent: dark ? "#002b36" : "#fdf6e3",
    selectionBackground: dark ? "#073642" : "#eee8d5",
    selectionForeground: dark ? "#93a1a1" : "#586e75",
  };
}

// Match Grok's own dark canvas without rewriting ANSI colors emitted by the CLI.
export function harnessTerminalTheme(dark: boolean, profile?: "grok"): ITheme {
  if (profile !== "grok") return solarizedTerminalTheme(dark);
  return { ...solarizedTerminalTheme(true), background: "#131313", foreground: "#d4d4d4",
    cursor: "#d4d4d4", cursorAccent: "#131313",
    selectionBackground: "#3a3a3a", selectionForeground: "#ffffff" };
}
