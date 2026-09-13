export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { configureHttpDispatcher } = await import("@/lib/http-dispatcher");
  const { readWindowsSystemProxy, applySystemProxyEnvironment } = await import("@/lib/windows-system-proxy");
  const proxy = await readWindowsSystemProxy();
  applySystemProxyEnvironment(proxy);
  configureHttpDispatcher(undefined, proxy);
}
