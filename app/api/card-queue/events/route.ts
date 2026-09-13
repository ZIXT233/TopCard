import { ensureQueueLiveWatch, subscribeQueueLive } from "@/lib/card-queue-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (req.signal.aborted) return new Response(null, { status: 204 });
  await ensureQueueLiveWatch();
  let closeStream: (closeController: boolean) => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      const cleanup = (closeController: boolean) => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        req.signal.removeEventListener("abort", abort);
        if (closeController) {
          try { controller.close(); } catch { /* already closed */ }
        }
      };
      const abort = () => cleanup(true);
      const send = (reason: string) => {
        if (closed) return;
        try {
          if ((controller.desiredSize ?? 0) <= 0) {
            cleanup(true);
            return;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "change", reason })}\n\n`));
        } catch { cleanup(false); }
      };
      const unsubscribe = subscribeQueueLive(send);
      closeStream = cleanup;
      controller.enqueue(encoder.encode(":\n\n"));
      req.signal.addEventListener("abort", abort, { once: true });
      if (req.signal.aborted) {
        abort();
        return;
      }
      heartbeat = setInterval(() => {
        try {
          if ((controller.desiredSize ?? 0) <= 0) cleanup(true);
          else if (!closed) controller.enqueue(encoder.encode(":\n\n"));
        } catch { cleanup(false); }
      }, 30_000);
    },
    cancel() {
      closeStream(false);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
