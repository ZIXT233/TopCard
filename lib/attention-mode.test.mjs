import assert from "node:assert/strict";
import test from "node:test";
import {
  attentionModeFromStorage,
  isAttentionMode,
  shouldQuietRearQueueArrival,
} from "./attention-mode.ts";

test("attention mode defaults to daily and rejects unknown values", () => {
  assert.equal(attentionModeFromStorage(null), "daily");
  assert.equal(attentionModeFromStorage("focus"), "focus");
  assert.equal(attentionModeFromStorage("daily"), "daily");
  assert.equal(attentionModeFromStorage("other"), "daily");
  assert.equal(isAttentionMode("focus"), true);
  assert.equal(isAttentionMode("nope"), false);
});

test("focus mode quiets only rear arrivals while the page is visible", () => {
  assert.equal(shouldQuietRearQueueArrival("daily", "right", "visible"), false);
  assert.equal(shouldQuietRearQueueArrival("daily", "left", "visible"), false);
  assert.equal(shouldQuietRearQueueArrival("focus", "right", "visible"), true);
  assert.equal(shouldQuietRearQueueArrival("focus", "left", "visible"), false);
  assert.equal(shouldQuietRearQueueArrival("focus", "right", "hidden"), false);
});
