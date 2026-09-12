import assert from "node:assert/strict";
import test from "node:test";
import { latestAssistantReply, queueArrivalSide } from "./queue-arrival.ts";

test("locates an arriving card relative to the current focus", () => {
  const order = ["far-left", "new-left", "focus", "new-right"];
  assert.equal(queueArrivalSide(order, "focus", "new-left"), "left");
  assert.equal(queueArrivalSide(order, "focus", "new-right"), "right");
  assert.equal(queueArrivalSide(order, "focus", "focus"), null);
  assert.equal(queueArrivalSide(order, null, "new-left"), null);
  assert.equal(queueArrivalSide(order, "missing", "new-left"), null);
});

test("extracts only the latest assistant reply after the latest user message", () => {
  const messages = [
    { role: "assistant", content: [{ type: "text", text: "old reply" }] },
    { role: "user", content: "new request" },
    { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "**New** [reply](https://example.com)" }] },
  ];
  assert.equal(latestAssistantReply(messages), "New reply");
  assert.equal(latestAssistantReply([...messages, { role: "user", content: "still waiting" }]), "");
});
