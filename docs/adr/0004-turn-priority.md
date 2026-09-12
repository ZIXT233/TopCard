# Turn priority

FIFO preserves the explicit queue order; returning work joins the bottom and Later sends a card to the bottom. Score mode uses conversation weight + whole waiting minutes (0–99) + matching configured tag weights. Ties use entry time, then stable ID. Unsent drafts stay outside the attention queue. Queue order always follows the scheduler; the browser anchors its viewport to the focused card ID, even when its index changes. In Score mode a passive 💡 count includes only unread cards preceding the focused card. A card is read only if the user has focused its latest turn. Read keys combine card ID and turnKey and persist in browser localStorage under a versioned key; legacy cards without turnKey use session modification time, message count and readyAt as a fallback. New turns become unread again; score or tag changes within the same turn do not reset read state. Old card-only read records are not reused. The white circular floating button sits at the bottom right of the main content area, with a yellow count badge at its top right. Clicking it explicitly focuses the first unread card in the current queue order. Polling, waiting time, tag changes and conversation weights never switch focus or interrupt the current composer. If the focused card leaves the queue, the nearest surviving slot becomes active. In score mode Later clears current waiting credit and restarts that clock.

Workspace defaults are copied into new drafts, never propagated to existing conversations. Turn Tag settings are shared across this installation's workspaces and persisted atomically in the queue file.

Agent start clears per-turn state. Completion or blocking-human reconciliation schedules a separate classifier request through the session's model runtime, exposing only evaluate_turn_tags. The classifier receives current tag names/descriptions, not weights. A strict schema and additional validation reject unknown names, duplicates, extra fields and ordinary prose. The request does not mutate the chat history or invoke filesystem tools.

The session leaf deduplicates evaluations. Each evaluation stores a configuration snapshot and tool arguments/error in tagHistory for audit and replay. Results arriving after a newer turn starts are ignored. Pending, error and unassessed states are visible; failed evaluations can be retried. No free-text fallback is allowed. Pre-existing sessions without a live runtime remain unassessed until their next run; history browsing never creates an agent runtime.

Changing tag weights affects current scores. Changing descriptions affects subsequent evaluations; recorded evaluation definitions remain immutable.

## Superseding implementation: append-only metadata rules

The separate classifier/tool request described above has been removed. The session adapter now appends a hidden custom rule message only when its names/descriptions differ from the latest effective rule. It never rewrites system prompts or historical messages. After compaction removes the rule it may append it again. The final assistant reply supplies a strict trailing turn_tags JSON block; parsing is local with no repair request. Display filtering does not modify model-visible history.

Tag names include any display emoji and match exactly; no old-name aliases or schema migrations are applied. Score weights and UI locale are excluded from the injected prompt signature. Rules are appended before the user request in idle sessions so internal formatting instructions never become the latest request. Historical prompt/audit snapshots remain unchanged. The queue UI uses Pi Web's existing English, Simplified Chinese and Traditional Chinese locale registry; user-defined names and descriptions are data and are never rewritten on locale switches.

### Tag presentation simplification

Tags again contain only name, weight and description. Emoji may be typed directly in name. Legacy emoji fields are migrated into names with collision handling; existing card tags are updated, while historical prompts and audit records are not rewritten. The settings editor aligns name and weight on a compact row with an expandable description. Because emoji is now part of the name, changing it is a semantic name change and appends updated rules on the next prompt.

After the first message is accepted and the new session is attached, its inspection panel closes and the existing queue focus resumes. Failed sends or attachment errors keep the panel open.

Existing queue cards move to Working immediately after a normal prompt is acknowledged, with a fresh queue fetch for reconciliation; responses started before that acknowledgement cannot overwrite the local transition. Transfers animate a lightweight card heading and silhouette instead of cloning chat content, and remaining cards animate into place on queue insertion/removal as well as reordering.

## Urgent Call

Urgent Call replaces the configurable Urgent definition with a fixed built-in exception. It sorts ahead of every ordinary score in both FIFO and Score modes; the UI displays infinity, but persistence uses a separate urgentCall object rather than a non-finite numeric weight. The settings API rejects reserved names in user definitions and the queue loader reinstates the canonical rule. Legacy Urgent flags are not promoted into alerts and historical audit snapshots stay unchanged.

All four conditions must hold: serious loss, concrete immediate urgency, an actionable intervention required from this user that the agent cannot safely perform, and observed evidence. Routine approvals, blockers, failed tests, ordinary deadlines, emphatic wording and tag requests are excluded. Protocol v2 requires incident, evidence, urgency and action strings alongside the reserved tag; missing or malformed metadata cannot trigger an alert. Semantic truth is still evaluated by the replying model, not independently verified by this parser.

An urgent waiting turn opens a native modal showing those four explanations. Read and handle explicitly opens the relevant card. Closing the reminder acknowledges only the reminder, not that the turn was read. Reminders are keyed by card and turn in browser storage; subsequent turns can alert again. Starting a new run clears urgent state. Ordinary cards retain soft preemption and never open this dialog. The canonical prompt is appended on the next prompt submission, preserving prior conversation history.

Urgent Call cards and stack previews use pale red surfaces. When the user sends a normal prompt from the active queue card or archives it successfully, the view returns to the queue head; a failed action keeps the card open. Background score changes still preserve focus, and a late acknowledgement does not move a user who has already opened a different card.

## Native trackpad scrolling

The deck uses native horizontal scrolling and CSS Scroll Snap. Wheel events are observed passively only to clear a keyboard target; no preventDefault, synthetic scrollBy, velocity classification or idle timer handles trackpad scrolling. Scroll events update the shared card projection without writing the observed position back to scrollTo. Explicit navigation, queue identity rebasing and resizing can reposition the scroller. Arrow keys use native smooth scrolling to an adjacent snap point. Mouse-button dragging temporarily disables snapping and restores it on pointer release; touch panning remains native. Snap padding matches the deck gutters so snap indexes and visual card positions agree.
