"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markQueueCardWorking, mergeQueueSnapshot } from "@/lib/card-queue-snapshot";
import type { CardQueue } from "@/lib/card-queue";
import type { SessionInfo } from "@/lib/types";

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) throw new Error(response.ok ? "服务返回了空响应" : `本地服务请求失败 (${response.status})`);
  try { return JSON.parse(body) as T; }
  catch { throw new Error(response.ok ? "本地服务返回了无效数据" : `本地服务请求失败 (${response.status})`); }
}

export function useCardQueue() {
  const [queue, setQueue] = useState<CardQueue | null>(null);
  const [defaultCwd, setDefaultCwd] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const localGeneration = useRef(0);
  const lifetime = useRef(0);
  const pendingWorking = useRef(new Map<string, SessionInfo | undefined>());
  const request = useRef<{ generation: number; controller: AbortController; promise: Promise<void> } | null>(null);
  const accept = useCallback((next: CardQueue & { defaultCwd?: string }) => {
    if (!mounted.current) return;
    for (const cardId of pendingWorking.current.keys()) {
      if (next.cards.some((card) => card.id === cardId && card.session)) {
        pendingWorking.current.delete(cardId);
      }
    }
    setQueue((previous) => {
      let merged = mergeQueueSnapshot(previous, next);
      for (const [cardId, session] of pendingWorking.current) {
        merged = markQueueCardWorking(merged, cardId, session);
      }
      return merged;
    });
    if (next.defaultCwd) setDefaultCwd(next.defaultCwd);
  }, []);
  const refresh = useCallback((): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    const generation = localGeneration.current;
    if (request.current?.generation === generation) return request.current.promise;
    request.current?.controller.abort();
    const controller = new AbortController();
    const current = { generation, controller, promise: Promise.resolve() };
    request.current = current;
    current.promise = (async () => {
      try {
        const response = await fetch("/api/card-queue", { cache: "no-store", signal: controller.signal });
        const data = await readJsonResponse<CardQueue & { defaultCwd?: string; error?: string }>(response);
        if (controller.signal.aborted || generation !== localGeneration.current) return;
        if (!response.ok) throw new Error(data.error || "无法连接 Pi");
        accept(data);
        if (mounted.current) setError("");
      } catch (error) {
        if (!controller.signal.aborted && mounted.current && generation === localGeneration.current)
          setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (request.current === current) request.current = null;
      }
    })();
    return current.promise;
  }, [accept]);
  const markWorking = useCallback((cardId: string, session?: SessionInfo, pendingAttachment = false) => {
    // Move immediately once submission starts and discard older poll snapshots.
    localGeneration.current += 1;
    if (pendingAttachment) pendingWorking.current.set(cardId, session);
    else pendingWorking.current.delete(cardId);
    setQueue((current) => current ? markQueueCardWorking(current, cardId, session) : current);
    if (!pendingAttachment) void refresh();
  }, [refresh]);
  const rollbackWorking = useCallback((cardId: string) => {
    pendingWorking.current.delete(cardId);
    localGeneration.current += 1;
    setQueue((current) => current ? {
      ...current,
      cards: current.cards.map((card) => card.id === cardId && !card.session
        ? { ...card, phase: "draft" as const }
        : card),
    } : current);
    void refresh();
  }, [refresh]);
  const act = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    const generation = localGeneration.current;
    const owner = lifetime.current;
    const response = await fetch("/api/card-queue", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...data }),
    });
    const result = await readJsonResponse<CardQueue & { error?: string }>(response);
    if (!response.ok) throw new Error(result.error || "操作失败");
    if (mounted.current && owner === lifetime.current) {
      if (generation === localGeneration.current) accept(result);
      else void refresh();
    }
    return result as CardQueue;
  }, [accept, refresh]);
  useEffect(() => {
    mounted.current = true;
    lifetime.current += 1;
    let disposed = false;
    let cycle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (owner: number) => {
      if (disposed) return;
      await refresh();
      if (!disposed && owner === cycle)
        timer = setTimeout(() => void poll(owner), document.visibilityState === "visible" ? 1200 : 3000);
    };
    const reconcile = () => {
      clearTimeout(timer);
      cycle += 1;
      void poll(cycle);
    };
    reconcile();
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      disposed = true;
      mounted.current = false;
      lifetime.current += 1;
      clearTimeout(timer);
      request.current?.controller.abort();
      request.current = null;
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [refresh]);
  return { queue, defaultCwd, error, refresh, act, markWorking, rollbackWorking };
}
