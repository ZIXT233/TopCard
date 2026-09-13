/* eslint-disable @typescript-eslint/no-require-imports -- Standalone passive CLI hook. */
// Shared ingress for built-in CLI adapters. Public contract: docs/harness/hook-api.md
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const explicitEvent = process.argv[2];
const cursorEvents = new Set(['sessionStart', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'beforeShellExecution', 'beforeMCPExecution', 'afterAgentResponse', 'stop', 'sessionEnd']);
function cursorReply(event) {
  if (event === 'beforeSubmitPrompt') return { continue: true };
  if (event === 'beforeShellExecution' || event === 'beforeMCPExecution') return { permission: 'ask' };
  return {};
}
const kind = process.env.TOPCARD_HARNESS_KIND || (cursorEvents.has(explicitEvent) ? 'cursor' : undefined);
const token = process.env.TOPCARD_HARNESS_CHANNEL;
const envDirectory = process.env.TOPCARD_HARNESS_SIGNAL_DIR;
const activePath = path.join(__dirname, 'active.json');
// Cursor observe hooks ignore stdout, but answering before stdin is fully read
// lets the worker tear the process down before replyPreview is written. Reply
// after the signal (beforeSubmitPrompt still returns continue:true).
if (kind === 'gemini' || kind === 'grok') process.stdout.write('{}\n');
if (kind !== 'cursor' && !envDirectory && !token && !legacyActiveDirectory()) {
  process.exit(0);
}
if (kind === 'cursor' && !envDirectory && !token && !hasCursorRouting()) {
  process.stdout.write(JSON.stringify(cursorReply(explicitEvent)) + '\n');
  process.exit(0);
}
const at = Date.now();
let input = '', oversized = false, done = false, finished = false;
const timer = setTimeout(() => { consume(); finish(); }, 8000);
function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (kind === 'cursor') process.stdout.write(JSON.stringify(cursorReply(explicitEvent)) + '\n');
  process.exit(0);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (input.length + chunk.length > 1024 * 1024) { oversized = true; input = ''; finish(); return; }
  input += chunk;
  consume();
});
process.stdin.on('error', () => finish());
process.stdin.on('end', () => { consume(); finish(); });

function readActive() {
  try { return JSON.parse(fs.readFileSync(activePath, 'utf8')); }
  catch { return undefined; }
}

function legacyActiveDirectory() {
  const active = readActive();
  return typeof active?.directory === 'string' && active.directory ? active.directory : undefined;
}

function hasCursorRouting() {
  const active = readActive();
  if (!active) return false;
  if (typeof active.directory === 'string' && active.directory) return true;
  if (Array.isArray(active.pending) && active.pending.some(value => typeof value === 'string' && value)) return true;
  if (active.sessions && typeof active.sessions === 'object') return Object.keys(active.sessions).length > 0;
  return false;
}

function writeActive(active) {
  const temporary = `${activePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(active), { mode: 0o600 });
  fs.renameSync(temporary, activePath);
}

function registerCursorSession(sessionId, directory) {
  try {
    const active = readActive() || { kind: 'cursor' };
    const sessions = active.sessions && typeof active.sessions === 'object' && !Array.isArray(active.sessions)
      ? { ...active.sessions } : {};
    sessions[sessionId] = directory;
    const pending = Array.isArray(active.pending)
      ? active.pending.filter(value => value !== directory) : [];
    const channels = active.channels && typeof active.channels === 'object' && !Array.isArray(active.channels)
      ? { ...active.channels } : {};
    writeActive({ ...active, kind: 'cursor', directory, sessions, pending, channels });
  } catch { /* Routing is best-effort; the signal file still lands. */ }
}

function resolveCursorDirectory(sessionId, eventName) {
  const active = readActive();
  if (!active) return undefined;
  const sessions = active.sessions && typeof active.sessions === 'object' && !Array.isArray(active.sessions)
    ? active.sessions : undefined;
  const pending = Array.isArray(active.pending) ? active.pending.filter(value => typeof value === 'string' && value) : undefined;
  // Legacy single-directory active.json keeps the old broadcast behavior for tests.
  if (!sessions && !pending) {
    return typeof active.directory === 'string' && active.directory ? active.directory : undefined;
  }
  if (sessionId && typeof sessions?.[sessionId] === 'string') return sessions[sessionId];
  // Only sessionStart may claim a freshly launched card. Prompt/stop from the IDE
  // must not steal the pending slot and poison reconnect with a foreign chat id.
  if (sessionId && eventName === 'sessionStart' && pending?.length) {
    const directory = pending[0];
    registerCursorSession(sessionId, directory);
    return directory;
  }
  return undefined;
}

function replyText(payload) {
  return payload.text ?? payload.last_assistant_message ?? payload.lastAssistantMessage
    ?? payload.prompt_response ?? payload.response ?? payload.message ?? payload.content;
}

function consume() {
  if (done || oversized) return;
  let payload;
  try { payload = JSON.parse(input.replace(/^\uFEFF/, '')); }
  catch { return; }
  done = true;
  try {
    let eventName = explicitEvent || payload.hook_event_name || ({session_start:"SessionStart",user_prompt_submit:"UserPromptSubmit",pre_tool_use:"PreToolUse",post_tool_use:"PostToolUse",post_tool_use_failure:"PostToolUseFailure",stop_cancelled:"StopCancelled",stop:"Stop",stop_failure:"StopFailure",notification:"Notification"})[payload.hookEventName];
    // Grok emits this informational notification even when no approval is needed.
    // Keep actual interactive questions/permission requests, but skip this routine signal.
    if (kind === 'grok' && eventName === 'Notification' &&
        (payload.notification_type ?? payload.notificationType ?? payload.type) === 'permission_prompt' &&
        String(payload.message ?? '').trim().toLowerCase() === 'tool permission requested' &&
        (!payload.level || String(payload.level).trim().toLowerCase() === 'info')) return;
    if (kind === 'antigravity') {
      if (eventName === 'Stop' && (payload.fullyIdle === false || payload.fully_idle === false)) eventName = 'PreInvocation';
      if (eventName === 'PreToolUse' && ['ask_question', 'ask_permission'].includes(payload.toolCall?.name)) eventName = 'PermissionRequest';
    }
    const text = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 160) : undefined;
    const completion = eventName === 'afterAgentResponse' || ['Stop', 'stop', 'AfterAgent'].includes(eventName);
    const event = { kind, at, event: eventName, replyPreview: completion ? text(replyText(payload)) : undefined, sessionId: payload.conversationId || payload.conversation_id || payload.session_id || payload.sessionId,
      agentId: payload.agent_id || payload.agentId, tool: payload.toolCall?.name ?? payload.tool_name ?? payload.toolName ?? payload.name,
      notification: payload.notification_type ?? payload.notificationType ?? payload.type,
      prompt: ['UserPromptSubmit', 'beforeSubmitPrompt', 'BeforeAgent'].includes(eventName) ? text(payload.prompt) : undefined };
    let directory = envDirectory || (kind === 'cursor' ? undefined : legacyActiveDirectory());
    if (kind === 'cursor') {
      if (directory && event.sessionId) registerCursorSession(event.sessionId, directory);
      else if (!directory) directory = resolveCursorDirectory(event.sessionId, eventName);
    }
    // Keep only field metadata, never prompt/reply text, to diagnose missing previews.
    if (kind === 'codex' && directory && eventName === 'Stop') {
      try {
        const value = payload.last_assistant_message;
        const diagnostic = { at, event: eventName, sessionId: event.sessionId,
          replyFieldPresent: Object.hasOwn(payload, 'last_assistant_message'),
          replyFieldType: value === null ? 'null' : typeof value,
          replyLength: typeof value === 'string' ? value.length : 0,
          previewLength: event.replyPreview?.length ?? 0 };
        const target = path.join(directory, 'last-stop-diagnostic.json');
        const temporary = `${target}.${randomUUID()}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(diagnostic), { mode: 0o600 });
        fs.renameSync(temporary, target);
      } catch {}
    }
    // Claude stores user-assigned titles in its transcript. Read a bounded tail on lifecycle events.
    if (kind === 'claude' && typeof payload.transcript_path === 'string') {
      try {
        const fd = fs.openSync(payload.transcript_path, 'r');
        try {
          const size = fs.fstatSync(fd).size, length = Math.min(size, 65536), bytes = Buffer.alloc(length);
          fs.readSync(fd, bytes, 0, length, size - length);
          for (const line of bytes.toString().split('\n')) {
            try { const row = JSON.parse(line); if (row.type === 'custom-title' && row.sessionId === event.sessionId) event.title = text(row.customTitle); } catch {}
          }
        } finally { fs.closeSync(fd); }
      } catch {}
    }
    const channel = token || (directory && (readActive()?.channels?.[directory]));
    if (channel) {
      const signal = Buffer.from(JSON.stringify({ token: channel, signal: event })).toString('base64');
      fs.writeFileSync(process.env.TOPCARD_HARNESS_TTY || '/dev/tty', `\x1b]777;topcard;${signal}\x07`);
    } else if (directory) {
      const target = path.join(directory, `${at}-${randomUUID()}.json`);
      fs.writeFileSync(`${target}.tmp`, JSON.stringify(event), { mode: 0o600 });
      fs.renameSync(`${target}.tmp`, target);
    }
  } catch { /* Observation cannot block the CLI or emit model-visible text. */ }
  finally {
    finish();
  }
}
