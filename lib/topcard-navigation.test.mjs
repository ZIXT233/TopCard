import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { safeTopCardDestination } = await jiti.import("./topcard-navigation.ts");
const origin = "https://topcard.test";

test("keeps only TopCard home card and session destinations", () => {
  assert.equal(safeTopCardDestination("/", origin), "/");
  assert.equal(safeTopCardDestination("/?card=card 1", origin), "/?card=card+1");
  assert.equal(safeTopCardDestination("/?session=session-1", origin), "/?session=session-1");
});

test("rejects routes and query shapes outside the TopCard loop", () => {
  for (const destination of [
    "/workspace",
    "/login",
    "//example.com/",
    "https://example.com/",
    "/?card=one&session=two",
    "/?card=",
    "/?other=value",
    "/?card=one#outside",
  ]) assert.equal(safeTopCardDestination(destination, origin), "/");
});
