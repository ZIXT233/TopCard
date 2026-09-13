"use client";

import { persistentStorage } from "../lib/persistent-storage.ts";

import { harnessName } from "@/lib/harness/catalog";
import { SessionSystemPromptEditor } from "./SessionSystemPromptEditor";
import { ScoreChipTooltip } from "./ScoreChipTooltip";
import { useI18n } from "@/hooks/useI18n";

import { UrgentCallDialog } from "./UrgentCallDialog";
import { hasUrgentCall } from "@/lib/urgent-call";
import { PriorityBadge } from "./PriorityBadge";
import { tagColor } from "@/lib/tag-color";
import { THEME_OPTIONS } from "@/lib/theme";
import { DEFAULT_TURN_TAGS, scoreCard, sortedQueue, resolveQueueFocus } from "@/lib/turn-priority";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { HarnessCard } from "./HarnessCard";
import { ChatWindow } from "./ChatWindow";
import { SettingsPanel } from "./SettingsPanel";
import { FileViewer } from "./FileViewer";
import { BranchNavigator } from "./BranchNavigator";
import { useQueueScoreClock } from "@/hooks/useQueueScoreClock";
import { completedCards } from "@/lib/card-completion";
import { useCompletionNotifications } from "@/hooks/useCompletionNotifications";
import { useCardQueue } from "@/hooks/useCardQueue";
import { useTheme } from "@/hooks/useTheme";
import { WorkspacePicker, WorkspaceForm } from "./WorkspacePicker";
import { WorkspaceMachineIcon } from "./WorkspaceMachineIcon";
import { ThemeIcon } from "./ThemeIcon";
import { LanguageIcon } from "./LanguageIcon";
import { CardTransfers } from "./CardTransfers";
import { CardInspectionOverlay } from "./CardInspectionOverlay";
import { CardDeck } from "./CardDeck";
import { CardQueueMinimap } from "./CardQueueMinimap";
import { CardQuickSearch, type CardQuickSearchItem } from "./CardQuickSearch";
import { getLastSettingsSection, type SettingsSection } from "@/lib/settings-navigation";
import { DetachedCardTools, type DetachedCardLayoutControls } from "./DetachedCardTools";
import { ToolDefinitionsPanel } from "./ToolDefinitionsPanel";
import { useAudio } from "@/hooks/useAudio";
import { useAttentionMode } from "@/hooks/useAttentionMode";
import { ATTENTION_MODES, shouldQuietRearQueueArrival, type AttentionMode } from "@/lib/attention-mode";
import { QUEUE_TOAST_EVENT } from "@/lib/queue-toast";
import { latestAssistantReply, queueArrivalSide } from "@/lib/queue-arrival";
import { QueueArrivalPreview, type QueueArrivalNotice } from "./QueueArrivalPreview";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import type { ToolEntry } from "@/lib/tool-presets";
import { filterHistoricalSessions } from "@/lib/card-queue";
import type { QueueCard, QueueWorkspace } from "@/lib/card-queue";
import type { RemoteHost } from "@/lib/remote-hosts";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ChatInputHandle } from "./ChatInput";

const cardTitle = (card: QueueCard, fallback: string) => card.harness?.title || card.session?.name || (card.session?.firstMessage && card.session.firstMessage !== "(no messages)" ? card.session.firstMessage : fallback);
const URGENT_ALERTS_KEY = "topcard:urgent-alerts";
const cardTurnKey = (card: QueueCard) => JSON.stringify([
  card.id,
  card.turnKey ?? ["legacy", card.session?.modified, card.session?.messageCount, card.readyAt],
]);
const projectOf = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;

const openDetachedCardTab = (cardId: string) => {
  const desktop = (window as Window & { topcardDesktop?: { openCard?: (id: string) => void } }).topcardDesktop;
  if (desktop?.openCard) { desktop.openCard(cardId); return true; }
  const name = `card-${cardId}`;
  const targetUrl = new URL("/", window.location.href);
  targetUrl.searchParams.set("card", cardId);
  // Passing the URL to window.open() navigates an existing named tab again.
  // Open/reuse it without a URL first so an already-correct card only gets focus.
  const tab = window.open("", name);
  if (!tab) return null;

  let alreadyOpen = false;
  try {
    const current = new URL(tab.location.href);
    alreadyOpen = current.origin === targetUrl.origin
      && current.pathname === targetUrl.pathname
      && current.searchParams.get("card") === cardId;
  } catch {
    // A same-named tab may have navigated elsewhere; it can still be sent back.
  }
  if (!alreadyOpen) tab.location.replace(targetUrl.href);
  tab.focus();
  return tab;
};

function Icon({ name, size = 18 }: { name: "plus" | "stack" | "out" | "maximize" | "down" | "close" | "settings" | "history" | "archive" | "arrow" | "undo" | "bell" | "bell-filled" | "tools"; size?: number }) {
  if (name === "bell-filled") return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a6 6 0 0 0-6 6v2.9c0 2.1-.8 4.1-2.3 5.6A1.2 1.2 0 0 0 4.6 19h14.8a1.2 1.2 0 0 0 .9-2.5c-1.5-1.5-2.3-3.5-2.3-5.6V8a6 6 0 0 0-6-6Zm-2.7 19a3 3 0 0 0 5.4 0H9.3Z" /></svg>;
  const paths = {
    plus: "M12 5v14M5 12h14", stack: "m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4",
    out: "M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
    maximize: "M8 3H3v5m18 0V3h-5M3 16v5h5m8 0h5v-5",
    down: "M12 3v12m-5-5 5 5 5-5M4 20h16", close: "m6 6 12 12M6 18 18 6",
    settings: "M4 7h16M4 17h16M8 4v6m8 4v6", history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2",
    archive: "M3 3h18v5H3zM5 8v13h14V8M10 12h4", arrow: "M19 12H5m6-6-6 6 6 6",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    undo: "m9 14-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-1",
    tools: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}


const SessionCard = memo(function SessionCard({ card, onCreated, onSubmitted, onRejected, onRefresh, onAdopt, onFork, onFile, onWorking, onOpenModelSettings, modelsRefreshKey, quoteSelectionEnabled, audio, detachedTools }: {
  audio: Pick<ReturnType<typeof useAudio>, "soundEnabled" | "onSoundToggle" | "playDoneSound" | "unlockAudio">;
  card: QueueCard; onCreated: (cardId: string, session: SessionInfo) => void;
  onSubmitted: (cardId: string) => void; onRejected: (cardId: string) => void;
  onWorking: (cardId: string) => void;
  onRefresh: () => void; onAdopt: (sessionId: string) => void;
  onFork: (sessionId: string) => void;
  onOpenModelSettings: () => void;
  onFile: (path: string) => void; modelsRefreshKey: number; quoteSelectionEnabled: boolean;
  detachedTools?: Pick<DetachedCardLayoutControls, "toggleTools" | "toolsOpen" | "toolsPanelTarget">;
}) {
  const { t } = useI18n();
  const inputRef = useRef<ChatInputHandle | null>(null);
  const branchAnchor = useRef<HTMLSpanElement>(null);
  const [branchTarget, setBranchTarget] = useState<Element | null>(null);
  const [toolsButtonTarget, setToolsButtonTarget] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const cardElement = branchAnchor.current?.closest("article");
    setBranchTarget(cardElement?.querySelector(".cq-title-branches") ?? null);
    setToolsButtonTarget(cardElement?.querySelector(".cq-title-tools") ?? null);
  }, []);
  const [branches, setBranches] = useState<{ tree: SessionTreeNode[]; leaf: string | null; navigate: (id: string | null) => void } | null>(null);
  const [tools, setTools] = useState<ToolEntry[] | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [inlineToolsOpen, setInlineToolsOpen] = useState(false);
  const toolsLoaderRef = useRef<(() => Promise<void>) | null>(null);
  const toolsLoadIdRef = useRef(0);
  const onBranchDataChange = useCallback((tree: SessionTreeNode[], leaf: string | null, navigate: (id: string | null) => void) => setBranches({ tree, leaf, navigate }), []);
  const onSystemToolsChange = useCallback((nextTools: ToolEntry[] | null) => setTools(nextTools), []);
  const onSystemInfoLoaderChange = useCallback((loader: (() => Promise<void>) | null) => {
    toolsLoaderRef.current = loader;
  }, []);
  const toolsOpen = detachedTools?.toolsOpen ?? inlineToolsOpen;
  const activeToolCount = tools?.filter((tool) => tool.active).length;
  const toggleTools = useCallback(() => {
    const opening = !toolsOpen;
    if (detachedTools) detachedTools.toggleTools();
    else setInlineToolsOpen(opening);
    if (!opening) return;
    const loader = toolsLoaderRef.current;
    if (!loader) return;
    const loadId = ++toolsLoadIdRef.current;
    setToolsLoading(true);
    void loader().catch((error) => {
      console.error("Failed to load session tools:", error);
    }).finally(() => {
      if (toolsLoadIdRef.current === loadId) setToolsLoading(false);
    });
  }, [detachedTools, toolsOpen]);
  const onPromptAccepted = useCallback(() => onWorking(card.id), [card.id, onWorking]);
  const onPromptSubmitted = useCallback(() => onSubmitted(card.id), [card.id, onSubmitted]);
  const onPromptRejected = useCallback(() => onRejected(card.id), [card.id, onRejected]);
  const onSessionCreated = useCallback((session: SessionInfo) => onCreated(card.id, session), [card.id, onCreated]);
  const chat = <div className="cq-chat">
      <ChatWindow onOpenModelSettings={onOpenModelSettings} session={card.session} sessionRunning={card.phase === "working"}
        newSessionHeading={t("queue.从这里开始")}
        newSessionCwd={card.cwd} newSessionDraftKey={`card:${card.id}`} chatInputRef={inputRef}
        onSessionCreated={onSessionCreated} onPromptSubmitted={!card.session ? onPromptSubmitted : undefined}
        onPromptAccepted={onPromptAccepted} onPromptRejected={!card.session ? onPromptRejected : undefined}
        onAgentEnd={onRefresh} onAttentionNeeded={onRefresh}
        onSessionForked={onFork} onOpenSession={onAdopt} onBranchDataChange={onBranchDataChange}
        onSystemToolsChange={onSystemToolsChange} onSystemInfoLoaderChange={onSystemInfoLoaderChange}
        onOpenFile={onFile} quoteSelectionEnabled={quoteSelectionEnabled} modelsRefreshKey={modelsRefreshKey}
        soundEnabled={audio.soundEnabled} onSoundToggle={audio.onSoundToggle} playDoneSound={audio.playDoneSound}
        unlockAudio={audio.unlockAudio} />
    </div>;
  return <>
    <span ref={branchAnchor} hidden />
    {branches && branchTarget && createPortal(<BranchNavigator tree={branches.tree} activeLeafId={branches.leaf} onLeafChange={branches.navigate} inline cardStyle hasSession={!!card.session} />, branchTarget)}
    {toolsButtonTarget && createPortal(
      <button type="button" className="cq-tools-trigger" aria-expanded={toolsOpen} aria-pressed={toolsOpen} onClick={toggleTools} title={t("queue.viewSessionTools")}>
        <Icon name="tools" size={13} />
        <span>{t("tools.label")}</span>
        {activeToolCount !== undefined && <small>{activeToolCount}</small>}
      </button>,
      toolsButtonTarget,
    )}
    {toolsButtonTarget && createPortal(<SessionSystemPromptEditor card={card} onRefresh={onRefresh} />, toolsButtonTarget)}
    {toolsOpen && !detachedTools && <section className="cq-inline-tools" aria-label={t("tools.title")}>
      <div className="cq-inline-tools-heading"><span>{t("queue.sessionTools")}</span><button type="button" onClick={toggleTools} aria-label={t("queue.closeSessionTools")}>×</button></div>
      <ToolDefinitionsPanel loading={toolsLoading} tools={tools} translate={t} />
    </section>}
    {detachedTools?.toolsPanelTarget && createPortal(
      <ToolDefinitionsPanel loading={toolsLoading} tools={tools} translate={t} />,
      detachedTools.toolsPanelTarget,
    )}
    {chat}
  </>;
});

export function CardQueueShell() {
  const { t, locale, setLocale, supportedLocales } = useI18n();
  const titleOf = useCallback((card: QueueCard) => cardTitle(card, t("queue.新会话")), [t]);
  const router = useRouter();
  const params = useSearchParams();
  const detachedId = params.get("card");
  const requestedSessionId = params.get("session");
  const requestedAttentionId = params.get("attention");
  const { queue, defaultCwd, error: connectionError, refresh, act, markWorking, rollbackWorking } = useCardQueue();
  const notifications = useCompletionNotifications(queue);
  const { mode: attentionMode, setMode: setAttentionMode } = useAttentionMode();
  const { soundEnabled, onSoundToggle, unlockAudio, playDoneSound, playQueueArrivalSound } = useAudio();
  const audio = useMemo(() => ({ soundEnabled, onSoundToggle, playDoneSound, unlockAudio }), [soundEnabled, onSoundToggle, playDoneSound, unlockAudio]);
  const previousSoundCards = useRef<QueueCard[] | null>(null);
  // Both the management surface and detached tabs follow cross-tab changes.
  const { preference, setThemePreference } = useTheme();
  const attentionOption = ATTENTION_MODES.find((option) => option.id === attentionMode) ?? ATTENTION_MODES[0];
  useViewportHeight();
  const [inspecting, setInspecting] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [workspaceThenCreate, setWorkspaceThenCreate] = useState(false);
  const [workspaceFormEntry, setWorkspaceFormEntry] = useState<"local" | RemoteHost>("local");
  const [history, setHistory] = useState<SessionInfo[] | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const [quoteSelectionEnabled, setQuoteSelectionEnabled] = useState(true);
  const [file, setFile] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<QueueCard | null>(null);
  const [skipArchiveConfirmation, setSkipArchiveConfirmation] = useState(false);
  const [skipArchiveChecked, setSkipArchiveChecked] = useState(false);
  const [deferConfirm, setDeferConfirm] = useState<QueueCard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deckReset, setDeckReset] = useState(0);
  const deckNavigationRef = useRef<((direction: number) => void) | null>(null);
  const submissionTransferFrames = useRef(new Map<string, number>());
  const [claimOwner, setClaimOwner] = useState<string | null>(null);
  const [claimError, setClaimError] = useState("");
  const ownerRef = useRef<string | null>(null);
  const leaseGeneration = useRef(0);

  const openedSessionRef = useRef<string | null>(null);
  const [urgentAlerts, setUrgentAlerts] = useState<Set<string> | null>(null);
  const [arrivalNotices, setArrivalNotices] = useState<QueueArrivalNotice[]>([]);
  const [queueToast, setQueueToast] = useState("");
  const queueToastTimer = useRef<number | null>(null);
  const showQueueToast = useCallback((message: string) => {
    if (queueToastTimer.current) window.clearTimeout(queueToastTimer.current);
    setQueueToast(message);
    queueToastTimer.current = window.setTimeout(() => {
      queueToastTimer.current = null;
      setQueueToast("");
    }, 4200);
  }, []);
  useEffect(() => {
    const onToast = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (typeof message === "string" && message) showQueueToast(message);
    };
    window.addEventListener(QUEUE_TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(QUEUE_TOAST_EVENT, onToast);
      if (queueToastTimer.current) window.clearTimeout(queueToastTimer.current);
    };
  }, [showQueueToast]);
  const [focus, setFocus] = useState<{id: string; index: number} | null>(null);
  const [remoteHosts, setRemoteHosts] = useState<RemoteHost[]>([]);
  const refreshRemoteHosts = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/workspace-machines", { signal });
      if (!response.ok) return;
      const hosts: RemoteHost[] = (await response.json()).hosts ?? [];
      setRemoteHosts(hosts.filter((host) => host.source !== "config" || host.visible !== false));
    } catch { /* Keep the last host list when refresh is interrupted. */ }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refreshRemoteHosts(controller.signal);
    const refresh = () => void refreshRemoteHosts();
    window.addEventListener("topcard-remote-hosts-changed", refresh);
    return () => { controller.abort(); window.removeEventListener("topcard-remote-hosts-changed", refresh); };
  }, [refreshRemoteHosts]);
  const cards = queue?.cards ?? [];
  const workspaces = queue?.workspaces ?? [];
  const remoteHostOf = (workspace?: QueueWorkspace) => workspace?.kind === "ssh" ? remoteHosts.find((host) => host.id === workspace.sshHost) : undefined;
  const hostLabelOf = (workspace?: QueueWorkspace) => workspace?.kind === "ssh" ? remoteHostOf(workspace)?.name || workspace.sshHost || "SSH" : t("machines.local");
  const cardHostLabel = (card: QueueCard, workspace?: QueueWorkspace) => {
    const host = hostLabelOf(workspace);
    if (!card.harness) return host;
    // Session names go on the card heading, not this host/CLI chip.
    return `${host} · ${harnessName(card.harness.kind)}`;
  };
  const visibleHistory = filterHistoricalSessions(history ?? [], cards, historySearch);
  const workspaceOf = (card: QueueCard) => workspaces.find((workspace) => workspace.id === card.workspaceId);
  const displayProject = (card: QueueCard) => workspaceOf(card)?.name || projectOf(card.cwd);
  const working = cards.filter((card) => card.phase === "working" && !card.detached && !card.harness?.setup);
  const archived = cards.filter((card) => card.archivedAt !== undefined).sort((a, b) => b.archivedAt! - a.archivedAt!);
  const detached = cards.filter((card) => card.detached);
  const scoreTick = useQueueScoreClock(queue);
  const ready = useMemo(() => {
    // The clock invalidates time-dependent ordering even when the API is unchanged.
    void scoreTick;
    return queue ? sortedQueue(queue) : [];
  }, [queue, scoreTick]);
  const deckIndex = resolveQueueFocus(ready, focus?.id ?? null, focus?.index ?? 0);
  const selectQueueCard = useCallback((index: number) => {
    const card = ready[index];
    if (!card) return;
    if (!inspecting && index === deckIndex) return;
    setInspecting(null);
    setFocus({ id: card.id, index });
    setDeckReset((key) => key + 1);
  }, [ready, inspecting, deckIndex]);
  const cardSearchItems: CardQuickSearchItem[] = [
    ...working.map((card) => ({ card, location: "working" as const })),
    ...ready.map((card) => ({ card, location: "queue" as const })),
    ...detached.map((card) => ({ card, location: "detached" as const })),
  ].map(({ card, location }) => {
    const workspace = workspaceOf(card);
    return {
      id: card.id,
      title: titleOf(card),
      host: cardHostLabel(card, workspace),
      folder: projectOf(card.cwd),
      remote: workspace?.kind === "ssh",
      location,
    };
  });
  const tags = queue?.turnTagDefinitions ?? DEFAULT_TURN_TAGS;
  const inspected = cards.find((card) => card.id === inspecting && !card.detached);
  const active = detachedId ? cards.find((card) => card.id === detachedId) : inspected || ready[Math.min(deckIndex, Math.max(0, ready.length - 1))];
  const detachedWindowTitle = detachedId && active
    ? `${active.harness ? `${harnessName(active.harness.kind)} · ` : ""}${titleOf(active)}`
    : null;
  useEffect(() => {
    if (!detachedWindowTitle) return;
    const previousTitle = document.title;
    document.title = detachedWindowTitle;
    return () => { document.title = previousTitle; };
  }, [detachedWindowTitle]);
  useEffect(() => {
    if (!active || inspecting || detachedId) return;
    setFocus(current => current?.id === active.id && current.index === deckIndex ? current : {id:active.id,index:deckIndex});
  }, [active, deckIndex, inspecting, detachedId]); // Keep the next reader stable after explicit actions.

  const priorHarnessPhases = useRef(new Map<string, string>());
  useEffect(() => {
    if (!queue) return;
    for (const card of queue.cards) {
      const previous = priorHarnessPhases.current.get(card.id);
      if (card.harness && card.phase === "working" && previous && previous !== "working") {
        setInspecting(current => current === card.id ? null : current);
      }
    }
    priorHarnessPhases.current = new Map(queue.cards.map(card => [card.id, card.phase]));
  }, [queue]);

  const resolvedAttention = useRef<string | null>(null);
  const focusNotificationCard = useCallback((id: string) => {
    const target = queue?.cards.find(card => card.id === id);
    if (!target || detachedId) return false;
    if (target.detached) {
      openDetachedCardTab(target.id);
      return true;
    }
    const index = ready.findIndex(card => card.id === id);
    setHistory(null);
    setInspecting(index < 0 ? id : null);
    setFocus({ id, index: Math.max(0, index) });
    setDeckReset(key => key + 1);
    return true;
  }, [queue, detachedId, ready]);
  useEffect(() => {
    if (requestedAttentionId && resolvedAttention.current !== requestedAttentionId && focusNotificationCard(requestedAttentionId)) {
      resolvedAttention.current = requestedAttentionId;
    }
  }, [requestedAttentionId, focusNotificationCard]);

  const activeCardRef = useRef<{ id?: string; detached: boolean }>({ detached: false });
  activeCardRef.current = { id: active?.id, detached: !!detachedId };
  const finishCard = useCallback((cardId: string) => {
    // An accepted action may finish after the user has opened a different card.
    if (activeCardRef.current.detached || activeCardRef.current.id !== cardId) return;
    setInspecting(null);
    setFocus(null);
    setDeckReset((key) => key + 1);
  }, []);
  const advanceToNextCard = useCallback((cardId: string) => {
    const currentIndex = ready.findIndex((card) => card.id === cardId);
    const next = currentIndex >= 0 && ready.length > 1
      ? ready[(currentIndex + 1) % ready.length]
      : undefined;
    setInspecting(null);
    setFocus(next ? { id: next.id, index: ready.indexOf(next) } : null);
    setDeckReset((key) => key + 1);
  }, [ready]);
  const onWorking = useCallback((cardId: string) => {
    finishCard(cardId);
    markWorking(cardId);
  }, [finishCard, markWorking]);
  const onSubmitted = useCallback((cardId: string) => {
    // Keep the expanded source mounted for one committed frame. CardTransfers
    // can then snapshot the same attention -> working flight used by queued cards.
    markWorking(cardId, undefined, true);
    const previousFrame = submissionTransferFrames.current.get(cardId);
    if (previousFrame !== undefined) cancelAnimationFrame(previousFrame);
    const frame = requestAnimationFrame(() => {
      submissionTransferFrames.current.delete(cardId);
      finishCard(cardId);
    });
    submissionTransferFrames.current.set(cardId, frame);
  }, [finishCard, markWorking]);
  const onRejected = useCallback((cardId: string) => {
    const frame = submissionTransferFrames.current.get(cardId);
    if (frame !== undefined) cancelAnimationFrame(frame);
    submissionTransferFrames.current.delete(cardId);
    rollbackWorking(cardId);
    setInspecting(cardId);
  }, [rollbackWorking]);
  useEffect(() => () => {
    for (const frame of submissionTransferFrames.current.values()) cancelAnimationFrame(frame);
    submissionTransferFrames.current.clear();
  }, []);

  const canShowDetached = !detachedId || (claimOwner && active?.detached?.owner === claimOwner);
  useEffect(() => {
    if (!queue) return;
    const completed = completedCards(previousSoundCards.current, queue.cards);
    previousSoundCards.current = queue.cards;
    if (detachedId) return;
    const orderedIds = ready.map((card) => card.id);
    const focusedId = focus?.id ?? active?.id;
    for (const card of completed) {
      if (card.detached) continue;
      const side = queueArrivalSide(orderedIds, focusedId, card.id);
      if (!side) continue;
      const key = cardTurnKey(card);
      const quiet = shouldQuietRearQueueArrival(attentionMode, side, document.visibilityState);
      const fallback = card.harness?.replyPreview
        || (card.harness?.kind === "shell" ? t("harness.commandDone") : t("queue.回复已完成"));
      setArrivalNotices((current) => current.some((notice) => notice.key === key) ? current : [...current, {
        key,
        cardId: card.id,
        side,
        quiet,
        title: titleOf(card),
        reply: fallback,
      }]);
      if (!card.session) continue;
      void fetch(`/api/sessions/${encodeURIComponent(card.session.id)}?tail=8&deferThinking=1&deferMedia=1`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("preview unavailable")))
        .then((data: { context?: { messages?: unknown[] } }) => {
          const reply = latestAssistantReply(data.context?.messages ?? []);
          if (!reply) return;
          setArrivalNotices((current) => current.map((notice) => notice.key === key ? { ...notice, reply } : notice));
        })
        .catch(() => {});
    }
  }, [queue, detachedId, ready, focus?.id, active?.id, attentionMode, t, titleOf]);

  // Replies can arrive after the completion hook. Enrich only the same turn's notice.
  useEffect(() => {
    if (!queue) return;
    setArrivalNotices(current => {
      let changed = false;
      const next = current.map(notice => {
        const card = queue.cards.find(item => item.id === notice.cardId);
        const reply = card?.harness?.replyPreview;
        if (!card || card.phase !== "attention" || cardTurnKey(card) !== notice.key || !reply || reply === notice.reply) return notice;
        changed = true;
        return { ...notice, reply };
      });
      return changed ? next : current;
    });
  }, [queue]);

  const arrivalNotice = arrivalNotices[0];
  const arrivalNoticeKey = arrivalNotice?.key;
  const arrivalNoticeSide = arrivalNotice?.side;
  const arrivalNoticeQuiet = arrivalNotice?.quiet === true;
  useEffect(() => {
    if (!arrivalNoticeKey || !arrivalNoticeSide) return;
    if (!arrivalNoticeQuiet) playQueueArrivalSound(arrivalNoticeSide);
    const timer = window.setTimeout(() => setArrivalNotices((current) => current.slice(1)), 5000);
    return () => window.clearTimeout(timer);
  }, [arrivalNoticeKey, arrivalNoticeSide, arrivalNoticeQuiet, playQueueArrivalSound]);

  const urgentCard = urgentAlerts ? cards.filter((card) => card.phase === "attention" && card.archivedAt === undefined
    && (detachedId ? card.id === detachedId && canShowDetached : !card.detached)
    && hasUrgentCall(card) && !urgentAlerts.has(cardTurnKey(card)))
    .sort((a, b) => (a.readyAt ?? a.createdAt) - (b.readyAt ?? b.createdAt))[0] : undefined;
  const dismissUrgent = () => {
    if (!urgentCard) return;
    const next = new Set(urgentAlerts ?? []);
    next.add(cardTurnKey(urgentCard));
    setUrgentAlerts(next);
    try { persistentStorage().setItem(URGENT_ALERTS_KEY, JSON.stringify([...next])); } catch { /* Keep the reminder acknowledged in memory. */ }
  };
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(persistentStorage().getItem(URGENT_ALERTS_KEY) || "[]");
      setUrgentAlerts(new Set(Array.isArray(saved) ? saved.filter((key): key is string => typeof key === "string") : []));
    } catch { setUrgentAlerts(new Set()); }
  }, []);


  const run = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    setError("");
    try { return await act(action, data); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return null; }
  }, [act]);
  const chooseSortMode = useCallback(async (mode: "score" | "fifo") => {
    if (!queue || busy || queue.sortMode === mode) return;
    setBusy(true);
    if (active) setFocus({ id: active.id, index: deckIndex });
    try {
      const result = await run("sort_mode", { mode });
      if (result) showQueueToast(t(mode === "score" ? "queue.已切换评分排序说明" : "queue.已切换先进先出说明"));
    }
    finally { setBusy(false); }
  }, [active, busy, deckIndex, queue, run, showQueueToast, t]);
  const chooseAttentionMode = useCallback((mode: AttentionMode) => {
    if (mode === attentionMode) return;
    setAttentionMode(mode);
    showQueueToast(t(mode === "focus" ? "queue.已切换专注模式说明" : "queue.已切换日常模式说明"));
  }, [attentionMode, setAttentionMode, showQueueToast, t]);

  useEffect(() => {
    if (!detachedId) return;
    const desktopOwner = (window as Window & { topcardDesktop?: { owner?: string } }).topcardDesktop?.owner;
    const owner = ownerRef.current ??= desktopOwner || crypto.randomUUID();
    const generation = ++leaseGeneration.current;
    const stillCurrent = () => leaseGeneration.current === generation;
    let alive = true;
    const release = () => {
      if (desktopOwner) return; // The native window owns its lease across page reloads.
      navigator.sendBeacon("/api/card-queue", new Blob([JSON.stringify({ action: "release", id: detachedId, owner })], { type: "application/json" }));
    };
    const claim = async () => {
      try {
        await act("claim", { id: detachedId, owner });
        if (alive) { setClaimOwner(owner); setClaimError(""); }
        else if (stillCurrent()) release();
      } catch (error) {
        if (alive) setClaimError(error instanceof Error ? error.message : String(error));
      }
    };
    void claim();
    const timer = setInterval(() => { void claim(); }, 20_000);
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", claim);
    return () => {
      alive = false;
      clearInterval(timer);
      // React Strict Mode replays effects. A replay must not release the new
      // effect's identical lease; an actual unmount must still release it.
      queueMicrotask(() => { if (stillCurrent()) release(); });
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", claim);
    };
  }, [detachedId, act]);

  const onCreated = useCallback((cardId: string, session: SessionInfo) => {
    // Prompt preflight supplied the real session id; persist it while keeping
    // the already-optimistic card in Working.
    finishCard(cardId);
    markWorking(cardId, session, true);
    void run("attach", { id: cardId, sessionId: session.id }).then((result) => {
      if (!result) {
        onRejected(cardId);
        return;
      }
      if (result && session.messageCount > 0) {
        setInspecting((current) => current === cardId ? null : current);
      }
    });
  }, [finishCard, markWorking, onRejected, run]);
  const onAdopt = useCallback((sessionId: string) => {
    void run("adopt", { sessionId }).then((result) => {
      const target = result?.cards.find(card => card.session?.id === sessionId);
      if (!result || !target) return;
      setHistory(null);
      if (target.detached) { router.push(`/?card=${encodeURIComponent(target.id)}`); return; }
      const index = sortedQueue(result).findIndex(card => card.id === target.id);
      setInspecting(index < 0 ? target.id : null);
      setFocus({ id: target.id, index: Math.max(0, index) });
      setDeckReset(key => key + 1);
    });
  }, [run, router]);
  const onFork = useCallback((sessionId: string) => {
    void run("adopt", { sessionId, fork: true }).then((result) => {
      const forkedCard = result?.cards.find((card) => card.session?.id === sessionId);
      if (!forkedCard || !result) return;
      setHistory(null);
      setInspecting(null);
      setFocus({ id: forkedCard.id, index: sortedQueue(result).findIndex((card) => card.id === forkedCard.id) });
      setDeckReset((key) => key + 1);
      if (detachedId) router.replace("/");
    });
  }, [run, detachedId, router]);
  useEffect(() => {
    if (!requestedSessionId || detachedId || openedSessionRef.current === requestedSessionId) return;
    openedSessionRef.current = requestedSessionId;
    onAdopt(requestedSessionId);
  }, [requestedSessionId, detachedId, onAdopt]);
  useEffect(() => {
    const openFromNotification = (raw: string) => {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const cardId = url.searchParams.get("card");
      if (cardId) { openDetachedCardTab(cardId); return; }
      const attentionId = url.searchParams.get("attention");
      if (attentionId) { focusNotificationCard(attentionId); return; }
      const sessionId = url.searchParams.get("session");
      if (sessionId && !detachedId) onAdopt(sessionId);
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "notification-click" || typeof event.data.url !== "string") return;
      openFromNotification(event.data.url);
    };
    const onDesktopNotification = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (typeof url === "string") openFromNotification(url);
    };
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    window.addEventListener("topcard:notification-click", onDesktopNotification);
    return () => {
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
      window.removeEventListener("topcard:notification-click", onDesktopNotification);
    };
  }, [detachedId, onAdopt, focusNotificationCard]);
  const shift = useCallback(async (card = active) => {
    if (!card || detachedId || ready.length < 2 || inspecting) return false;
    const result = await run(queue?.sortMode === "score" ? "reset_wait" : "back", { id: card.id });
    if (result) advanceToNextCard(card.id);
    return !!result;
  }, [active, detachedId, ready.length, inspecting, run, queue?.sortMode, advanceToNextCard]);
  const requestShift = useCallback((card = active) => {
    if (!card || detachedId || ready.length < 2 || inspecting) return;
    setDeferConfirm(card);
  }, [active, detachedId, ready.length, inspecting]);

  const showNew = useCallback(() => {
    setCreating(true);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || settings || creating || history || detachedId) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
          || inspecting || addingWorkspace || file || archiveConfirm || deferConfirm || urgentCard) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="menu"],[role="tablist"],[role="dialog"],dialog,summary')) return;
        if (!ready.length) return;
        // Consume native scroll even at the ends; one physical press = one card.
        event.preventDefault();
        if (event.repeat) return;
        const direction = event.key === "ArrowRight" ? 1 : -1;
        deckNavigationRef.current?.(direction);
        return;
      }
      if (event.key === "Escape") { setInspecting(null); setFile(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings, creating, history, detachedId, inspecting, addingWorkspace, file, archiveConfirm, deferConfirm, urgentCard, ready]);

  const openHistory = async () => {
    try {
      const response = await fetch("/api/sessions");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const sessions = new Map<string, SessionInfo>();
      for (const card of archived) if (card.session) sessions.set(card.session.id, card.session);
      for (const session of data.sessions as SessionInfo[]) sessions.set(session.id, session);
      const completedAt = new Map(archived.map((card) => [card.session?.id, card.archivedAt!]));
      setHistory([...sessions.values()].sort((a, b) =>
        Math.max(completedAt.get(b.id) ?? 0, new Date(b.modified).getTime()) - Math.max(completedAt.get(a.id) ?? 0, new Date(a.modified).getTime())
      ));
      setHistorySearch("");
    } catch (error) { setError(String(error)); }
  };
  const popout = () => {
    if (!active) return;
    const tab = openDetachedCardTab(active.id);
    if (!tab) setError(t("queue.浏览器拦截了新标签页，请允许本站打开弹出窗口。"));
    else advanceToNextCard(active.id);
  };
  const returnToQueue = async () => {
    if (detachedId && claimOwner) await run("release", { id: detachedId, owner: claimOwner });
    window.close();
    // User-opened tabs may not be script-closable. Navigate out so they stop
    // renewing their lease and return to the same management surface.
    router.replace("/");
  };

  const renderCardContent = (visibleCard: QueueCard, isFront = true, layout?: DetachedCardLayoutControls) => {
    const cardScore = scoreCard(visibleCard, tags);
    const waitMinutes = cardScore.waiting === 99 ? "99+" : cardScore.waiting;
    const workspace = workspaceOf(visibleCard);
    const hostLabel = hostLabelOf(workspace);
    const hostWithHarness = cardHostLabel(visibleCard, workspace);
    const workspaceLabel = workspace?.name || displayProject(visibleCard);
    const remoteHost = remoteHostOf(workspace);
    const remoteAddress = remoteHost ? `${remoteHost.user ? `${remoteHost.user}@` : ""}${remoteHost.hostname}${remoteHost.port && remoteHost.port !== 22 ? `:${remoteHost.port}` : ""}` : hostLabel;
    const showScore = !!(visibleCard.session || visibleCard.harness) && queue?.sortMode === "score" && visibleCard.phase === "attention";
    const showHeaderMeta = showScore || visibleCard.phase !== "attention" || hasUrgentCall(visibleCard) || !(visibleCard.session || visibleCard.harness);
    return (
    <article key={visibleCard.id} aria-hidden={!isFront} inert={!isFront} className="cq-large-card cq-continuous-card" data-transfer-id={visibleCard.id} data-transfer-zone="attention" data-card-id={visibleCard.id} data-phase={visibleCard.phase} data-working-view={visibleCard.phase === "working"} data-urgent-call={hasUrgentCall(visibleCard)}>
              <div className="cq-card-header">{layout?.leftToggle}<div className="cq-card-identity">{showHeaderMeta && <div className="cq-card-meta">{visibleCard.phase !== "attention" && <div className="cq-card-state"><i className={visibleCard.phase === "working" ? "cq-dot" : "cq-ready-dot"} />{visibleCard.phase === "draft" ? t("queue.新的思路") : t("queue.WORKING")}</div>}{hasUrgentCall(visibleCard) && <span className="cq-urgent-label" title={t("queue.urgentPriority")}>🚨 Urgent Call</span>}{!(visibleCard.session || visibleCard.harness) && <PriorityBadge weight={visibleCard.priorityWeight ?? 0} enabled={isFront} onSave={weight => run("priority_weight", {id:visibleCard.id,weight})} />}{showScore && <div className="cq-score-row">
                <span className="cq-score"><span aria-hidden="true">🧮</span> {t("queue.Score")} {hasUrgentCall(visibleCard) ? "∞" : cardScore.total}</span>
                <span className="cq-score-formula" tabIndex={0}>
                  <span className="cq-score-operator">=</span>
                  <PriorityBadge weight={visibleCard.priorityWeight ?? 0} enabled={isFront} onSave={weight => run("priority_weight", {id:visibleCard.id,weight})} />
                  <span className="cq-score-term"><span className="cq-score-operator">+</span><ScoreChipTooltip text={t("queue.等待分钟", { minutes: waitMinutes })}><span className="cq-score-chip cq-score-wait"><span aria-hidden="true">⏳</span> {t("queue.Wait")} <b>{cardScore.waiting}</b></span></ScoreChipTooltip></span>
                  {cardScore.tags.map(tag => <span className="cq-score-term" key={tag.name}><span className="cq-score-operator">+</span><ScoreChipTooltip text={tag.description}><span className="cq-score-chip" style={tagColor(tag.name)}>{tag.name} <b>{tag.weight}</b></span></ScoreChipTooltip></span>)}
                </span>
              </div>}<div className="cq-meta-harness" /></div>}<div className="cq-card-title-row"><div className="cq-title-primary"><h2>{titleOf(visibleCard)}</h2>{workspace?.kind === "ssh" ? <ScoreChipTooltip text={<div className="cq-environment-tooltip"><span><WorkspaceMachineIcon name="remote" size={14} />{hostLabel}</span><small>{remoteAddress}</small></div>}><span className="cq-title-environment cq-title-host" aria-label={hostWithHarness}><WorkspaceMachineIcon name="remote" size={15} /><b title={hostWithHarness}>{hostWithHarness}</b></span></ScoreChipTooltip> : <span className="cq-title-environment cq-title-host" aria-label={hostWithHarness}><WorkspaceMachineIcon name="local" size={15} /><b title={hostWithHarness}>{hostWithHarness}</b></span>}<ScoreChipTooltip text={<div className="cq-environment-tooltip"><span><WorkspaceMachineIcon name="folder" size={14} />{workspaceLabel}</span><small>{workspace?.cwd || visibleCard.cwd}</small></div>}><span className="cq-title-environment cq-title-workspace" aria-label={workspaceLabel}><WorkspaceMachineIcon name="folder" size={15} /><b>{workspaceLabel}</b></span></ScoreChipTooltip></div><div className="cq-title-controls"><div className="cq-title-harness" /><div className="cq-title-branches" /><div className="cq-title-tools" /></div></div></div>
                <div className="cq-card-actions">
                  {!detachedId && <>
                    {!inspecting && <button className="cq-action-defer" onClick={() => requestShift(visibleCard)} disabled={!(visibleCard.session || visibleCard.harness) || (queue?.sortMode !== "score" && ready.at(-1)?.id === visibleCard.id)} aria-label={queue?.sortMode === "score" ? t("queue.清零等待分") : t("queue.稍后")}><Icon name="down" />{queue?.sortMode === "score" && <small>−{cardScore.waiting}</small>}<span className="cq-action-tooltip" role="tooltip">{queue?.sortMode === "score" ? t("queue.扣除当前 Wait，重新计时") : t("queue.稍后")}</span></button>}
                    {(!!visibleCard.session || !!visibleCard.harness) && <button className="cq-action-popout" onClick={popout} aria-label={t("queue.移出")}><Icon name="maximize" /><span className="cq-action-tooltip" role="tooltip">{t("queue.移出")}</span></button>}
                    {(visibleCard.harness ? visibleCard.archivedAt === undefined : !inspecting && visibleCard.phase !== "working") && <button className="cq-action-archive" aria-label={(visibleCard.session || visibleCard.harness) ? t("queue.归档") : t("queue.关闭空白卡片")} onClick={async () => {
                      if (visibleCard.session || visibleCard.harness) {
                      if (busy) return;
                      if (!skipArchiveConfirmation) { setSkipArchiveChecked(false); setArchiveConfirm(visibleCard); return; }
                      setBusy(true);
                      const result = await run("archive", { id: visibleCard.id });
                      setBusy(false);
                      if (result) finishCard(visibleCard.id);
                      return;
                    } const result = await run("remove", { id: visibleCard.id }); if (result) setInspecting(null); }}><Icon name={(visibleCard.session || visibleCard.harness) ? "archive" : "close"} /><span className="cq-action-tooltip" role="tooltip">{(visibleCard.session || visibleCard.harness) ? t("queue.归档") : t("queue.关闭空白卡片")}</span></button>}
                  </>}
                  {detachedId && <button className="cq-action-archive" aria-label={t("queue.Attach")} onClick={() => returnToQueue()}><Icon name="undo" /><span className="cq-action-tooltip" role="tooltip">{t("queue.Attach")}</span></button>}
                </div>
                {layout?.rightToggle}
              </div>
              <HarnessCard key={`${visibleCard.id}:${visibleCard.workspaceId}`} card={visibleCard} active={isFront} onAction={async (action, data) => {
                const result = await act(action, data);
                if (result && action === "harness_start") {
                  setInspecting(null); setFocus({ id: visibleCard.id, index: 0 }); setDeckReset(key => key + 1);
                }
                if (result && action === "harness_close") finishCard(visibleCard.id);
                return !!result;
              }}>
              <SessionCard onOpenModelSettings={() => { setSettingsSection("models"); setSettings(true); }} audio={audio} key={`${visibleCard.id}:${visibleCard.workspaceId}:${sessionRefreshKey}`} card={visibleCard} onCreated={onCreated} onSubmitted={onSubmitted} onRejected={onRejected} onWorking={onWorking} onRefresh={refresh} onAdopt={onAdopt} onFork={onFork} onFile={layout?.openFile ?? setFile} modelsRefreshKey={modelsRefreshKey} quoteSelectionEnabled={quoteSelectionEnabled} detachedTools={layout ? { toggleTools: layout.toggleTools, toolsOpen: layout.toolsOpen, toolsPanelTarget: layout.toolsPanelTarget } : undefined} />
              </HarnessCard>
            </article>
    );
  };

  const renderCard = (card: QueueCard, isFront = true) => detachedId ? (
    <DetachedCardTools key={`${card.id}:${card.workspaceId}`} cwd={card.cwd} sessionId={card.session?.id ?? card.id} remote={workspaceOf(card)?.kind === "ssh"} onSettings={(section) => { setSettingsSection(section); setSettings(true); }}>
      {layout => renderCardContent(card, isFront, layout)}
    </DetachedCardTools>
  ) : renderCardContent(card, isFront);

  return <div className={`cq-shell ${detachedId ? "cq-detached" : ""}`} onPointerDownCapture={() => unlockAudio()} onKeyDownCapture={() => unlockAudio()}>
    {notifications.status && <div className="cq-notification-alert" role="alert" aria-live="assertive">
      <span>{notifications.status}</span>
      {notifications.canOpenSystemSettings && <button type="button" onClick={() => void notifications.openSystemSettings()}>{t("settings.openNotificationSettings")}</button>}
      <button type="button" className="cq-notification-alert-close" aria-label={t("queue.关闭")} onClick={notifications.dismissStatus}>×</button>
    </div>}
    {!notifications.status && queueToast && <div className="cq-queue-toast" role="status" aria-live="polite">
      <span>{queueToast}</span>
      <button type="button" aria-label={t("queue.关闭")} onClick={() => setQueueToast("")}>×</button>
    </div>}
    {urgentCard?.urgentCall && <UrgentCallDialog key={cardTurnKey(urgentCard)} title={titleOf(urgentCard)} details={urgentCard.urgentCall}
      onDismiss={dismissUrgent} onRead={() => {
        dismissUrgent();
        setSettings(false); setHistory(null); setFile(null); setCreating(false); setAddingWorkspace(false);
        setArchiveConfirm(null); setDeferConfirm(null);
        if (!detachedId) {
          const index = ready.findIndex((card) => card.id === urgentCard.id);
          if (index >= 0) { setInspecting(null); setFocus({ id: urgentCard.id, index }); setDeckReset((key) => key + 1); }
          else setInspecting(urgentCard.id);
        }
      }} />}
    <CardTransfers
      order={ready.map((card) => card.id)}
      locations={detachedId ? {} : Object.fromEntries(cards.filter((card) => !card.detached && card.archivedAt === undefined).map((card) => [card.id, card.phase === "working" && inspecting !== card.id ? "working" : "attention"]))}
      attentionMode={attentionMode}
      focusedId={focus?.id ?? active?.id}
    >
    <div className="cq-layout" inert={!!inspected && !detachedId}>
      {!detachedId && <aside className="cq-sidebar">
        <div className="cq-sidebar-brand"><Link className="cq-brand" href="/" aria-label={t("queue.Card Queue 主页")}><span className="cq-logo"><Icon name="stack" size={21} /></span>TopCard</Link><button className="cq-notifications" onClick={() => void notifications.toggle()} aria-pressed={notifications.enabled} aria-label={notifications.enabled ? "系统完成通知：已开启" : "开启系统完成通知"} title={notifications.enabled ? "系统完成通知已开启，点击关闭" : "开启系统完成通知"}><Icon name={notifications.enabled ? "bell-filled" : "bell"} size={16} /></button><button onClick={() => { setSettingsSection(getLastSettingsSection(active?.cwd || defaultCwd || null)); setSettings(true); }} aria-label={t("common.settings")}><Icon name="settings" size={16} /></button></div>
        <button className="cq-new" onClick={showNew}><Icon name="plus" /> {t("queue.新会话")}</button>
        <button className="cq-mobile-settings" onClick={() => { setSettingsSection(getLastSettingsSection(active?.cwd || defaultCwd || null)); setSettings(true); }} aria-label={t("common.settings")}><Icon name="settings" /></button>

        <button className="cq-notifications cq-mobile-notifications" onClick={() => void notifications.toggle()} aria-pressed={notifications.enabled} aria-label={notifications.enabled ? "系统完成通知：已开启" : "开启系统完成通知"} title={notifications.enabled ? "系统完成通知已开启，点击关闭" : "开启系统完成通知"}><Icon name={notifications.enabled ? "bell-filled" : "bell"} size={16} /></button>
        <div className="cq-section-label"><span>{t("queue.WORKING")}</span><span>{working.length.toString().padStart(2, "0")}</span></div>
        <div className="cq-working-list">
          {working.map((card, index) => <button key={card.id} data-transfer-id={card.id} data-transfer-zone="working" className={`cq-small-card ${inspecting === card.id ? "is-selected" : ""}`} disabled={!card.session && !card.harness} onClick={() => setInspecting(card.id)}>
            <span className="cq-small-meta"><span className="cq-dot" />{displayProject(card)}<span className="cq-index">{String(index + 1).padStart(2, "0")}</span></span>
            <strong>{titleOf(card)}</strong><span className="cq-working-bottom"><span className="cq-bars"><i /><i /><i /><i /></span>{t("queue.正在工作")}<span>↗</span></span>
          </button>)}
          {!working.length && <div className="cq-quiet"><span className="cq-quiet-mark">∿</span><p>{t("queue.后台暂时很安静")}</p><span>{t("queue.回复后的卡片会来到这里，")}<br />{t("queue.让 Agent 继续工作。")}</span></div>}
        </div>
        {!!detached.length && <><div className="cq-section-label"><span>{t("queue.独立标签页")}</span><span>{detached.length}</span></div><div className="cq-detached-list">{detached.map((card) => <button key={card.id} onClick={() => openDetachedCardTab(card.id)}><Icon name="out" size={14} /><span>{titleOf(card)}</span><i className={card.phase === "working" ? "cq-dot" : "cq-ready-dot"} /></button>)}</div></>}
        <div className="cq-sidebar-bottom"><button onClick={openHistory}><Icon name="history" />{t("queue.历史对话")}<span>↗</span></button></div>
      </aside>}
      <div className="cq-content">
        {!detachedId && <div className="cq-content-toolbar">
          <div className="cq-toolbar-menu">
            <button type="button" className="cq-toolbar-trigger" aria-haspopup="menu" aria-label={t("settings.appearance")} title={t("settings.appearance")}><ThemeIcon preference={preference} size={16} /></button>
            <div className="cq-toolbar-popover" role="menu" aria-label={t("settings.appearance")}>
              {THEME_OPTIONS.map((option) => <button key={option.id} type="button" role="menuitemradio" aria-checked={preference === option.id} onClick={(event) => { setThemePreference(option.id); event.currentTarget.blur(); }}><ThemeIcon preference={option.id} size={15} /><span>{t(option.label)}</span></button>)}
            </div>
          </div>
          <div className="cq-toolbar-menu">
            <button type="button" className="cq-toolbar-trigger" aria-haspopup="menu" aria-label={t("common.language")} title={t("common.language")}><LanguageIcon /></button>
            <div className="cq-toolbar-popover cq-language-popover" role="menu" aria-label={t("common.language")}>
              {supportedLocales.map((plugin) => <button key={plugin.id} type="button" role="menuitemradio" aria-checked={locale === plugin.id} onClick={(event) => { setLocale(plugin.id as typeof locale); event.currentTarget.blur(); }}><span>{plugin.label}</span><small>{plugin.id}</small></button>)}
            </div>
          </div>
          <div className="cq-toolbar-menu">
            <button type="button" className="cq-insertion-position" disabled={!queue} aria-haspopup="menu" aria-label={t("queue.切换队列排序")} title={t("queue.切换队列排序")}>{queue?.sortMode === "score" ? "⇅" : "→"} <span className="cq-sort-label">{queue?.sortMode === "score" ? t("queue.评分排序") : t("queue.先进先出")}</span></button>
            <div className="cq-toolbar-popover cq-sort-popover" role="menu" aria-label={t("queue.切换队列排序")}>
              <button type="button" role="menuitemradio" aria-checked={queue?.sortMode === "score"} disabled={busy || !queue} onClick={(event) => { void chooseSortMode("score"); event.currentTarget.blur(); }}><span>⇅</span><span>{t("queue.评分排序")}</span></button>
              <button type="button" role="menuitemradio" aria-checked={queue?.sortMode === "fifo"} disabled={busy || !queue} onClick={(event) => { void chooseSortMode("fifo"); event.currentTarget.blur(); }}><span>→</span><span>{t("queue.先进先出")}</span></button>
            </div>
          </div>
          <div className="cq-toolbar-menu">
            <button type="button" className="cq-insertion-position cq-attention-mode" aria-haspopup="menu" aria-label={t("queue.切换工作模式")} title={t("queue.切换工作模式")}>{attentionOption.icon} <span className="cq-mode-label">{t(attentionOption.label)}</span></button>
            <div className="cq-toolbar-popover cq-mode-popover" role="menu" aria-label={t("queue.切换工作模式")}>
              {ATTENTION_MODES.map((option) => (
                <button key={option.id} type="button" role="menuitemradio" aria-checked={attentionMode === option.id} onClick={(event) => { chooseAttentionMode(option.id); event.currentTarget.blur(); }}><span>{option.icon}</span><span>{t(option.label)}</span></button>
              ))}
            </div>
          </div>
        </div>}
      {!detachedId && cardSearchItems.length > 0 && <CardQuickSearch items={cardSearchItems} onOpen={(item) => {
        if (item.location === "detached") {
          openDetachedCardTab(item.id);
          return;
        }
        if (item.location === "working") {
          setInspecting(item.id);
          return;
        }
        const index = ready.findIndex((card) => card.id === item.id);
        if (index >= 0) selectQueueCard(index);
      }} />}
      {arrivalNotice && <QueueArrivalPreview notice={arrivalNotice} onOpen={(cardId) => {
        setArrivalNotices((current) => current.slice(1));
        focusNotificationCard(cardId);
      }} />}
      <main className="cq-main">
        {(error || connectionError) && <div className="cq-error" role="alert">{error || connectionError}<button onClick={() => { setError(""); void refresh(); }}>{t("queue.重试")}</button></div>}
        {claimError && <div className="cq-error" role="alert">{claimError}<Link href="/">{t("queue.返回主页面")}</Link></div>}
        <div className="cq-stage" ref={stageRef}>
          {!queue ? <div className="cq-empty"><span className="cq-orbit"><Icon name="stack" size={34} /></span><h2>{error || t("queue.正在连接你的 Pi…")}</h2></div> : active && canShowDetached ? <>
            {detachedId
              ? <div className="cq-static-card cq-single-mode-card">{renderCard(active)}</div>
              : <>
                  <CardDeck cards={ready} navigationRef={deckNavigationRef} focusedIndex={deckIndex} resetKey={deckReset} suspended={!!inspected} onIndexChange={(index) => { if (ready[index]) setFocus({id: ready[index].id, index}); }} renderCard={renderCard} />
                </>}
          </> : <div className="cq-empty">
            <span className="cq-orbit"><Icon name="stack" size={34} /></span>
            <h2>{detachedId ? t("queue.正在接入会话") : working.length ? t("queue.把工作交给它们。") : t("queue.创建卡片，让 Agent 开始工作。")}</h2>
            <p>{working.length ? t("queue.需要你的时候，卡片会自动来到这里。") : t("queue.完成后，卡片会经调度队列回到你面前；你只需依次处理顶层卡片。")}</p>
            {!detachedId && <button className="cq-primary" onClick={showNew}><Icon name="plus" size={16} /> {t("queue.新建第一张卡片")}</button>}
          </div>}
        </div>

        {!detachedId && <CardQueueMinimap
          cards={ready.map((card) => {
            const workspace = workspaceOf(card);
            return {
              id: card.id,
              sessionId: card.session?.id,
              title: titleOf(card),
              excerpt: card.session?.firstMessage === "(no messages)" ? undefined : card.session?.firstMessage,
              host: cardHostLabel(card, workspace),
              workspace: displayProject(card),
              remote: workspace?.kind === "ssh",
            };
          })}
          activeIndex={inspecting ? -1 : deckIndex}
          label={t("queue.卡片队列导航")}
          itemLabel={(index, title) => t("queue.卡片位置", { current: index + 1, total: ready.length, title })}
          onSelect={selectQueueCard}
        />}

      </main>
      </div>
    </div>
    {inspected && !detachedId && <CardInspectionOverlay anchor={stageRef} onClose={() => setInspecting(null)}>{renderCard(inspected)}</CardInspectionOverlay>}
    </CardTransfers>
    {creating && <WorkspacePicker workspaces={workspaces} remoteHosts={remoteHosts} busy={busy} onClose={() => setCreating(false)} onAddWorkspace={(machine) => { setCreating(false); setError(""); setWorkspaceThenCreate(true); setWorkspaceFormEntry(machine); setAddingWorkspace(true); }} onManageHosts={() => { setCreating(false); setSettingsSection("remote-hosts"); setSettings(true); }} onUpdate={async (workspaceId, value) => {
      setBusy(true); const result = await run("workspace_update", { workspaceId, ...value }); setBusy(false); return !!result;
    }} onRemove={async (workspaceId) => {
      setBusy(true); const result = await run("workspace_remove", { workspaceId }); setBusy(false); return !!result;
    }} onSelect={async (workspaceId) => {
      setBusy(true); const result = await run("create", { workspaceId }); setBusy(false);
      if (result) { setCreating(false); setInspecting(result.cards.find(card => !card.session && !card.harness)?.id ?? null); }
    }} />}
    {addingWorkspace && <WorkspaceForm key={typeof workspaceFormEntry === "string" ? workspaceFormEntry : workspaceFormEntry.id} entry={workspaceFormEntry} defaultCwd={defaultCwd} busy={busy} error={error} onClose={() => setAddingWorkspace(false)} onBack={() => { setAddingWorkspace(false); setCreating(true); }} onSave={async (value) => {
      setBusy(true); const result = await run("workspace_create", { ...value, createCard: workspaceThenCreate }); setBusy(false);
      if (result) {
        setAddingWorkspace(false);
        setWorkspaceThenCreate(false);
        if (workspaceThenCreate) setInspecting(result.cards.find(card => !card.session && !card.harness)?.id ?? null);
      }
    }} />}
    {deferConfirm && <div className="cq-overlay" onClick={() => !busy && setDeferConfirm(null)}><section className="cq-dialog cq-defer-confirm" role="dialog" aria-modal="true" aria-label={queue?.sortMode === "score" ? t("queue.确认清零等待分") : t("queue.确认沉底")} onClick={(event) => event.stopPropagation()}><div className="cq-dialog-heading"><Icon name="down" /><button aria-label={t("queue.关闭")} disabled={busy} onClick={() => setDeferConfirm(null)}><Icon name="close" /></button></div><h2>{queue?.sortMode === "score" ? t("queue.确认清零等待分") : t("queue.确认沉底")}</h2><p>{queue?.sortMode === "score" ? t("queue.Wait 将从零重新累计。") : t("queue.这张卡片将移到队列底部。")}</p><div className="cq-confirm-actions"><button disabled={busy} onClick={() => setDeferConfirm(null)}>{t("queue.取消")}</button><button className="cq-primary cq-defer-confirm-button" disabled={busy} onClick={async () => { setBusy(true); const result = await shift(deferConfirm); setBusy(false); if (result) setDeferConfirm(null); }}>{queue?.sortMode === "score" ? t("queue.清零等待分") : t("queue.沉底")}</button></div></section></div>}
    {archiveConfirm && <div className="cq-overlay" onClick={() => !busy && setArchiveConfirm(null)}><section className="cq-dialog cq-archive-confirm" role="dialog" aria-modal="true" aria-label={t("queue.确认归档")} onClick={(event) => event.stopPropagation()}><div className="cq-dialog-heading"><Icon name="archive" /><button aria-label={t("queue.关闭")} disabled={busy} onClick={() => setArchiveConfirm(null)}><Icon name="close" /></button></div><h2>{t("queue.确认归档")}</h2><p>{t("queue.归档后会话将移到历史对话，之后仍可重新打开。")}</p><label className="cq-archive-skip"><input type="checkbox" checked={skipArchiveChecked} disabled={busy} onChange={event => setSkipArchiveChecked(event.target.checked)} /><span>{t("queue.skipArchiveThisPage")}<small>{t("queue.skipArchiveThisPageHint")}</small></span></label><div className="cq-confirm-actions"><button disabled={busy} onClick={() => setArchiveConfirm(null)}>{t("queue.取消")}</button><button className="cq-primary cq-danger" disabled={busy} onClick={async () => { setBusy(true); const result = await run("archive", { id: archiveConfirm.id }); setBusy(false); if (result) { if (skipArchiveChecked) setSkipArchiveConfirmation(true); advanceToNextCard(archiveConfirm.id); setArchiveConfirm(null); } }}>{t("queue.归档")}</button></div></section></div>}
    {history && <div className="cq-overlay" onClick={() => setHistory(null)}><section className="cq-dialog cq-history" role="dialog" aria-modal="true" aria-label={t("queue.历史对话")} onClick={(event) => event.stopPropagation()}><div className="cq-dialog-heading"><Icon name="history" /><button aria-label={t("queue.关闭")} onClick={() => setHistory(null)}><Icon name="close" /></button></div><h2>{t("queue.历史对话")}</h2><p>{t("queue.已收起的卡片和未在当前队列中的会话，点击即可继续。")}</p><input aria-label="搜索会话" placeholder={t("queue.搜索会话或项目…")} value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} /><div className="cq-history-list">{archived.filter(card => card.harness && `${titleOf(card)} ${card.cwd}`.toLowerCase().includes(historySearch.toLowerCase())).map(card => <button key={card.id} onClick={() => { setHistory(null); setInspecting(card.id); }}><span>{harnessName(card.harness!.kind)} · {titleOf(card)}</span><small>{projectOf(card.cwd)} · {new Date(card.archivedAt!).toLocaleDateString()}</small></button>)}{visibleHistory.map((session) => <button key={session.id} onClick={() => onAdopt(session.id)}><span>Pi · {session.name || session.firstMessage || t("queue.未命名会话")}</span><small>{projectOf(session.cwd)} · {new Date(session.modified).toLocaleDateString()}</small></button>)}{!visibleHistory.length && <p>{historySearch ? t("queue.没有匹配的历史对话。") : t("queue.暂无未在队列中的历史对话。")}</p>}</div></section></div>}
    {settings && <SettingsPanel cwd={active?.cwd || defaultCwd || null} sessionId={active?.session?.id || null} initialSection={settingsSection} onClose={() => { setSettings(false); setModelsRefreshKey((key) => key + 1); void refreshRemoteHosts(); }} onSessionReloaded={() => { setSessionRefreshKey((key) => key + 1); void refresh(); }} quoteSelectionEnabled={quoteSelectionEnabled} onQuoteSelectionChange={setQuoteSelectionEnabled} />}
    {file && <div className="cq-overlay" onClick={() => setFile(null)}><section className="cq-file-panel" onClick={(event) => event.stopPropagation()}><div className="cq-dialog-heading"><span>{file}</span><button aria-label={t("queue.关闭文件预览")} onClick={() => setFile(null)}><Icon name="close" /></button></div><FileViewer filePath={file} cwd={active?.cwd} sourceSessionId={active?.session?.id} onOpenFile={setFile} /></section></div>}
  </div>;
}
