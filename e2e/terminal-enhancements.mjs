import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Reuse a healthy dev server; mock only queue ownership, never terminal/file APIs.
const base = process.env.TOPCARD_TEST_URL || "http://127.0.0.1:30141";
const cwd = await mkdtemp(join(tmpdir(), "topcard-drop-e2e-"));
const nested = join(cwd, "nested");
await mkdir(nested);
const id = randomBytes(16).toString("hex");
async function post(path, body) {
  const response = await fetch(base + path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  assert.ok(response.ok, await response.text());
}
await post("/api/cwd/validate", { cwd });
await post("/api/terminal", { id, cwd, cols:100, rows:30 });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport:{width:1440,height:960}, permissions:["clipboard-read","clipboard-write"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => localStorage.setItem("pi-locale","en"));
  const card = { id:"drop-fixture", workspaceId:"fixture-workspace", cwd, session:null, phase:"attention", priorityWeight:0, createdAt:Date.now(), harness:{kind:"shell",terminalId:id,state:"attention",shellCommandNotifications:false} };
  const queue = {version:1,revision:1,cards:[card],order:[card.id],workspaces:[{id:card.workspaceId,cwd,runtimeCwd:cwd,kind:"local",name:"Drop fixture"}]};
  await page.route("**/api/card-queue", route => {
    const body = route.request().postDataJSON();
    if (body?.action === "claim") card.detached = { owner:body.owner,expiresAt:Date.now()+120000 };
    return route.fulfill({json:queue});
  });
  await page.goto(`${base}/?card=${card.id}`, {timeout:120000});
  await page.locator('[data-file-path]').first().waitFor();
  await page.waitForFunction(() => {
    const textarea = document.querySelector('.cq-harness-body .xterm-helper-textarea');
    return textarea && !textarea.disabled;
  });
  assert.equal(await page.locator('.cq-explorer-heading button[aria-label="Upload files"]').count(),0);
  async function drop(locator, name, content) {
    const data = await page.evaluateHandle(({name,content}) => {
      const transfer = new DataTransfer(); transfer.items.add(new File([content],name,{type:"text/plain"})); return transfer;
    },{name,content});
    await locator.dispatchEvent("dragover",{dataTransfer:data});
    await locator.dispatchEvent("drop",{dataTransfer:data});
    await data.dispose();
  }
  const explorer = page.locator(".file-explorer");
  const folder = page.locator(`[data-file-path=${JSON.stringify(nested)}]`);
  await drop(folder,"nested.txt","first version");
  await page.locator(`[data-file-path=${JSON.stringify(join(nested,"nested.txt"))}]`).waitFor();
  assert.equal(await readFile(join(nested,"nested.txt"),"utf8"),"first version");
  await drop(explorer,"root.txt","root payload");
  await page.locator(`[data-file-path=${JSON.stringify(join(cwd,"root.txt"))}]`).waitFor();
  assert.equal(await readFile(join(cwd,"root.txt"),"utf8"),"root payload");
  await drop(folder,"nested.txt","replacement");
  await page.getByRole("button",{name:"Skip existing",exact:true}).click();
  await page.waitForTimeout(250);
  assert.equal(await readFile(join(nested,"nested.txt"),"utf8"),"first version");
  await drop(folder,"nested.txt","replacement");
  await page.getByRole("button",{name:"Replace",exact:true}).click();
  await page.waitForFunction(async path => (await (await fetch('/api/files/'+path.split('/').filter(Boolean).map(encodeURIComponent).join('/')+'?type=download')).text()) === "replacement",join(nested,"nested.txt"));
  assert.equal(await readFile(join(nested,"nested.txt"),"utf8"),"replacement");
  await folder.click({button:"right"});
  await page.getByRole("menuitem",{name:"Upload files here…"}).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("menu").count(),0);
  console.log("PASS: detached explorer drops to root/subfolder, expands folder, preserves skip/replace, context picker, no upload toolbar button.");

  const terminal = page.locator(".cq-harness-body .terminal-xterm-host");
  const upload = page.waitForResponse(r=>r.url().endsWith(`/api/terminal/${id}`)&&r.request().headers()["content-type"]?.startsWith("multipart/form-data"));
  await drop(terminal,"terminal file.txt","terminal bytes");
  assert.equal((await upload).status(),200);
  // Clear the pasted path without executing it, then print searchable output.
  await post(`/api/terminal/${id}`,{type:"input",data:"\x15printf '\\nALPHA_MATCH alpha_match ALPHA_MATCH\\n'\r"});
  await page.waitForFunction(()=>document.querySelector('.xterm-accessibility')?.textContent.includes('ALPHA_MATCH'));
  await page.locator('.cq-harness-body .xterm-helper-textarea').focus();
  await page.keyboard.press("Meta+f");
  await page.getByRole("textbox",{name:"Find in terminal"}).fill("ALPHA_MATCH");
  await page.waitForFunction(()=>document.querySelector('.terminal-find [role=status]')?.textContent !== "0/0");
  await page.getByRole("button",{name:"Match case",exact:true}).click();
  await page.getByRole("button",{name:"Next match",exact:true}).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('.terminal-find').count(),0);
  console.log("PASS: generic file drag uses multipart endpoint; terminal search and match navigation operate on real PTY scrollback.");

  await page.locator('.cq-harness-body .xterm-helper-textarea').focus();
  await page.evaluate(()=>navigator.clipboard.writeText("sentinel"));
  const text = "remote copy 中文 ✓";
  await post(`/api/terminal/${id}`,{type:"input",data:`printf '\\033]52;c;${Buffer.from(text).toString("base64")}\\007'\r`});
  await page.waitForFunction(async expected => await navigator.clipboard.readText() === expected, text);
  await page.evaluate(()=>navigator.clipboard.writeText("keep after replay"));
  await page.reload();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),"keep after replay");
  console.log("PASS: live OSC 52 copies Unicode to the OS clipboard; replay does not overwrite it.");

  const inputs=[];
  await page.route(`**/api/terminal/${id}`,route=>{
    if(route.request().method()==="POST") { inputs.push(route.request().postDataJSON()); return route.fulfill({json:{success:true}}); }
    return route.continue();
  });
  await page.locator('.cq-harness-body .xterm-helper-textarea').focus();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Meta+Backspace");
  await page.keyboard.press("Alt+ArrowLeft");
  await page.waitForTimeout(200);
  assert.equal(inputs.filter(x=>x.type==="input").map(x=>x.data).join(""),"\x1b[13;2u\x15\x1bb");
  assert.deepEqual(errors,[]);
  await page.keyboard.press("Meta+f");
  await page.getByRole("textbox",{name:"Find in terminal"}).fill("ALPHA_MATCH");
  await page.screenshot({path:"/tmp/topcard-terminal-enhancements.png"});
  await page.getByRole("button",{name:"Regular expression",exact:true}).click();
  await page.getByRole("textbox",{name:"Find in terminal"}).fill("[");
  await page.waitForFunction(()=>document.querySelector(".terminal-find input")?.getAttribute("aria-invalid")==="true");
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:"/tmp/topcard-terminal-enhancements-mobile.png"});
  console.log("PASS: modified keys reach the input queue without duplicates or browser errors.");
} finally {
  await browser.close();
  await fetch(`${base}/api/terminal/${id}`,{method:"DELETE"});
  await rm(cwd,{recursive:true,force:true});
}
