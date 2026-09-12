import { getPackageDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Use the installed Pi version's builder; do not maintain a copied prompt.
export async function defaultBasePrompt(cwd: string): Promise<string> {
  const url = pathToFileURL(join(getPackageDir(), "dist/core/system-prompt.js")).href;
  const { buildSystemPrompt } = await import(/* webpackIgnore: true */ url) as {
    buildSystemPrompt: (options: { cwd: string; contextFiles: []; skills: [] }) => string;
  };
  return buildSystemPrompt({ cwd, contextFiles: [], skills: [] });
}

/** Pi's generated resource sections follow its base text. */
export function basePartOfPrompt(prompt: string): string {
  const boundaries = ["\n\n<project_context>", "\n\nThe following skills provide specialized instructions", "\n<available_skills>"];
  const indices = boundaries.map(marker => prompt.indexOf(marker)).filter(index => index >= 0);
  return (indices.length ? prompt.slice(0, Math.min(...indices)) : prompt).trim();
}
