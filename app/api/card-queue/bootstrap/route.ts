import { readCardQueueSnapshot } from "@/lib/card-queue-store";
import { allowFileRoot } from "@/lib/allowed-roots";

export const dynamic = "force-dynamic";

// Render the saved board before loading the Pi SDK and scanning all sessions.
// The regular queue request immediately follows and reconciles live state.
export async function GET() {
  const started = Date.now();
  try {
    const state = await readCardQueueSnapshot();
    for (const workspace of state.workspaces ?? []) allowFileRoot(workspace.runtimeCwd);
    for (const card of state.cards) allowFileRoot(card.cwd);
    console.log(`[card-queue/bootstrap] ${Date.now() - started}ms cards=${state.cards.length}`);
    return Response.json({ ...state, defaultCwd: process.cwd() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.log(`[card-queue/bootstrap] ${Date.now() - started}ms error=${String(error)}`);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
