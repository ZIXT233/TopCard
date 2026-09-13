"use client";
import { useI18n } from "@/hooks/useI18n";
import styles from "./ModelSetupOverlay.module.css";

export function ModelSetupOverlay({ status, message, onOpenSettings, onRetry }: {
  status: "ready" | "loading" | "empty" | "error";
  message: string | null;
  onOpenSettings?: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (!message) return null;
  return <div className={styles.overlay} role="status" aria-live="polite" aria-busy={status === "loading"}>
    <div className={styles.content}>
      <span className={styles.mark} aria-hidden="true">π</span>
      <h3>{t(status === "loading" ? "chat.modelsLoading" : status === "error" ? "chat.modelError" : "chat.modelsRequiredTitle")}</h3>
      {status !== "loading" && <>
        <p>{message}</p>
        {onOpenSettings && <button type="button" className={styles.primary} onClick={onOpenSettings}>{t("chat.configureModels")}</button>}
        <button type="button" onClick={onRetry}>{t("chat.retryModels")}</button>
      </>}
    </div>
  </div>;
}
