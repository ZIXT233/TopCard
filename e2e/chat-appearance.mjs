import assert from "node:assert/strict";

export async function checkChatAppearanceReset(page) {
  const fontSize = page.getByRole("slider", { name: "Chat font size", exact: true });
  const resetFontSize = page.getByRole("button", { name: "Reset chat font size", exact: true });
  await fontSize.press("End");
  await resetFontSize.click();
  assert.equal(await fontSize.inputValue(), "14");
  assert.deepEqual(await page.evaluate(() => ({
    fontSize: localStorage.getItem("pi-chat-content-font-size"),
    appliedFontSize: document.documentElement.style.getPropertyValue("--chat-content-font-size"),
  })), { fontSize: "14", appliedFontSize: "14px" });
  await page.reload({ waitUntil: "networkidle" });
  const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
  if (await showSidebar.isVisible()) await showSidebar.click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await fontSize.inputValue(), "14");
  assert.equal(await resetFontSize.isDisabled(), true);
}

export async function checkChatAppearance(page) {
  await page.setViewportSize({ width: 2560, height: 1100 });
  const textarea = page.locator(".chat-input-textarea");
  const openSettings = () => page.getByRole("button", { name: "Settings", exact: true }).click();
  const closeSettings = () => page.keyboard.press("Escape");
  const fontSize = page.getByRole("slider", { name: "Chat font size", exact: true });
  const font = (locator) => locator.evaluate((el) => getComputedStyle(el).fontSize);
  const fittedHeight = async () => {
    await page.waitForFunction(() => {
      const input = document.querySelector(".chat-input-textarea");
      return input && (input.scrollHeight <= input.clientHeight + 1 || input.clientHeight >= 199);
    });
    return textarea.evaluate((el) => el.clientHeight);
  };

  await openSettings();
  assert.equal(await fontSize.inputValue(), "14");
  await closeSettings();
  const draft = "Existing drafts resize when the reading font changes. ".repeat(6);
  await textarea.fill(draft);
  const defaultHeight = await fittedHeight();

  await openSettings();
  await fontSize.press("End");
  await closeSettings();
  assert.ok(await fittedHeight() > defaultHeight, "Increasing the font must grow the draft");
  await openSettings();
  await fontSize.press("Home");
  for (let i = 12; i < 18; i++) await fontSize.press("ArrowRight");
  await closeSettings();
  assert.equal(await textarea.inputValue(), draft);
  assert.ok(await fittedHeight() < narrowHeight, "Widening must shrink the existing draft");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".markdown-code-block pre").waitFor();
  assert.equal(await font(textarea), "18px");
  assert.equal(await font(page.locator(".markdown-user-message")), "18px");
  assert.equal(await font(page.locator(".markdown-code-block pre")), "16.5px");

  await openSettings();
  assert.equal(await fontSize.inputValue(), "18");
  await checkChatAppearanceReset(page);
  for (const viewport of [{ width: 1280, height: 600 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.locator(".settings-general").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    assert.equal(await page.locator(".settings-language-options button:last-child").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), true, "Every language option must remain reachable in a short settings panel");
  }
  await fontSize.press("Home");
  await closeSettings();
  assert.equal(await font(textarea), "16px", "Mobile inputs retain the focus-zoom minimum");
  await textarea.fill("A mobile draft wraps and resizes within the available space.");
  await fittedHeight();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("PASS: chat appearance persistence, typography, draft resizing, and short settings panels");
}
