import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { inheritedConfig } from "./inherited-config";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { shellQuote, sshExec, sshLoginExec } from "../ssh-workspace";
import type { QueueWorkspace } from "../card-queue";
import type { HarnessId } from "./types";
import { embeddedNodeExecutable } from "../node-runtime";

// Session-local plugins preserve all user/project hook and permission settings.
export async function prepareHookLaunch(kind: HarnessId, directory: string, workspace: QueueWorkspace, token: string): Promise<{ args: string[]; env: Record<string, string> }> {
  const source = await readFile(join(process.cwd(), "bin/harness-hook.cjs"), "utf8");
  let root = join(directory, "..", "..", "harness-plugins", kind);
  if (workspace.kind === "local") await mkdir(directory, { recursive: true, mode: 0o700 });
  let node = embeddedNodeExecutable();
  const extraEnv: Record<string, string> = {};
  let grokConfigPath: string | undefined;
  let antigravityConfigPath: string | undefined;
  if (workspace.kind === "ssh") {
    const home = (await sshExec(workspace.sshHost!, 'printf "%s" "$HOME"')).toString().trim();
    if (!home.startsWith("/")) throw new Error("无法确定远程主机的 Home 目录");
    // Keep the Codex command stable across launches so hook trust is reusable;
    // changing the helper produces a new path and requires a fresh review.
    root = kind === "grok" ? `${home}/.cache/topcard/harness-plugins/grok`
      : kind === "codex" ? `${home}/.cache/topcard/harness-plugins/codex/${createHash("sha256").update(source).digest("hex").slice(0, 16)}`
      : `${home}/.cache/topcard/harness/${token}`;
    node = (await sshLoginExec(workspace.sshHost!, "command -v node")).toString().trim();
    if (!node.startsWith("/")) throw new Error("远程 Harness 状态探针需要 Node.js，请先在主机安装 Node.js");
  }
  const hookPath = workspace.kind === "ssh" ? `${root}/hook.cjs` : join(root, "hook.cjs");
  // Claude uses a POSIX shell for hooks on Windows too (Git Bash).
  const quote = (value: string) => workspace.kind === "local" && process.platform === "win32"
    ? `"${value.replaceAll('"', '\\"')}"` : shellQuote(value);
  const nodeCommand = [node, hookPath].map(quote).join(" ");
  // CLI hook runners may sanitize inherited Electron variables.
  const electronNode = workspace.kind === "local" && (process.env.ELECTRON_RUN_AS_NODE === "1" || process.env.TOPCARD_NODE_RUN_AS_NODE === "1");
  const command = electronNode
    ? (process.platform === "win32" && kind !== "claude" ? `set "ELECTRON_RUN_AS_NODE=1" && ${nodeCommand}` : `ELECTRON_RUN_AS_NODE=1 ${nodeCommand}`)
    : nodeCommand;
  const files: Record<string, string> = { "hook.cjs": source };
  const args: string[] = [];
  if (kind === "antigravity") {
    const bundle = Object.fromEntries(["PreInvocation", "PostInvocation", "PreToolUse", "PostToolUse", "Stop"].map(event => {
      const hook = { type: "command", command: `${command} ${quote(event)}`, timeout: 2 };
      return [event, [event.endsWith("ToolUse") ? { matcher: "*", hooks: [hook] } : hook]];
    }));
    files["antigravity-hooks.json"] = JSON.stringify(bundle);
    antigravityConfigPath = workspace.kind === "ssh"
      ? `${(await sshExec(workspace.sshHost!, 'printf "%s" "$HOME"')).toString().trim()}/.gemini/config/hooks.json`
      : join(homedir(), ".gemini", "config", "hooks.json");
  } else if (kind === "gemini") {
    const config = await inheritedConfig("gemini", workspace, node);
    const hooks = { ...(config.hooks as Record<string, unknown> ?? {}) };
    for (const event of ["SessionStart", "BeforeAgent", "AfterAgent", "BeforeTool", "AfterTool", "Notification"]) {
      hooks[event] = [...(Array.isArray(hooks[event]) ? hooks[event] as unknown[] : []), { hooks: [{ type: "command", name: `topcard-${event}`, command, timeout: 2000 }] }];
    }
    files["system-defaults.json"] = JSON.stringify({ ...config, hooks });
    extraEnv.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = workspace.kind === "ssh" ? `${root}/system-defaults.json` : join(root, "system-defaults.json");
  } else if (kind === "opencode") {
    files["opencode-plugin.mjs"] = await readFile(join(process.cwd(), "bin/harness-opencode.mjs"), "utf8");
    const config = await inheritedConfig("opencode", workspace, node);
    const plugin = workspace.kind === "ssh" ? `file://${root.split("/").map(encodeURIComponent).join("/")}/opencode-plugin.mjs` : pathToFileURL(join(root, "opencode-plugin.mjs")).href;
    extraEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...config, plugin: [...(Array.isArray(config.plugin) ? config.plugin : []), plugin] });
  } else if (kind === "grok") {
    const hooks = Object.fromEntries(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "StopFailure", "StopCancelled", "Notification"].map(event => [event, [{ hooks: [{ type: "command", command, timeout: 2 }] }]]));
    files["grok-hooks.json"] = JSON.stringify({ topcardManaged: true, hooks });
    if (workspace.kind === "ssh") {
      const configuredHome = (await sshExec(workspace.sshHost!, 'printf "%s" "${GROK_HOME:-$HOME/.grok}"')).toString().trim();
      grokConfigPath = `${configuredHome}/hooks/topcard-session-state.json`;
    } else grokConfigPath = join(process.env.GROK_HOME || join(homedir(), ".grok"), "hooks", "topcard-session-state.json");
  } else if (kind === "pi") {
    files["pi-extension.mjs"] = await readFile(join(process.cwd(), "bin/harness-pi.mjs"), "utf8");
    args.push("--extension", workspace.kind === "ssh" ? `${root}/pi-extension.mjs` : join(root, "pi-extension.mjs"));
  } else if (kind === "codex") {
    args.push("--enable", "hooks");
    for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"]) {
      args.push("-c", `hooks.${event}=[{hooks=[{type="command",command=${JSON.stringify(command)},timeout=2}]}]`);
    }
  } else {
    const cursor = kind === "cursor";
    files[`${cursor ? ".cursor-plugin" : ".claude-plugin"}/plugin.json`] = JSON.stringify({ name: "topcard-session-state", version: "1.0.0", description: "Report this TopCard terminal's lifecycle" });
    const events = cursor
      ? ["sessionStart", "beforeSubmitPrompt", "postToolUse", "postToolUseFailure", "afterAgentResponse", "stop", "sessionEnd"]
      : ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PostToolUseFailure", "Stop", "StopFailure"];
    const hooks = Object.fromEntries(events.map(event => [event, cursor
      ? [{ command: `${command} ${quote(event)}`, timeout: 2 }]
      : [{ hooks: [{ type: "command", command, timeout: 2 }] }]]));
    files["hooks/hooks.json"] = JSON.stringify({ ...(cursor ? { version: 1 } : {}), hooks });
    args.push("--plugin-dir", root);
  }
  if (workspace.kind === "ssh") {
    // Files are scoped to one launch; never modify a remote .claude/.cursor config.
    const payload = Buffer.from(JSON.stringify(files)).toString("base64");
    const installer = 'const fs=require("node:fs"),p=require("node:path"),root=process.argv[1];for(const [name,body] of Object.entries(JSON.parse(Buffer.from(process.argv[2],"base64")))){const f=p.join(root,name);fs.mkdirSync(p.dirname(f),{recursive:true,mode:448});const tmp=f+"."+require("node:crypto").randomUUID()+".tmp";fs.writeFileSync(tmp,body,{mode:384});fs.renameSync(tmp,f);}';
    await sshExec(workspace.sshHost!, [node, "-e", installer, root, payload].map(shellQuote).join(" "));
    if (grokConfigPath) {
      const install = 'const fs=require("node:fs"),p=require("node:path"),src=process.argv[1],dest=process.argv[2];if(fs.existsSync(dest)&&JSON.parse(fs.readFileSync(dest,"utf8")).topcardManaged!==true)throw Error("Existing hook file is not owned by TopCard");fs.mkdirSync(p.dirname(dest),{recursive:true,mode:448});fs.copyFileSync(src,dest);fs.chmodSync(dest,384);';
      await sshExec(workspace.sshHost!, [node, "-e", install, `${root}/grok-hooks.json`, grokConfigPath].map(shellQuote).join(" "));
    }
    if (antigravityConfigPath) {
      const installer = 'const fs=require("node:fs"),p=require("node:path"),dest=process.argv[1],src=process.argv[2];const x=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,"utf8")):{};if(x["topcard-session-state"]&&!JSON.stringify(x["topcard-session-state"]).includes("/topcard/"))throw Error("Hook name already owned");x["topcard-session-state"]=JSON.parse(fs.readFileSync(src,"utf8"));fs.mkdirSync(p.dirname(dest),{recursive:true});fs.writeFileSync(dest+".topcard.tmp",JSON.stringify(x,null,2),{mode:384});fs.renameSync(dest+".topcard.tmp",dest);';
      await sshExec(workspace.sshHost!, [node, "-e", installer, antigravityConfigPath, `${root}/antigravity-hooks.json`].map(shellQuote).join(" "));
    }
    return { args, env: { ...extraEnv, TOPCARD_HARNESS_CHANNEL: token, TOPCARD_HARNESS_KIND: kind } };
  }
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
    await writeFile(`${path}.${token}.tmp`, body, { mode: 0o600 });
    await rename(`${path}.${token}.tmp`, path);
  }
  if (antigravityConfigPath) {
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(await readFile(antigravityConfigPath, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!config || Array.isArray(config) || typeof config !== "object") throw new Error("Invalid Antigravity hooks configuration");
    const existing = config["topcard-session-state"];
    const owned = (value: unknown): boolean => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const definitions = Object.entries(value).filter(([key]) => key !== "enabled");
      return definitions.length > 0 && definitions.every(([event, entries]) =>
        ["PreInvocation", "PostInvocation", "PreToolUse", "PostToolUse", "Stop"].includes(event)
        && Array.isArray(entries) && entries.length > 0 && entries.every(entry => {
          const handlers = Array.isArray(entry?.hooks) ? entry.hooks : [entry];
          return handlers.length > 0 && handlers.every((handler: { command?: string }) =>
            typeof handler.command === "string" && (handler.command === `${command} ${quote(event)}` || /[\\/]\.topcard[\\/]harness-plugins[\\/]antigravity[\\/]hook\.cjs["']/.test(handler.command)));
        }));
    };
    if (existing && !owned(existing)) throw new Error("Antigravity hook 同名条目不属于 TopCard，未覆盖");
    config["topcard-session-state"] = JSON.parse(files["antigravity-hooks.json"]);
    await mkdir(join(antigravityConfigPath, ".."), { recursive: true, mode: 0o700 });
    await writeFile(`${antigravityConfigPath}.${token}.tmp`, JSON.stringify(config, null, 2), { mode: 0o600 });
    await rename(`${antigravityConfigPath}.${token}.tmp`, antigravityConfigPath);
  }
  if (grokConfigPath) {
    try {
      const existing = JSON.parse(await readFile(grokConfigPath, "utf8"));
      if (existing.topcardManaged !== true) throw new Error("Grok hook 同名文件不属于 TopCard，未覆盖");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await mkdir(join(grokConfigPath, ".."), { recursive: true, mode: 0o700 });
    await writeFile(`${grokConfigPath}.${token}.tmp`, files["grok-hooks.json"], { mode: 0o600 });
    await rename(`${grokConfigPath}.${token}.tmp`, grokConfigPath);
  }
  return { args, env: { ...extraEnv, TOPCARD_HARNESS_SIGNAL_DIR: directory, TOPCARD_HARNESS_KIND: kind } };
}
