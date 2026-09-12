import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY_QUEUE, filterHistoricalSessions, archiveCard, deferCard, moveCard, reconcileQueue, releaseCard } from "./card-queue.ts";
import { withCardQueue } from "./card-queue-store.ts";

const card = (id, phase = "attention") => ({ id, phase, session: phase === "draft" ? null : { id: `pi-${id}` }, cwd: "/tmp", createdAt: 1 });
const state = () => ({ ...structuredClone(EMPTY_QUEUE), cards: [card("a"), card("b"), card("c", "draft")], order: ["c", "a", "b"] });

test("sending removes only the running card; completed work joins the tail without preempting the reader", () => {
  const original = state();
  const working = reconcileQueue(original, new Set(["pi-a"]), new Set());
  assert.deepEqual(working.order, ["b"]);
  assert.equal(working.cards[0].phase, "working");
  assert.deepEqual(original.order, ["c", "a", "b"]);
  const completed = reconcileQueue(working, new Set(), new Set());
  assert.deepEqual(completed.order, ["b", "a"]);
  assert.equal(completed.cards[0].phase, "attention");
});

test("a blocking extension dialog is surfaced even while Pi reports running", () => {
  const next = reconcileQueue(state(), new Set(["pi-a"]), new Set(["pi-a"]));
  assert.equal(next.cards[0].phase, "attention");
  assert.ok(next.order.includes("a"));
});

test("sinking and promoting ignores the composer while preserving every card", () => {
  const next = state();
  moveCard(next, "c", "back");
  assert.deepEqual(next.order, ["a", "b"]);
  moveCard(next, "c", "front");
  moveCard(next, "c", "front");
  assert.deepEqual(next.order, ["a", "b"]);
  assert.equal(next.cards.length, 3);
});

test("detachment is independent of runtime state and closing restores the correct area", () => {
  const next = state();
  next.cards[0].detached = { owner: "tab-1", expiresAt: 100 };
  const running = reconcileQueue(next, new Set(["pi-a"]), new Set(), 50);
  assert.equal(running.cards[0].phase, "working");
  assert.ok(running.cards[0].detached);
  releaseCard(running.cards[0], "tab-1");
  assert.equal(running.cards[0].detached, undefined);
  assert.ok(!running.order.includes("a"));
  const done = reconcileQueue(next, new Set(), new Set(), 101);
  assert.equal(done.cards[0].detached, undefined);
  assert.ok(done.order.includes("a"));
});

test("a late closing tab cannot release a different tab's lease", () => {
  const next = card("a");
  next.detached = { owner: "new-tab", expiresAt: 100 };
  releaseCard(next, "stale-tab");
  assert.equal(next.detached.owner, "new-tab");
});

test("restart reconciliation recovers formerly running sessions for human attention", () => {
  const next = state();
  next.cards[0].phase = "working";
  next.order = ["c", "b"];
  const recovered = reconcileQueue(next, new Set(), new Set());
  assert.equal(recovered.cards[0].phase, "attention");
  assert.deepEqual(recovered.order, ["b", "a"]);
});

test("concurrent tab mutations persist atomically; failed actions and corrupt files do not overwrite data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "card-queue-test-"));
  const previous = process.env.TOPCARD_QUEUE_FILE;
  process.env.TOPCARD_QUEUE_FILE = join(directory, "queue.json");
  try {
    await Promise.all(Array.from({ length: 20 }, (_, index) => withCardQueue(async (state) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      state.cards.push(card(String(index), "draft"));
      state.order.unshift(String(index));
    })));
    const persisted = JSON.parse(await readFile(process.env.TOPCARD_QUEUE_FILE, "utf8"));
    assert.equal(persisted.cards.length, 20);
    assert.equal(new Set(persisted.order).size, 20);
    assert.equal(persisted.revision, 20);
    await assert.rejects(withCardQueue((state) => { state.cards = []; throw new Error("rejected"); }));
    assert.equal((await withCardQueue((state) => state.cards.length)), 20);
    await writeFile(process.env.TOPCARD_QUEUE_FILE, "invalid JSON");
    await assert.rejects(withCardQueue(() => {}));
    assert.equal(await readFile(process.env.TOPCARD_QUEUE_FILE, "utf8"), "invalid JSON");
  } finally {
    if (previous === undefined) delete process.env.TOPCARD_QUEUE_FILE;
    else process.env.TOPCARD_QUEUE_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});


test("changing insertion policy preserves existing queue and manually deferred cards", () => {
  const next = state();
  moveCard(next, "a", "back");
  for (const position of ["top", "bottom"]) {
    next.insertionPosition = position;
    assert.deepEqual(reconcileQueue(next, new Set(), new Set()).order, ["b", "a"]);
  }
});

test("top insertion returns completed work at the front of the attention order", () => {
  const next = state();
  next.insertionPosition = "top";
  const running = reconcileQueue(next, new Set(["pi-a"]), new Set(), 100);
  const done = reconcileQueue(running, new Set(), new Set(), 200);
  assert.deepEqual(done.order.slice(0, 2), ["a", "b"]);
  assert.equal(done.cards[0].readyAt, 200);
  assert.equal(done.insertionPosition, "top");
  assert.equal(reconcileQueue(done, new Set(), new Set(), 300).cards[0].readyAt, 200);
});


test("legacy empty cards collapse to one composer without removing actual sessions", () => {
  const next = state();
  next.cards.push({ ...card("new", "draft"), createdAt: 50 });
  next.order.push("new");
  const result = reconcileQueue(next, new Set(), new Set());
  assert.deepEqual(result.order, ["a", "b"]);
  assert.deepEqual(result.cards.map((card) => card.id), ["a", "b", "new"]);
  for (const position of ["top", "bottom"]) {
    result.insertionPosition = position;
    assert.deepEqual(result.order, ["a", "b"]);
  }
});


test("archived cards keep their session, stay out of polling results, and can be restored", () => {
  const next = state();
  archiveCard(next, "a", 100);
  const reconciled = reconcileQueue(next, new Set(), new Set(), 200);
  assert.equal(reconciled.cards[0].archivedAt, 100);
  assert.equal(reconciled.cards[0].session.id, "pi-a");
  assert.deepEqual(reconciled.order, ["b"]);
  moveCard(reconciled, "a", "front");
  assert.equal(reconciled.cards[0].archivedAt, undefined);
  assert.deepEqual(reconciled.order, ["a", "b"]);
});

test("archived sessions return to Working if resumed elsewhere", () => {
  const next = state();
  archiveCard(next, "a", 100);
  const resumed = reconcileQueue(next, new Set(["pi-a"]), new Set(), 200);
  assert.equal(resumed.cards[0].archivedAt, undefined);
  assert.equal(resumed.cards[0].phase, "working");
  assert.ok(!resumed.order.includes("a"));
  assert.throws(() => archiveCard(resumed, "a"));
  assert.throws(() => archiveCard(next, "c"));
});


test("history excludes queued, running and detached sessions but includes archived and untracked sessions", () => {
  const cards = [card("queued"), card("running", "working"), { ...card("detached"), detached: { owner: "tab", expiresAt: 999 } }, { ...card("archived"), archivedAt: 100 }];
  const sessions = [...cards.map((item) => ({ ...item.session, name: item.id, cwd: "/tmp" })), { id: "pi-external", name: "external", cwd: "/tmp" }];
  assert.deepEqual(filterHistoricalSessions(sessions, cards).map((item) => item.id), ["pi-archived", "pi-external"]);
  assert.deepEqual(filterHistoricalSessions(sessions, cards, "ARCHIVED").map((item) => item.id), ["pi-archived"]);
  delete cards[3].archivedAt;
  assert.deepEqual(filterHistoricalSessions(sessions, cards).map((item) => item.id), ["pi-external"]);
});


test("later swaps only with the next visible card and preserves the pinned draft", () => {
  const next = state();
  next.cards.push(card("d"));
  next.order.push("d");
  deferCard(next, "a");
  assert.deepEqual(next.order, ["b", "a", "d"]);
  deferCard(next, "d");
  deferCard(next, "c");
  assert.deepEqual(next.order, ["b", "a", "d"]);
  next.cards.find((card) => card.id === "a").detached = { owner: "tab", expiresAt: 999 };
  deferCard(next, "b");
  assert.deepEqual(next.order, ["d", "a", "b"]);
});
