import { defaultBasePrompt } from "@/lib/base-prompt-preview";
import { NextResponse } from "next/server";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { projectTrustReloadOptions } from "@/lib/project-trust";
import { withCardQueue } from "@/lib/card-queue-store";
import { tagRulesPrompt } from "@/lib/turn-tag-protocol";
import { DEFAULT_TURN_TAGS } from "@/lib/turn-priority";
export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd || !isExistingFilePathAllowed(cwd, await getAllowedFileRoots())) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const agentDir = getAgentDir();
    const loader = new DefaultResourceLoader({ cwd, agentDir, noExtensions: true, noThemes: true, noPromptTemplates: true });
    await loader.reload(projectTrustReloadOptions(cwd, agentDir));
    const tags = await withCardQueue(state => ({ enabled: state.turnTagsEnabled !== false, prompt: tagRulesPrompt(state.turnTagDefinitions ?? DEFAULT_TURN_TAGS) }));
    return NextResponse.json({
      basePrompt: loader.getSystemPrompt() ?? await defaultBasePrompt(cwd), baseSource: loader.getSystemPromptSource()?.path,
      appendPrompt: loader.getAppendSystemPrompt().join("\n\n"),
      contextFiles: loader.getAgentsFiles().agentsFiles,
      skills: loader.getSkills().skills.map(skill => ({ name: skill.name, description: skill.description, path: skill.filePath, disabled: skill.disableModelInvocation })), tags,
    });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 500 }); }
}
