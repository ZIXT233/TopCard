import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { getDraft, setDraft, clearDraft, rekeyDraft } = await jiti.import("./draft-store.ts");

test("drafts survive page reload and cross-tab transfer; clearing is visible to the old page", () => {
  const storage = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } };
  try {
    setDraft("draft", { value: "unsent thought", images: [] });
    assert.equal(getDraft("draft").value, "unsent thought");
    // Simulate an independent page changing and then clearing the same draft.
    storage.set("topcard:draft:draft", JSON.stringify({ value: "from detached tab", images: [] }));
    assert.equal(getDraft("draft").value, "from detached tab");
    rekeyDraft("draft", "real-pi-session");
    assert.equal(getDraft("draft"), null);
    assert.equal(getDraft("real-pi-session").value, "from detached tab");
    storage.delete("topcard:draft:real-pi-session");
    assert.equal(getDraft("real-pi-session"), null);
  } finally { delete globalThis.window; clearDraft("draft"); clearDraft("real-pi-session"); }
});

test("blocked browser storage retains the in-page fallback", () => {
  globalThis.window = { get localStorage() { throw new Error("storage unavailable"); } };
  try {
    setDraft("blocked", { value: "keep this", images: [] });
    assert.equal(getDraft("blocked").value, "keep this");
    clearDraft("blocked");
    assert.equal(getDraft("blocked"), null);
  } finally { delete globalThis.window; }
});
