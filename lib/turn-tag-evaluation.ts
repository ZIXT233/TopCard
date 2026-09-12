import { withCardQueue } from "./card-queue-store.ts";
import { DEFAULT_TURN_TAGS, type TurnTag } from "./turn-priority.ts";
import { parseTurnTagMetadata, tagRulesPrompt, TURN_TAG_RULES } from "./turn-tag-protocol.ts";
import type { AgentSessionLike } from "./pi-types.ts";

/** Append only when semantic definitions differ. Never edit a cached prefix. */
export async function injectTurnTagRules(inner: AgentSessionLike, deliverAs: "steer" | "followUp" | "nextTurn" = "nextTurn") {
  const config = await withCardQueue(state => {
    const belongs = state.cards.some(card => card.session?.id === inner.sessionId || (!card.session && card.cwd === inner.sessionManager.getCwd()));
    return belongs ? { enabled: state.sortMode === "score" && state.turnTagsEnabled !== false, definitions: structuredClone(state.turnTagDefinitions ?? DEFAULT_TURN_TAGS) } : null;
  });
  if (!config) return;
  const { definitions, enabled } = config;
  const content = enabled ? tagRulesPrompt(definitions) : "Turn Tags disabled. Stop following previous turn-tag rules. Reply normally without turn_tags metadata.";
  const last = inner.sessionManager.buildSessionContext().messages.findLast(message => message.role === "custom" && message.customType === TURN_TAG_RULES);
  if (!enabled && !last) return;
  if (last && "content" in last && last.content === content) return;
  // SDK nextTurn appends custom messages AFTER the next user message. For an
  // idle prompt, persist the rules now so the actual request remains last.
  // Streaming delivery still uses the SDK queue to preserve tool-result order.
  await inner.sendCustomMessage({ customType: TURN_TAG_RULES, content, display: true, details: { definitions, enabled, change: !enabled ? "disabled" : last ? "updated" : "enabled" } }, {
    triggerTurn: false,
    ...(deliverAs === "nextTurn" ? {} : { deliverAs }),
  });
}

/** Parse this run's final reply locally; no model call, tool call, or repair request. */
export async function recordQueueTurn(sessionId: string, turnKey: string, text: string, definitions: TurnTag[]) {
  let tags: string[] = [];
  let urgentCall: import("./urgent-call.ts").UrgentCall | undefined;
  let error: string | undefined;
  try {
    ({ tags, urgentCall } = parseTurnTagMetadata(text, definitions));
  }
  catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  await withCardQueue(state => {
    if (state.sortMode !== "score" || state.turnTagsEnabled === false) return;
    const card = state.cards.find(item => item.session?.id === sessionId);
    if (!card || card.archivedAt !== undefined || card.turnKey === turnKey) return;
    card.phase = "attention";
    card.readyAt ??= Date.now();
    card.turnKey = turnKey;
    card.turnTags = tags;
    if (urgentCall) card.urgentCall = urgentCall;
    else delete card.urgentCall;
    const result = error ? undefined : { tags, ...(urgentCall ? { urgentCall } : {}) };
    card.tagEvaluation = { status: error ? "error" : "done", startedAt: Date.now(), definitions, result, ...(error ? { error } : {}) };
    (card.tagHistory ??= []).push({ turnKey, evaluatedAt: Date.now(), definitions, result, ...(error ? { error } : {}) });
  });
}

export async function beginQueueTurn(sessionId: string) {
  await withCardQueue((state) => {
    const card = state.cards.find((item) => item.session?.id === sessionId);
    if (!card) return;
    card.phase = "working";
    delete card.archivedAt; delete card.readyAt; delete card.waitingSince;
    delete card.turnKey; delete card.turnTags; delete card.tagEvaluation; delete card.urgentCall;
    state.order = state.order.filter((id) => id !== card.id);
  });
}
