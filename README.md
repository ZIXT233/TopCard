# TopCard

**Just handle the top card.**

English · [简体中文](README.zh-CN.md)

TopCard is an attention scheduling queue for multiple agent sessions. Let agents work in parallel; bring your attention back to one card at a time.

It supports mainstream CLI harnesses alongside native Pi sessions, bringing different agent workflows into one place to review, respond, and move forward.

## Why a queue?

Running more agents should not mean watching more terminals. The scarce resource is your attention: deciding what to review, answering a question, and choosing the next step.

TopCard separates ongoing work from work that needs you. Running sessions live in **Working**. Cards that need attention enter the queue. Background completions join the end without taking over the card you are reading.

- **Focus on one card.** Read the result, reply, or decide what happens next.
- **Keep work moving.** Send a session back to work and continue with the next card.
- **Defer deliberately.** Move a card to the back when it can wait; browsing cards does not reorder them.
- **Keep the context.** Open a card in its own window for closer work, then return it to the queue.
- **Clear your attention queue.** Mark a card handled without deleting its underlying session.

## Agent workflows

| Workflow | Experience |
| --- | --- |
| CLI harnesses | Run Codex, Claude Code, Cursor Agent, Pi CLI, Grok Build, Antigravity CLI, and OpenCode in embedded terminals. Harness integrations report state back to the queue. |
| Native Pi | Chat directly in a card, with streaming responses, tool output, model selection, steering, compaction, and branching. |
| Shell | Use a regular terminal with command-completion notifications. Shell does not use Harness notification probes. |

CLI tools must be installed and authenticated on the machine where they run. State reporting depends on each harness integration; terminal access alone does not imply identical lifecycle support across tools.

Workspaces can point to local or SSH directories. Remote CLI sessions run on the remote host and load the user's interactive login shell environment, including paths configured through tools such as NVM. Native Pi sessions use local model credentials and execute their workspace tools over SSH. Remote Pi credentials, skills, and extensions are not automatically loaded; remote file/Git panels are not yet fully connected.

## Get started

From the app, add a workspace, create a card, and choose a CLI harness or native Pi session. You can also bring existing Pi sessions into the queue. `Cmd/Ctrl + J` opens the creation dialog; `Cmd/Ctrl + ]` moves the current card to the back.

### npm (browser)

Requires **Node.js >= 22.19.0**:

```bash
npm install -g topcard
topcard
```

Open [http://127.0.0.1:30141](http://127.0.0.1:30141). This is the second distribution channel alongside the Electron installer; it does not include the desktop tray or detached card windows.

### From source

```bash
npm ci
npm run dev
```

Open [http://127.0.0.1:30141](http://127.0.0.1:30141). Reuse an existing healthy development server instead of starting a second one in the same checkout.

For desktop development, keep that server running and use another terminal:

```bash
npm run desktop:dev
```

Native Pi uses your existing `~/.pi/agent` configuration, credentials, and sessions. Set `PI_CODING_AGENT_DIR` to use a separate data directory, or configure a model provider in the app's settings.

## Build

### Desktop installer

After `npm ci`, run:

```bash
npm run desktop:package
```

Installers are written to `build/releases/`.

| Platform | Output | Validation |
| --- | --- | --- |
| macOS Apple Silicon | `TopCard-<version>-arm64.dmg`, `mac-arm64/TopCard.app` | Verified |
| macOS Intel | DMG and `.app` | Requires target-machine validation |
| Windows | NSIS `.exe` installer | Configured, not yet verified |
| Linux | `.AppImage` | Configured, not yet verified |

Build on the target operating system and architecture: native dependencies such as `node-pty` make cross-platform builds unsupported by the current workflow. macOS packages currently use ad-hoc signing and are not notarized.

The desktop build writes `.next-desktop` and leaves the development `.next` untouched, so it can run alongside `npm run dev`. Unchanged inputs reuse `build/desktop-runtime`; the first or forced build still runs a full Next production compile. NSIS installer compression is not skipped by this cache.

To build and launch the production desktop without creating an installer:

```bash
npm run desktop:build
npm run desktop:start
```

The runtime is written to `build/desktop-runtime/`. Unchanged inputs reuse that directory; application edits rebuild with the `.next-desktop` cache. See [desktop development notes](desktop/README.md) for implementation details.

### Browser production build / npm package

Use a separate checkout with no development server running:

```bash
npm ci
npm run build
npm start
# or: npx topcard
```

Open [http://127.0.0.1:30141](http://127.0.0.1:30141). This build writes to the checkout's `.next`; do not run it alongside development in the same directory. `npm publish` runs a production build via `prepublishOnly` and ships `.next` inside the `topcard` package.

## Data and lifecycle

- Browser and desktop development store queue data in `.topcard/queue.json`; `TOPCARD_QUEUE_FILE` overrides the path. Preferences and drafts use browser localStorage.
- Production desktop stores queue, SSH configuration, and terminal records under `.topcard/` in Electron's user data directory. Preferences and drafts use `preferences.json` and survive backend port changes. On macOS, the default directory is `~/Library/Application Support/TopCard/`.
- Pi retains its own session history. CLI harnesses retain their own configuration and authentication.
- Closing the browser tab does not stop backend work. Closing the desktop's main window leaves it running; quitting TopCard ends its backend and managed session processes.

TopCard currently targets one local machine with one backend process. Queue persistence does not keep execution alive after that process exits. Previously working cards return for attention on restart. Arbitrary CLI sessions started outside TopCard are not automatically monitored.

## Validation

```bash
npm test
node_modules/.bin/tsc --noEmit
npm run lint
```

After `npm run desktop:build`, run desktop regressions:

```bash
npm run test:desktop
node e2e/desktop-persistence.mjs
```

To test a packaged app on macOS ARM64:

```bash
TOPCARD_DESKTOP_EXECUTABLE="$PWD/build/releases/mac-arm64/TopCard.app/Contents/MacOS/TopCard" npm run test:desktop
TOPCARD_DESKTOP_EXECUTABLE="$PWD/build/releases/mac-arm64/TopCard.app/Contents/MacOS/TopCard" node e2e/desktop-persistence.mjs
```

Desktop tests use temporary user data and cover authentication, native terminals, window reuse, shutdown cleanup, and preference/draft persistence. Set `TOPCARD_TEST_PI_PROMPT=1` for an optional real model request; it requires configured credentials and consumes model usage.

## Acknowledgments and license

TopCard builds on [agegr/pi-web](https://github.com/agegr/pi-web) and the Pi SDK for its native Pi experience, adding the attention queue and CLI harness workflows. The upstream baseline is `d10988df5bed37f83ebeac70daa995ef2382f1ce`; the original documentation is preserved in [UPSTREAM-README](docs/UPSTREAM-README.md).

Licensed under [MIT](LICENSE).
