const TOPCARD_TARGET_PARAMS = new Set(["card", "session"]);

export function safeTopCardDestination(destination: string | null, origin: string): string {
  if (!destination) return "/";
  try {
    const target = new URL(destination, origin);
    if (target.origin !== origin || target.pathname !== "/" || target.hash) return "/";
    const entries = [...target.searchParams.entries()];
    if (entries.length === 0) return "/";
    if (entries.length !== 1 || !TOPCARD_TARGET_PARAMS.has(entries[0][0]) || !entries[0][1]) return "/";
    return `/?${new URLSearchParams(entries).toString()}`;
  } catch {
    return "/";
  }
}
