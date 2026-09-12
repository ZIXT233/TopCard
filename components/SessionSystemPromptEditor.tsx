"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { sendAgentCommand } from "@/lib/agent-client";
import { useI18n } from "@/hooks/useI18n";
import { DEFAULT_PROMPT_SOURCES, type PromptSourcesConfig } from "@/lib/prompt-sources";
import type { QueueCard } from "@/lib/card-queue";
interface Sources {
  basePrompt?: string; baseSource?: string; appendPrompt?: string;
  contextFiles: { path: string; content: string }[];
  skills: { name: string; path: string; description: string; disabled?: boolean }[];
  tags?: { enabled: boolean; prompt: string };
  effectivePrompt?: string; legacyOverride?: boolean; config?: PromptSourcesConfig;
}
export function SessionSystemPromptEditor({ card, onRefresh }: { card: QueueCard; onRefresh: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PromptSourcesConfig>(DEFAULT_PROMPT_SOURCES);
  const [baseDraft, setBaseDraft] = useState("");
  const [sources, setSources] = useState<Sources | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = !!card.session;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true); setError(""); setSources(null);
    void (async () => {
      const response = await fetch(`/api/prompt-sources?cwd=${encodeURIComponent(card.cwd)}`);
      const available = await response.json();
      if (!response.ok) throw new Error(available.error);
      const live = card.session ? await sendAgentCommand<Sources>(card.session.id, { type: "get_prompt_sources" }) : null;
      if (!cancelled) {
        setSources(live ? { ...available, ...live, tags: available.tags } : available);
        const selected = live?.config ?? card.promptSources ?? DEFAULT_PROMPT_SOURCES;
        setConfig(selected);
        setBaseDraft(live ? live.basePrompt ?? "" : selected.basePrompt || available.basePrompt || "");
      }
    })().catch(cause => { if (!cancelled) setError(String(cause)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [open, card.cwd, card.session, card.promptSources]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/card-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prompt_sources", id: card.id, config }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setOpen(false); onRefresh();
    } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  const toggle = (key: "excludedContextFiles" | "excludedSkills", path: string, enabled: boolean) => setConfig(current => ({ ...current, [key]: enabled ? current[key].filter(item => item !== path) : [...current[key], path] }));
  return <>
    <button type="button" className="cq-tools-trigger" onClick={() => setOpen(true)} aria-label={t("system.promptShort")}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg><span>{t("system.promptShort")}</span></button>
    {open && createPortal(<div className="session-prompt-overlay" onClick={() => !busy && setOpen(false)} onKeyDown={event => { if (event.key === "Escape" && !busy) { event.stopPropagation(); setOpen(false); } }}>
      <section className="session-prompt-editor" role="dialog" aria-modal="true" aria-label={t("system.sources")} onClick={event => event.stopPropagation()}>
        <header><strong>{t("system.sources")}</strong><button disabled={busy} onClick={() => setOpen(false)} aria-label={t("queue.关闭")}>×</button></header>
        <p>{t(started ? "system.sourcesLocked" : "system.sourcesDraft")}</p>
        <div className="prompt-source-list">
          {sources && <>
            {sources.legacyOverride && <p role="status">{t("system.legacyOverride")}</p>}
            <details open><summary>{t("system.baseSource")}</summary>
              <p>{sources.baseSource ?? t("system.generatedBase")}</p>
              <textarea className="prompt-base-preview" aria-label={t("system.baseSource")} value={baseDraft} readOnly={started} disabled={busy} onChange={event => { setBaseDraft(event.target.value); setConfig({ ...config, basePrompt: event.target.value }); }} />
              {sources.appendPrompt && <details><summary>APPEND_SYSTEM.md</summary><pre>{sources.appendPrompt}</pre></details>}
            </details>
            <details open><summary>{t("system.projectInstructions")} · {sources.contextFiles.length}</summary><p>{t("system.contextHint")}</p>
              {sources.contextFiles.map(file => <div className="prompt-source-item" key={file.path}><label><input type="checkbox" disabled={started || busy} checked={!config.excludedContextFiles.includes(file.path)} onChange={event => toggle("excludedContextFiles", file.path, event.target.checked)} /><span>{file.path}</span></label><details><summary>{t("system.sourceText")}</summary><pre>{file.content}</pre></details></div>)}
            </details>
            <details open><summary>{t("system.skillSources")} · {sources.skills.length}</summary><p>{t("system.skillsHint")}</p>
              {sources.skills.map(skill => <div className="prompt-source-item" key={skill.path}><label><input type="checkbox" disabled={started || busy || skill.disabled} checked={!skill.disabled && !config.excludedSkills.includes(skill.path)} onChange={event => toggle("excludedSkills", skill.path, event.target.checked)} /><strong>{skill.name}</strong></label><small>{skill.path}</small><p>{skill.description}</p></div>)}
            </details>
            <details><summary>{t("queue.Turn Tags")} · {t(sources.tags?.enabled ? "system.sourceEnabled" : "system.sourceDisabled")}</summary><p>{t("system.tagsSeparate")}</p><pre>{sources.tags?.prompt}</pre></details>
            {started && <details><summary>{t("system.effectivePrompt")}</summary><textarea aria-label={t("system.effectivePrompt")} readOnly value={sources.effectivePrompt ?? ""} /></details>}
          </>}
        </div>
        {error && <p role="alert">{error}</p>}
        {!started && <footer><button disabled={busy} onClick={() => { setConfig(DEFAULT_PROMPT_SOURCES); setBaseDraft(sources?.basePrompt ?? ""); }}>{t("system.resetPrompt")}</button><button disabled={busy || !sources} onClick={() => void save()}>{t("system.savePrompt")}</button></footer>}
      </section>
    </div>, document.body)}
  </>;
}
