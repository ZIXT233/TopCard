import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { QueueCard } from "./card-queue.ts";
import { validateTags } from "./turn-priority.ts";
import { parseTurnTagMetadata, TURN_TAG_RULES } from "./turn-tag-protocol.ts";

/** Use the last completed reply retained by the fork, never the parent's latest turn. */
export function inheritForkTurn(card: QueueCard, entries: ReturnType<SessionManager["buildContextEntries"]>, now = Date.now()): void {
  const final = entries.findLast(entry => entry.type === "message");
  if (!final || final.type !== "message" || final.message.role !== "assistant" || final.message.stopReason !== "stop") return;
  const rules = entries.slice(0, entries.indexOf(final)).findLast(entry => entry.type === "custom_message" && entry.customType === TURN_TAG_RULES);
  if (!rules || rules.type !== "custom_message") return;
  let definitions;
  try { definitions = validateTags((rules.details as { definitions?: unknown })?.definitions); }
  catch { return; }
  const text = final.message.content.filter(block => block.type === "text").map(block => block.text).join("\n");
  card.turnKey = final.id;
  card.readyAt = now;
  card.waitingSince = now;
  try {
    const result = parseTurnTagMetadata(text, definitions);
    card.turnTags = result.tags;
    card.urgentCall = result.urgentCall;
    card.tagEvaluation = { status: "done", startedAt: now, definitions, result };
    card.tagHistory = [{ turnKey: final.id, evaluatedAt: now, definitions, result }];
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    card.turnTags = [];
    card.tagEvaluation = { status: "error", startedAt: now, definitions, error };
  }
}
