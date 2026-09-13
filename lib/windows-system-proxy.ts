import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export function parseWindowsProxy(output: string): { httpProxy?: string; httpsProxy?: string; noProxy?: string } {
  const value = (name: string) => output.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.+)$`, "mi"))?.[1].trim();
  if (value("ProxyEnable") !== "0x1") return {};
  const server = value("ProxyServer");
  if (!server) return {};
  const url = (raw: string | undefined) => {
    if (!raw) return undefined;
    try {
      const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : undefined;
    } catch { return undefined; }
  };
  const perProtocol = Object.fromEntries(server.split(";").filter(part => part.includes("=")).map(part => part.trim().split("=")));
  const shared = server.includes("=") ? undefined : server;
  // WinINET bypass lists use semicolons. <local> means dotless hostnames,
  // which NO_PROXY cannot express; explicit hosts and domain suffixes can.
  const bypass = (value("ProxyOverride") || "").split(";").map(host => host.trim()).filter(host => host && host !== "<local>");
  return { httpProxy: url(perProtocol.http || shared), httpsProxy: url(perProtocol.https || shared),
    noProxy: ["localhost", "127.0.0.1", "[::1]", ...bypass].join(",") };
}

export async function readWindowsSystemProxy() {
  if (process.platform !== "win32") return {};
  try {
    const { stdout } = await exec("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { timeout: 3000, windowsHide: true });
    return parseWindowsProxy(stdout);
  } catch { return {}; }
}

export function applySystemProxyEnvironment(proxy: ReturnType<typeof parseWindowsProxy>, env: NodeJS.ProcessEnv = process.env): void {
  // Pi can replace the global dispatcher during initialization. Keep its
  // dispatcher and child CLIs on the same route as TopCard's fetch.
  const explicitHttp = env.http_proxy ?? env.HTTP_PROXY;
  if (explicitHttp === undefined && proxy.httpProxy) env.HTTP_PROXY = proxy.httpProxy;
  if (env.https_proxy === undefined && env.HTTPS_PROXY === undefined) {
    const https = explicitHttp ?? proxy.httpsProxy;
    if (https !== undefined) env.HTTPS_PROXY = https;
  }
  if (env.no_proxy === undefined && env.NO_PROXY === undefined && proxy.noProxy) env.NO_PROXY = proxy.noProxy;
}
