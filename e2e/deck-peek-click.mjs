import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const cards = [0, 1, 2].map((i) => ({
    id: `peek-${i}`, cwd: "/tmp", phase: "attention", createdAt: i + 1, session: null,
    harness: { kind: "codex", terminalId: `terminal-${i}`, state: "attention", version: "test", title: `卡片 ${i}` },
  }));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === "/api/card-queue") data = { version: 1, revision: 1, sortMode: "fifo", order: cards.map((card) => card.id), cards };
    else if (path === "/api/models") data = { models: [], modelList: [], defaultModel: null };
    else if (path === "/api/agent/running") data = { ids: [] };
    else if (path.endsWith("/events")) {
      await route.fulfill({ contentType: "text/event-stream", body: "data: {\"type\":\"output\",\"data\":\"ready\\r\\n\"}\n\n" });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto(process.env.E2E_BASE_URL || "http://127.0.0.1:30141", { waitUntil: "domcontentloaded" });
  await page.locator('.cq-deck-layer[aria-hidden="false"]').waitFor();

  const frontId = () => page.locator('.cq-deck-layer[aria-hidden="false"]').getAttribute("data-transfer-id");
  assert.equal(await frontId(), "peek-0");
  assert.equal(await page.locator('.cq-deck-layer[data-deck-index="1"] .cq-deck-peek-hit').count(), 1);
  assert.equal(await page.locator('.cq-deck-layer[data-deck-index="2"] .cq-deck-peek-hit').count(), 0);

  await page.locator('.cq-deck-layer[data-deck-index="1"] .cq-deck-peek-hit').click();
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.dataset.transferId === "peek-1");

  await page.locator('.cq-deck-layer[data-deck-index="0"] .cq-deck-peek-hit').click();
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.dataset.transferId === "peek-0");
  assert.equal(await frontId(), "peek-0");
} finally {
  await browser.close();
}
