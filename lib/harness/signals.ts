import type { HarnessState } from "./types.ts";
export interface HookSignal { kind?: string; at: number; event: string; replyPreview?: string; sessionId?: string; agentId?: string; tool?: string; prompt?: string; title?: string; notification?: string }
export interface ProbeState {
  replyPreview?: string;
  antigravityCompleted?: boolean;
  state: HarnessState;
  at: number;
  shellCommandStartedAt?: number;
  shellCommandRunning?: boolean;
  shellExitCode?: number;
  title?: string;
  titleState?: HarnessState;
  titleSeen?: boolean;
  hookSeen?: boolean;
  sessionId?: string;
  identityAt?: number;
  sessionIdPrefix?: string;
  source?: "hook" | "title";
}

// Event mapping follows Orca's Codex adapter (MIT, attribution in docs/harness).
// TopCard schedules the interactive root TUI, not a roster of background agents.
export function hookState(event: HookSignal): HarnessState | undefined {
  if (event.agentId) return undefined;
  if (event.event === "Notification" && ["permission_prompt", "ToolPermission"].includes(event.notification ?? "")) return "attention";
  if (event.event === "Notification" && event.notification === "idle_prompt") return "attention";
  if (event.event === "PermissionRequest") return "attention";
  if (["PreToolUse", "BeforeTool"].includes(event.event) && /(^|[/.])(request_user_input|ask_user_question|AskUserQuestion)$/.test(event.tool ?? "")) return "attention";
  if (["PreInvocation", "PostInvocation", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "beforeSubmitPrompt", "postToolUse", "postToolUseFailure", "BeforeAgent", "BeforeTool", "AfterTool"].includes(event.event)) return "working";
  if (["Stop", "StopFailure", "StopCancelled", "stop", "sessionEnd", "AfterAgent"].includes(event.event)) return "attention";
  // SessionStart proves identity and hook delivery, but does not prove a turn started.
  return undefined;
}
export function observeHook(current: ProbeState, signal: HookSignal): ProbeState {
  if (!Number.isFinite(signal.at) || signal.agentId) return current;
  if (typeof signal.event !== "string") return current;
  const sessionId = typeof signal.sessionId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(signal.sessionId) ? signal.sessionId : undefined;
  const cleanTitle = (value: unknown) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 160) || undefined : undefined;
  const newIdentity = sessionId && sessionId !== current.sessionId;
  const title = cleanTitle(signal.title) ?? (!newIdentity ? current.title : undefined) ?? cleanTitle(signal.prompt);
  const identity = sessionId && signal.at >= (current.identityAt ?? 0) ? { sessionId, sessionIdPrefix: undefined, identityAt: signal.at, title } : {};
  if (signal.at < current.at) return { ...current, hookSeen: true, ...identity };
  if (signal.kind === "antigravity" && current.antigravityCompleted && !newIdentity && signal.event !== "PreInvocation" && signal.event !== "Stop") return current;
  const state = hookState(signal);
  return { ...current, hookSeen: true, ...identity,
    ...(signal.kind === "antigravity" ? { antigravityCompleted: signal.event === "Stop" } : {}),
    replyPreview: state === "working" ? undefined : cleanTitle(signal.replyPreview) ?? (newIdentity ? undefined : current.replyPreview),
    ...(!state && ["SessionStart", "sessionStart"].includes(signal.event) && current.state === "starting" ? { state: "attention" as const } : {}),
    ...(state ? { state, at: signal.at, source: "hook" as const } : {}),
  };
}
export function observeTitle(current: ProbeState, state: HarnessState, at: number, hooksAuthoritative = false): ProbeState {
  if (hooksAuthoritative && current.hookSeen) return { ...current, titleSeen: true, titleState: state };
  // A repeated spinner must not override a newer approval hook with an old working title.
  if (current.titleState === state) return { ...current, titleSeen: true };
  return { ...current, titleSeen: true, titleState: state, state, at, source: "title" };
}
