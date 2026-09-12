import type { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
type DefaultResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];
export const PROMPT_SOURCES_ENTRY = "topcard:prompt-sources";
export interface PromptSourcesConfig { basePrompt: string; excludedContextFiles: string[]; excludedSkills: string[] }
export const DEFAULT_PROMPT_SOURCES: PromptSourcesConfig = { basePrompt: "", excludedContextFiles: [], excludedSkills: [] };
export function validatePromptSources(value: unknown): PromptSourcesConfig {
  if (!value || typeof value !== "object") throw new Error("Invalid prompt sources");
  const data = value as Record<string, unknown>;
  if (typeof data.basePrompt !== "string" || data.basePrompt.length > 200000) throw new Error("Invalid base prompt");
  for (const key of ["excludedContextFiles", "excludedSkills"] as const) {
    if (!Array.isArray(data[key]) || data[key].length > 2000 || data[key].some(path => typeof path !== "string" || path.length > 4096)) throw new Error("Invalid source selection");
  }
  return { basePrompt: data.basePrompt, excludedContextFiles: [...new Set(data.excludedContextFiles as string[])], excludedSkills: [...new Set(data.excludedSkills as string[])] };
}
export function promptSourceOverrides(config: PromptSourcesConfig): Pick<DefaultResourceLoaderOptions, "systemPromptOverride" | "agentsFilesOverride" | "skillsOverride"> {
  return {
    systemPromptOverride: base => config.basePrompt.trim() ? config.basePrompt : base,
    agentsFilesOverride: base => ({ ...base, agentsFiles: base.agentsFiles.filter(file => !config.excludedContextFiles.includes(file.path)) }),
    skillsOverride: base => ({ ...base, skills: base.skills.filter(skill => !config.excludedSkills.includes(skill.filePath)) }),
  };
}
