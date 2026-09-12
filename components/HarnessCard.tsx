"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createShellProbe } from "@/lib/harness/shell-probe";
import { harnessCatalog } from "@/lib/harness/catalog";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { ProviderIcon } from "./ProviderIcon";
import { TerminalPanel, type TerminalConnectionStatus } from "./TerminalPanel";
import type { QueueCard } from "@/lib/card-queue";


export function HarnessCard({ card, active, children, onAction }: {
  card: QueueCard; active: boolean; children: ReactNode;
  onAction: (action: string, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const labels = { starting:t("harness.starting"), working:t("harness.working"), attention:t("harness.waiting"), unknown:t("harness.unknown"), exited:t("harness.processNotStarted"), error:t("harness.disconnected") };
  const anchor = useRef<HTMLSpanElement>(null);
  const [switchPosition, setSwitchPosition] = useState<{ left: number; top: number } | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [mode, setMode] = useState<"pi" | "cli">("pi");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [terminalStatus, setTerminalStatus] = useState<TerminalConnectionStatus>("connecting");
  const [connection, setConnection] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const harness = card.harness;
  const [canBackground, setCanBackground] = useState(false);
  const shellTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shellProbe = useRef<ReturnType<typeof createShellProbe> | null>(null);
  if (!shellProbe.current) shellProbe.current = createShellProbe(running => {
    clearTimeout(shellTimer.current);
    setCanBackground(false);
    if (running) shellTimer.current = setTimeout(() => setCanBackground(true), 300);
  });
  useEffect(() => {
    if (harness?.kind !== "shell" || harness.shellCommandNotifications === false) return;
    clearTimeout(shellTimer.current);
    setCanBackground(false);
    if (harness.shellCommandRunning) shellTimer.current = setTimeout(() => setCanBackground(true), Math.max(0, 300 - (Date.now() - (harness.shellCommandStartedAt ?? Date.now()))));
    return () => clearTimeout(shellTimer.current);
  }, [harness?.kind, harness?.shellCommandNotifications, harness?.shellCommandStartedAt, harness?.shellCommandRunning]);
  const ended = !!harness && (["exited", "error"].includes(harness.state) || terminalStatus === "exited");
  const disconnected = !!harness && (ended || terminalStatus === "error" || terminalStatus === "connecting");
  useEffect(() => { setShowTranscript(false); }, [disconnected, harness?.terminalId]);
  const fresh = !card.session && !harness;
  const probeDetail = harness?.kind === "shell" ? (harness.shellCommandNotifications === false ? t("harness.plainShell") : t("harness.shellHint")) : harness?.probe === "title-only" ? t("harness.titleProbe")
    : harness?.probe === "unconfirmed" ? t("harness.noSignal")
    : t("harness.hookSeen");
  useLayoutEffect(() => {
    setTarget(anchor.current?.closest("article")?.querySelector(fresh ? ".cq-meta-harness" : ".cq-title-harness") ?? null);
  }, [fresh]);
  useLayoutEffect(() => {
    if (!fresh || !active) return;
    const article = anchor.current?.closest("article");
    if (!article) return;
    const update = () => {
      const rect = article.getBoundingClientRect();
      setSwitchPosition({ left: Math.max(8, rect.left - 82), top: Math.max(12, rect.top + rect.height / 2) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(article);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [fresh, active]);
  const act = async (action: string, data: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try { await onAction(action, { id: card.id, ...data }); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const controls = fresh ? <div className="cq-harness-switch" aria-label={t("harness.sessionType")}>
    <button type="button" aria-pressed={mode === "pi"} disabled={busy} onClick={() => setMode("pi")}><span aria-hidden="true">π</span> Pi</button>
    <button type="button" aria-pressed={mode === "cli"} disabled={busy} onClick={() => setMode("cli")}><span aria-hidden="true">›_</span> CLI</button>

  </div> : harness ? <div className="cq-harness-controls">
    {harness.kind === "shell" && harness.shellCommandNotifications !== false && canBackground && !harness.shellNotify && !["error", "exited"].includes(harness.state) && <button type="button" disabled={busy} onClick={() => void act("shell_background")} title={t("harness.backgroundHint")}>↓ {t("harness.background")}</button>}
    {!disconnected && harness.state !== "attention" && <span className="cq-harness-state" data-state={harness.state} title={probeDetail}>{labels[harness.state]}</span>}

  </div> : null;
  return <>
    <span ref={anchor} hidden />
    {actionError && !disconnected && <div className="cq-harness-error-toast" role="alert"><span>{actionError}</span><button type="button" aria-label={t("harness.closeError")} onClick={() => setActionError("")}>×</button></div>}
    {fresh ? active && switchPosition && createPortal(<div className="cq-harness-floating" style={switchPosition}>{controls}</div>, document.body) : target && controls && createPortal(controls, target)}
    {harness ? <div className="cq-harness-body" data-harness={harness.kind} data-disconnected={disconnected && !showTranscript ? "true" : undefined}>
      {disconnected && !showTranscript && <div className="cq-terminal-recovery" role="status">
        <div className="cq-terminal-recovery-content">
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/></svg>
          <h3>{ended ? t(harness.kind === "shell" ? "harness.shellNotStarted" : "harness.processNotStarted") : terminalStatus === "connecting" ? t("harness.connecting") : t("harness.disconnected")}</h3>
          <p>{ended ? t("harness.recordsKept") : t("harness.reconnectHint")}</p>
          {actionError && <p role="alert">{actionError}</p>}
          <button type="button" className="cq-terminal-recovery-primary" disabled={busy} onClick={() => {
            if (ended) void act(harness.providerSessionId ? "harness_resume" : "harness_reopen");
            else { setTerminalStatus("connecting"); setConnection(key => key + 1); }
          }}>{busy ? t("harness.opening") : ended ? harness.providerSessionId ? t("harness.resume") : t("harness.startProcess") : t("harness.reconnect")}</button>
          <button type="button" onClick={() => setShowTranscript(true)}>{t("harness.viewOutput")}</button>
        </div>
      </div>}
      {disconnected && showTranscript && <button type="button" className="cq-terminal-recovery-return" onClick={() => setShowTranscript(false)}>{t("harness.backToConnection")}</button>}
      <TerminalPanel key={`${harness.terminalId}:${connection}`} embedded themeProfile={harness.kind === "grok" ? "grok" : undefined} readOnly={card.archivedAt !== undefined || harness.state === "exited" || harness.state === "error"} tab={{ id: harness.terminalId, cwd: card.cwd, restored: true }} active={active}
        onOutput={harness.kind === "shell" && harness.shellCommandNotifications !== false ? data => shellProbe.current?.(data) : undefined} onStatusChange={setTerminalStatus} onRestart={() => void act(harness.providerSessionId ? "harness_resume" : "harness_reopen")} onClosed={() => {}} onCloseError={() => {}} />
    </div> : mode === "cli" ? <div className="cq-harness-empty"><div className="cq-harness-picker"><h3>{t("harness.choose")}</h3><p>{t("harness.chooseHint")}</p><div className="cq-harness-options">
      {harnessCatalog.map(item => <button key={item.id} type="button" className="cq-harness-option" disabled={busy} onClick={() => void act("harness_start", { kind: item.id })}>
        <span className="cq-harness-option-icon" aria-hidden="true">{item.id === "shell" ? <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/></svg> : item.id === "pi" ? <span className="cq-harness-pi-mark">π</span> : <ProviderIcon id={({ codex: "openai", claude: "anthropic", gemini: "google", antigravity: "google" } as Record<string, string>)[item.id] ?? item.id} size={28} />}</span>
        <span><strong>{item.name}</strong><small>{busy ? t("harness.checking") : item.id === "shell" ? t("harness.shellDescription") : item.description}</small></span><span className="cq-harness-option-arrow" aria-hidden="true">↗</span>
      </button>)}
    </div></div></div> : children}
  </>;
}
