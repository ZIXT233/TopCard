"use client";
import { ScoreChipTooltip } from "./ScoreChipTooltip";
import { useI18n } from "@/hooks/useI18n";
import type { AssistantMessage, CustomMessage } from "@/lib/types";
import { parseTurnTagMetadata } from "@/lib/turn-tag-protocol";

export function TurnTagNotice({ message }: { message: AssistantMessage }) {
  const { t } = useI18n();
  const text = message.content.filter(block => block.type === "text").map(block => block.text).join("\n");
  const start = text.search(/<turn_tags\s*>/);
  const raw = message.turnTagRaw ?? (start >= 0 ? text.slice(start) : undefined);
  let names: string[] = [];
  let invalid = false;
  if (raw) {
    try {
      const payload = JSON.parse(raw.match(/<turn_tags\s*>([\s\S]*?)<\/turn_tags\s*>\s*$/)?.[1] ?? "");
      const definitions = Array.isArray(payload.tags) ? payload.tags.filter((name: unknown) => typeof name === "string").map((name: string) => ({ name, weight: 0, description: "" })) : [];
      names = parseTurnTagMetadata(raw, definitions).tags;
    } catch { invalid = true; }
  }
  const label = invalid ? t("queue.tagsInvalid") : names.length ? names.join(" · ") : raw ? t("queue.tagsNone") : t("queue.tagsAbsent");
  return <div className="turn-tag-notice"><ScoreChipTooltip text={<><div>{t("queue.tagsExplanation")}</div><pre className="turn-tag-original">{raw ?? t("queue.tagsAbsent")}</pre></>}>
    <span>Sort Tags · {label}</span>
  </ScoreChipTooltip></div>;
}

export function TurnTagRuleNotice({ message }: { message: CustomMessage }) {
  const { t } = useI18n();
  const details = message.details as { enabled?: boolean; change?: string } | undefined;
  const label = details?.enabled === false ? t("queue.tagsDisabledNotice") : details?.change === "updated" ? t("queue.tagsUpdatedNotice") : t("queue.tagsEnabledNotice");
  const raw = typeof message.content === "string" ? message.content : message.content.filter(block => block.type === "text").map(block => block.text).join("\n");
  return <div className="turn-tag-rule-notice" role="note"><ScoreChipTooltip text={<pre className="turn-tag-original">{raw}</pre>}><span>{label}</span></ScoreChipTooltip></div>;
}
