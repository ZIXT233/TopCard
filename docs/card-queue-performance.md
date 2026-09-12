# Card queue animation and lifecycle

## Rendering

Native horizontal scrolling remains the animation source. `CardDeck` batches scroll
updates with `requestAnimationFrame`; only crossing a rounded card index reports a
focus change to `CardQueueShell`. `DeckContent` memoizes the conversation subtree,
so fractional transform updates do not rerender card headers or chats. Cards keep
stable DOM order by ID to preserve the focused composer during priority reorders.

The existing projection window still bounds mounting: visible near cards contain
`SessionCard`, distant right previews contain silhouettes, and fully clipped left
cards unmount. This is not an unlimited keep-alive cache. Revisiting an unloaded
card reads its session again; unmounting a view does not stop its server-side agent.

Unchanged queue snapshots retain their identity, and changed snapshots reuse
unchanged card objects. Score changes have a separate timer at the next waiting
minute boundary; time-dependent ordering does not rely on network data changing.
The timer pauses while hidden and reconciles on visibility restoration.

## Requests and cleanup

- Queue refresh calls share the current request. An optimistic working transition
  invalidates the old request generation and starts a fresh read.
- Each polling effect owns its timer and disposed flag, including React StrictMode
  replay. Hidden tabs stop the queue polling chain and cancel its in-flight GET.
  Visibility/online bursts share one read and restart only one timer chain.
- Unmount aborts initial session history/state reads. Aborted results cannot run
  the mount continuation and reopen an event subscription after cleanup.
- Queue POST actions are not canceled: the server may already have applied them.
  Their results cannot update a different mount lifetime.
- Transfer snapshots scan DOM only when cards reorder or change zones. Canceled,
  completed, and unmounted transfer animations clean up their cloned nodes.
- Empty silhouettes skip backdrop blur; populated previews retain the existing
  frost effect. Reduced-motion preferences disable preview transitions and hints.

## Validation (2026-09-11)

Uses the existing Turbopack dev server and headless Chromium, with all browser API
requests mocked so no real cards or agent sessions are changed:

```sh
node e2e/card-queue-lifecycle.mjs
node e2e/soft-preemption.mjs
```

With 30 cards, 19 within-card scroll updates produced 19 CardDeck renders and zero
CardQueueShell, DeckContent, or SessionCard renders after the preview boundary
warm-up. Three conversation views were mounted at the tested middle position.
These are component-work measurements, not FPS, GPU-memory, or production latency
benchmarks. Long Markdown/tool histories and physical-device GPU behavior remain
unprofiled.

Browser regressions also cover canceled slow history loads, hidden-tab polling,
single-chain restoration, independent waiting-score ticks, canceled transfer
cleanup, focus/selection preservation during score reorders, and wheel navigation.

Typecheck and lint pass. The 46 targeted projection, snapshot, score, draft and
session-hook tests pass. Separately, `lib/card-queue.test.mjs` has 8 failures out of
14 tests in untouched queue logic, primarily old pinned-composer expectations;
this change does not alter those queue semantics or rewrite those tests.
