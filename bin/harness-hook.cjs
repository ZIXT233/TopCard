/* eslint-disable @typescript-eslint/no-require-imports -- Standalone passive CLI hook. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const directory = process.env.TOPCARD_HARNESS_SIGNAL_DIR;
const token = process.env.TOPCARD_HARNESS_CHANNEL;
const kind = process.env.TOPCARD_HARNESS_KIND;
const explicitEvent = process.argv[2];
// Cursor requires JSON, including when observation is unavailable. No tool permission hooks.
if (kind === 'cursor') process.stdout.write(JSON.stringify(explicitEvent === 'beforeSubmitPrompt' ? { continue: true } : {}) + '\n');
if (kind === 'gemini' || kind === 'grok') process.stdout.write('{}\n');
if (!directory && !token) process.exit(0);
const at = Date.now();
const timer = setTimeout(() => process.exit(0), 1500);
let input = '', oversized = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (input.length + chunk.length > 1024 * 1024) { oversized = true; input = ''; }
  if (!oversized) input += chunk;
});
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  try {
    if (oversized) return;
    const payload = JSON.parse(input);
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
    const event = { kind, at, event: eventName, replyPreview: eventName === "afterAgentResponse" ? text(payload.text) : ["Stop", "stop", "AfterAgent"].includes(eventName) ? text(payload.last_assistant_message ?? payload.lastAssistantMessage ?? payload.prompt_response ?? payload.response) : undefined, sessionId: payload.conversationId || payload.conversation_id || payload.session_id || payload.sessionId,
      agentId: payload.agent_id || payload.agentId, tool: payload.toolCall?.name ?? payload.tool_name ?? payload.toolName ?? payload.name,
      notification: payload.notification_type ?? payload.notificationType ?? payload.type,
      prompt: ['UserPromptSubmit', 'beforeSubmitPrompt', 'BeforeAgent'].includes(eventName) ? text(payload.prompt) : undefined };
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
    if (token) {
      const signal = Buffer.from(JSON.stringify({ token, signal: event })).toString('base64');
      fs.writeFileSync(process.env.TOPCARD_HARNESS_TTY || '/dev/tty', `\x1b]777;topcard;${signal}\x07`);
    } else {
      const target = path.join(directory, `${at}-${randomUUID()}.json`);
      fs.writeFileSync(`${target}.tmp`, JSON.stringify(event), { mode: 0o600 });
      fs.renameSync(`${target}.tmp`, target);
    }
  } catch { /* Observation cannot block the CLI or emit model-visible text. */ }
  finally { clearTimeout(timer); }
});
