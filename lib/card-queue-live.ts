import { watch, type FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

type QueueLive = {
  listeners: Set<(reason: string) => void>;
  timer?: ReturnType<typeof setTimeout>;
  pending?: string;
  watcher?: FSWatcher;
};

const liveGlobal = globalThis as typeof globalThis & { __cardQueueLive?: QueueLive };
const live = (): QueueLive => liveGlobal.__cardQueueLive ??= { listeners: new Set() };

export const QUEUE_LIVE_DEBOUNCE_MS = 50;

export function dataDir(): string {
  return process.env.TOPCARD_DATA_DIR || join(process.cwd(), ".topcard");
}

export function harnessSignalRoot(root = dataDir()): string {
  return join(root, "harness-signals");
}

export function notifyQueueChanged(reason = "queue"): void {
  const bus = live();
  bus.pending = reason;
  if (bus.timer) return;
  bus.timer = setTimeout(() => {
    bus.timer = undefined;
    const why = bus.pending ?? "queue";
    bus.pending = undefined;
    for (const listener of bus.listeners) listener(why);
  }, QUEUE_LIVE_DEBOUNCE_MS);
  bus.timer.unref?.();
}

export function subscribeQueueLive(listener: (reason: string) => void): () => void {
  const bus = live();
  bus.listeners.add(listener);
  void ensureQueueLiveWatch();
  return () => { bus.listeners.delete(listener); };
}

export async function ensureQueueLiveWatch(): Promise<void> {
  const bus = live();
  if (bus.watcher) return;
  const directory = harnessSignalRoot();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (liveGlobal.__cardQueueLive !== bus || bus.watcher) return;
  try {
    bus.watcher = watch(directory, { recursive: true }, (_event, filename) => {
      if (typeof filename === "string" && (filename.endsWith(".tmp") || !filename.endsWith(".json"))) return;
      notifyQueueChanged("hook");
    });
    bus.watcher.unref?.();
    bus.watcher.on("error", () => {
      bus.watcher?.close();
      bus.watcher = undefined;
    });
  } catch { /* Fallback polling remains if the host cannot watch. */ }
}

export function resetQueueLiveForTests(): void {
  const bus = liveGlobal.__cardQueueLive;
  if (!bus) return;
  clearTimeout(bus.timer);
  bus.watcher?.close();
  liveGlobal.__cardQueueLive = undefined;
}
