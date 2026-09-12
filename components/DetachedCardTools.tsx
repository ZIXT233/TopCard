"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, RIGHT_PANEL_FALLBACK_WIDTH, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH, getDefaultRightPanelWidth, getSidebarMaxWidth, getRightPanelMaxWidth } from "@/lib/panel-layout";
import { FileExplorer } from "./FileExplorer";
import { FileViewer } from "./FileViewer";
import { TerminalPanel } from "./TerminalPanel";
import { newTerminalTab, restoreTerminalTabs, type TerminalTab } from "./terminal-tab-state";
import type { SettingsSection } from "@/lib/settings-navigation";
import { useI18n } from "@/hooks/useI18n";

export interface DetachedCardLayoutControls {
  leftToggle: ReactNode;
  rightToggle: ReactNode;
  openFile: (path: string) => void;
  toggleTools: () => void;
  toolsOpen: boolean;
  toolsPanelTarget: HTMLElement | null;
}

export function DetachedCardTools({ children, cwd, sessionId, remote, onSettings }: {
  children: (controls: DetachedCardLayoutControls) => ReactNode;
  cwd: string;
  sessionId: string;
  remote: boolean;
  onSettings: (section: SettingsSection) => void;
}) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<"files" | "changes" | null>("files");
  const [rightPanel, setRightPanel] = useState<"file" | "terminal" | "tools" | null>(null);
  const [toolsPanelTarget, setToolsPanelTarget] = useState<HTMLDivElement | null>(null);
  const [file, setFile] = useState<{ path: string; mode?: "diff" } | null>(null);
  const [terminal, setTerminal] = useState<TerminalTab | null>(null);
  const [restored, setRestored] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const isMobile = useIsMobile();
  const lastRightPanel = useRef<"file" | "terminal" | "tools">("file");
  useEffect(() => { if (isMobile) setLeftOpen(false); }, [isMobile]);
  const leftWidth = useRef(SIDEBAR_DEFAULT_WIDTH);
  const rightWidth = useRef(RIGHT_PANEL_FALLBACK_WIDTH);
  const leftMax = useCallback(() => typeof window === "undefined" ? SIDEBAR_MAX_WIDTH : getSidebarMaxWidth({ viewportWidth: window.innerWidth, rightPanelOpen: !!rightPanel, rightPanelWidth: rightWidth.current }), [rightPanel]);
  const rightMax = useCallback(() => typeof window === "undefined" ? RIGHT_PANEL_MAX_WIDTH : getRightPanelMaxWidth({ viewportWidth: window.innerWidth, sidebarOpen: leftOpen, sidebarWidth: leftWidth.current }), [leftOpen]);
  const rightDefault = useCallback(() => typeof window === "undefined" ? RIGHT_PANEL_FALLBACK_WIDTH : getDefaultRightPanelWidth(window.innerWidth), []);
  // Reuse Pi Web's resize behavior and constraints, with queue-specific preferences.
  const leftResize = useResizablePanel({
    ariaLabel: t("layout.resizeSidebar"),
    cssVariable: "--sidebar-width",
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    getMaxWidth: leftMax,
    growthDirection: "right",
    maxWidth: SIDEBAR_MAX_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    storageKey: "topcard:sidebar-width",
    widthRef: leftWidth,
  });
  const rightResize = useResizablePanel({
    ariaLabel: t("layout.resizeFilePanel"),
    cssVariable: "--right-panel-width",
    defaultWidth: RIGHT_PANEL_FALLBACK_WIDTH,
    getDefaultWidth: rightDefault,
    getMaxWidth: rightMax,
    growthDirection: "left",
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    storageKey: "topcard:right-panel-width",
    widthRef: rightWidth,
  });
  useEffect(() => { if (rightPanel) lastRightPanel.current = rightPanel; }, [rightPanel]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [refreshDone, setRefreshDone] = useState(false);
  const refreshDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = `topcard:terminal:${sessionId}`;
  useEffect(() => {
    try {
      const saved = restoreTerminalTabs(sessionStorage.getItem(storageKey));
      setTerminal(saved.tabs.find((tab) => tab.cwd === cwd) ?? null);
    } catch { /* Storage can be unavailable. */ }
    setRestored(true);
  }, [storageKey, cwd]);
  useEffect(() => () => {
    if (refreshDoneTimer.current) clearTimeout(refreshDoneTimer.current);
  }, []);
  const refreshExplorer = () => {
    setRefresh(value => value + 1);
    setRefreshDone(true);
    if (refreshDoneTimer.current) clearTimeout(refreshDoneTimer.current);
    refreshDoneTimer.current = setTimeout(() => setRefreshDone(false), 2_000);
  };
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ tabs: terminal ? [terminal] : [] })); } catch { /* Keep the live terminal. */ }
  }, [terminal, restored, storageKey]);
  const openFile = (path: string, mode?: "diff") => {
    setFile({ path, mode });
    setRightPanel("file");
    if (isMobile) setLeftOpen(false);
  };
  const selectTerminal = () => {
    if (isMobile) setLeftOpen(false);
    setRightPanel(current => current === "terminal" ? null : "terminal");
    if (!remote && restored && !terminal) setTerminal(newTerminalTab(cwd));
  };
  const toggleTools = () => {
    setRightPanel(current => current === "tools" ? null : "tools");
    if (isMobile) setLeftOpen(false);
  };
  const leftToggle = <button className="cq-panel-toggle" title={t("queue.toggleLeftSidebar")} aria-label={t("queue.toggleLeftSidebar")} aria-controls="detached-explorer" aria-expanded={leftOpen} aria-pressed={leftOpen} onClick={() => { setLeftOpen(value => !value); if (isMobile) setRightPanel(null); }}><ToolIcon name="sidebarLeft" /></button>;
  const rightToggle = <button className="cq-panel-toggle" title={t("queue.toggleRightSidebar")} aria-label={t("queue.toggleRightSidebar")} aria-controls="detached-tools" aria-expanded={!!rightPanel} aria-pressed={!!rightPanel} onClick={() => { setRightPanel(current => current ? null : lastRightPanel.current); if (isMobile) setLeftOpen(false); }}><ToolIcon name="sidebarRight" /></button>;
  return <div className="cq-detached-layout">
    {isMobile && leftOpen && <div className="cq-drawer-backdrop" onClick={() => setLeftOpen(false)} />}
    <div ref={leftResize.panelRef} id="detached-explorer" hidden={!leftOpen} className={`cq-task-panel cq-task-left sidebar-container ${leftOpen ? "sidebar-open" : "sidebar-closed"}${leftResize.isResizing ? " sidebar-resizing" : ""}`} style={{ "--sidebar-width": `${leftResize.width}px` } as CSSProperties}>
      <div className="cq-explorer-heading">
        <div className="cq-explorer-label"><span>EXPLORER</span></div>
        <button title={t("terminal.title")} aria-label={t("terminal.title")} aria-pressed={rightPanel === "terminal"} disabled={!restored} onClick={selectTerminal}><ToolIcon name="terminal" /></button>
        <button title={t("queue.taskChanges")} aria-label={t("queue.taskChanges")} aria-pressed={panel === "changes"} onClick={() => setPanel(current => current === "changes" ? "files" : "changes")}><ToolIcon name="changes" /></button>
        <button title={t("sidebar.searchFiles")} aria-label={t("sidebar.searchFiles")} aria-pressed={searchOpen} onClick={() => { setPanel("files"); setSearchOpen(current => !current); }}><ToolIcon name="search" /></button>
        <button className={refreshDone ? "cq-explorer-refresh-done" : undefined} title={t("sidebar.refreshExplorer")} aria-label={t("sidebar.refreshExplorer")} onClick={refreshExplorer}>{refreshDone ? <ToolIcon name="check" /> : <ToolIcon name="refresh" />}</button>
      </div>
      <div className="cq-explorer-body" hidden={!panel}>
      {remote ? <p className="cq-task-unavailable">{t("queue.remoteToolsUnavailable")}</p> : <>
        <div className="cq-task-explorer"><FileExplorer key={cwd} cwd={cwd} changesCollapsed={panel !== "changes"} refreshKey={refresh} fileSearchOpen={searchOpen} onFileSearchOpenChange={setSearchOpen} onOpenFile={(path, _name, options) => openFile(path, options?.modeHint)} /></div>
      </>}
      </div>
      <footer className="cq-explorer-footer">
        <button onClick={() => onSettings("models")}><ToolIcon name="models" />{t("queue.taskModels")}</button>
        <button onClick={() => onSettings("skills")}><ToolIcon name="skills" />{t("queue.taskSkills")}</button>
        <button onClick={() => onSettings("general")}><ToolIcon name="settings" />{t("queue.taskSettings")}</button>
        <a title={t("queue.taskExport")} aria-label={t("queue.taskExport")} href={`/api/sessions/${encodeURIComponent(sessionId)}/export`} download><ToolIcon name="export" /></a>
      </footer>
    </div>
    {leftOpen && <div {...leftResize.separatorProps} aria-controls="detached-explorer" className={`panel-resize-handle sidebar-resize-handle${leftResize.isResizing ? " is-resizing" : ""}`} />}
    {children({ leftToggle, rightToggle, openFile, toggleTools, toolsOpen: rightPanel === "tools", toolsPanelTarget })}
    <div className={`right-panel-overlay-backdrop${rightPanel ? " is-open" : ""}`} onClick={() => setRightPanel(null)} />
    {rightPanel && <div {...rightResize.separatorProps} aria-controls="detached-tools" className={`panel-resize-handle right-panel-resize-handle${rightResize.isResizing ? " is-resizing" : ""}`} />}
    <div ref={rightResize.panelRef} id="detached-tools" hidden={!rightPanel} className={`cq-task-panel cq-task-right right-panel-container ${rightPanel ? "right-panel-open" : "right-panel-closed"}${rightResize.isResizing ? " right-panel-resizing" : ""}`} style={{ "--right-panel-width": `${rightResize.width}px` } as CSSProperties} aria-label={t("queue.taskTools")}>
      <div className="cq-task-panel-heading"><span>{rightPanel === "terminal" ? t("terminal.title") : rightPanel === "tools" ? t("queue.sessionTools") : file?.path.split("/").pop() ?? t("queue.taskFiles")}</span>{rightPanel === "terminal" && terminal && <button disabled={!!terminal.closing} onClick={() => setTerminal(current => current ? { ...current, closing: "close" } : null)}>{t("terminal.close")}</button>}<button onClick={() => setRightPanel(null)} aria-label={t("queue.关闭")}>×</button></div>
      <div ref={setToolsPanelTarget} className="cq-task-tools-definitions" hidden={rightPanel !== "tools"} />
      {rightPanel !== "tools" && (remote ? <p className="cq-task-unavailable">{t("queue.remoteToolsUnavailable")}</p> : <>
        {!file && rightPanel === "file" && <p className="cq-task-unavailable">{t("queue.selectFileHint")}</p>}
        {file && <div className="cq-task-viewer" hidden={rightPanel !== "file"}><FileViewer key={`${file.path}:${file.mode}`} filePath={file.path} cwd={cwd} sourceSessionId={sessionId} initialDisplayMode={file.mode} gitRefreshKey={refresh} onOpenFile={openFile} /></div>}
        {terminal && <div className="cq-task-terminal" hidden={rightPanel !== "terminal"}><TerminalPanel tab={terminal} active={rightPanel === "terminal"}
          onRestart={() => setTerminal(current => current ? { ...current, closing: "restart" } : null)}
          onClosed={() => {
            if (terminal.closing === "restart") setTerminal(newTerminalTab(cwd));
            else { setTerminal(null); setRightPanel(current => current === "terminal" ? null : current); }
          }}
          onCloseError={() => setTerminal(current => current ? { ...current, closing: undefined } : null)} /></div>}
      </>)}
    </div>
  </div>;
}

function ToolIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    sidebarLeft: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 3v18",
    sidebarRight: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM15 3v18",
    terminal: "m4 5 7 7-7 7M14 19h6", check: "m5 12 4 4L19 6",
    changes: "M3 12h6m6 0h6M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
    refresh: "M3 3v6h6M3 9a9 9 0 1 1 0 6",
    models: "M7 7h10v10H7zM9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4",
    skills: "m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5",
    settings: "M3 7h5m6 0h7M3 17h11m6 0h1M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0m6 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    export: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
  };
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
