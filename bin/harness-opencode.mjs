import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Lifecycle boundaries follow Orca's OpenCode status plugin; see docs/harness/opencode.
export const TopCardState = async ({ client }) => {
  const sessions = new Map();
  let owner = process.env.TOPCARD_HARNESS_SESSION_ID;
  let sequence = Promise.resolve();
  let lastSignalAt = 0;
  const enqueue = work => (sequence = sequence.then(work).catch(() => {}));
  const emit = (event, info) => {
    try {
      const signal = { at: (lastSignalAt = Math.max(Date.now(), lastSignalAt + 1)), event, sessionId: info.id, title: typeof info.title === 'string' ? info.title.slice(0, 160) : undefined };
      const token = process.env.TOPCARD_HARNESS_CHANNEL;
      if (token) fs.writeFileSync(process.env.TOPCARD_HARNESS_TTY || '/dev/tty', `\x1b]777;topcard;${Buffer.from(JSON.stringify({ token, signal })).toString('base64')}\x07`);
      else if (process.env.TOPCARD_HARNESS_SIGNAL_DIR) {
        const file = path.join(process.env.TOPCARD_HARNESS_SIGNAL_DIR, `${signal.at}-${randomUUID()}.json`);
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(signal), { mode: 0o600 }); fs.renameSync(`${file}.tmp`, file);
      }
    } catch {}
  };
  async function infoFor(id) {
    if (sessions.has(id)) return sessions.get(id);
    const signal = AbortSignal.timeout(1500);
    // Orca supports both OpenCode SDK generations; retain that compatibility boundary.
    const calls = client.session.get.length >= 2
      ? [[{ sessionID: id }, { signal }], [{ path: { id }, signal }]]
      : [[{ path: { id }, signal }]];
    for (const args of calls) {
      if (signal.aborted) break;
      try {
        const response = await client.session.get(...args);
        if (response.data?.id === id) {
          if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
          sessions.set(id, response.data);
          return response.data;
        }
      } catch {}
    }
  }
  return {
    'chat.message': (input) => enqueue(async () => {
      const info = await infoFor(input.sessionID);
      if (info && !info.parentID) { owner = info.id; emit('UserPromptSubmit', info); }
    }),
    event: ({ event }) => {
      // Serialize async identity lookups so older idle events cannot pass newer busy events.
      if (!["session.created", "session.updated", "session.status", "session.idle", "permission.asked", "question.asked", "permission.replied", "question.replied", "question.rejected"].includes(event.type)) return;
      return enqueue(async () => {
        const properties = event.properties || {};
        if (properties.info?.id && event.type.startsWith('session.')) sessions.set(properties.info.id, properties.info);
        const id = properties.sessionID || properties.info?.id;
        if (!id) return;
        const info = await infoFor(id);
        if (!info || info.parentID) return;
        const status = properties.status?.type;
        if (!owner || status === 'busy' || status === 'retry') owner = id;
        if (id !== owner) return;
        if (event.type === 'session.updated' || event.type === 'session.created') emit('SessionInfo', info);
        else if (event.type === 'permission.asked' || event.type === 'question.asked') emit('PermissionRequest', info);
        else if (['permission.replied', 'question.replied', 'question.rejected'].includes(event.type)) emit('UserPromptSubmit', info);
        else if (status === 'busy' || status === 'retry') emit('UserPromptSubmit', info);
        else if (status === 'idle' || event.type === 'session.idle') emit('Stop', info);
        // session.error alone can be recoverable; it is not a completion signal.
      });
    },
  };
};
