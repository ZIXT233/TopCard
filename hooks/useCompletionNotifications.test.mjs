import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { notificationEnabledByDefault } = await jiti.import("../lib/notification-preference.ts");

test("completion notifications default on unless denied or explicitly disabled", () => {
  assert.equal(notificationEnabledByDefault(null, "default"), true);
  assert.equal(notificationEnabledByDefault(null, "granted"), true);
  assert.equal(notificationEnabledByDefault("true", "granted"), true);
  assert.equal(notificationEnabledByDefault("false", "granted"), false);
  assert.equal(notificationEnabledByDefault(null, "denied"), false);
});
