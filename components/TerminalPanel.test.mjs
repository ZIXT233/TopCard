import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createTerminalWriter, terminalRequest } from "../lib/terminal-client.ts";

test("terminal errors preserve server diagnostics and explain non-JSON responses", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const body of [null, "<html>Server error</html>", "null"]) {
    fetch.mock.mockImplementation(async () => new Response(body, { status: 500 }));
    await assert.rejects(terminalRequest("/api/terminal"), /HTTP 500.*TopCard server log/);
  }
  fetch.mock.mockImplementation(async () => Response.json({ error: "Native module missing; run npm rebuild node-pty" }, { status: 500 }));
  await assert.rejects(terminalRequest("/api/terminal"), /Native module missing; run npm rebuild node-pty/);
});

test("a delayed input request cannot be overtaken by typing or resize", async (t) => {
  const received = [];
  let finishFirst;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    received.push(JSON.parse(options.body));
    if (received.length === 1) await new Promise((resolve) => { finishFirst = resolve; });
    return Response.json({ success: true });
  });
  const writer = createTerminalWriter("id", assert.fail);
  writer.write("a");
  writer.resize(100, 30);
  writer.write("b\r");
  await setImmediate();
  assert.equal(received.length, 1);
  finishFirst();
  await setImmediate();
  assert.deepEqual(received, [
    { type: "input", data: "a" },
    { type: "resize", cols: 100, rows: 30 },
    { type: "input", data: "b\r" },
  ]);
  await writer.stop();
});

test("large Unicode pastes preserve characters while bounding input requests", async (t) => {
  const chunks = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    chunks.push(JSON.parse(options.body).data);
    return Response.json({ success: true });
  });
  const writer = createTerminalWriter("id", assert.fail);
  const text = "a".repeat(32767) + "\u{1f600}".repeat(40000);
  writer.write(text);
  await setImmediate();
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 65536 && chunk.isWellFormed()));
  await writer.stop();
});

test("typing during a slow request is batched into the next ordered write", async (t) => {
  const received = [];
  let release;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    received.push(JSON.parse(options.body).data);
    if (received.length === 1) await new Promise((resolve) => { release = resolve; });
    return Response.json({ success: true });
  });
  const writer = createTerminalWriter("id", assert.fail);
  writer.write("first");
  await setImmediate();
  for (const character of "a long command\r") writer.write(character);
  assert.deepEqual(received, ["first"]);
  release();
  await setImmediate();
  assert.deepEqual(received, ["first", "a long command\r"]);
  await writer.stop();
});

test("failed or stopped delivery discards queued input without retrying commands", async (t) => {
  const errors = [];
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "gone" }, { status: 404 }));
  const writer = createTerminalWriter("id", (error) => errors.push(error.message));
  writer.write("first");
  writer.write("second");
  await setImmediate();
  assert.deepEqual(errors, ["gone"]);
  assert.equal(fetch.mock.callCount(), 1);
  await writer.stop();
  writer.write("third");
  await setImmediate();
  assert.equal(fetch.mock.callCount(), 1);
});

test("image upload reserves its place before subsequent text and Enter", async (t) => {
  const received = [];
  let release;
  const file = { type: "image/png", arrayBuffer: () => new Promise((resolve) => { release = resolve; }) };
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    received.push(JSON.parse(options.body));
    return Response.json({ success: true });
  });
  const writer = createTerminalWriter("image-order", assert.fail);
  writer.write("before ");
  writer.pasteImages([file], true);
  writer.write("describe this\r");
  await setImmediate();
  assert.equal(received.length, 1);
  release(new Uint8Array([137, 80, 78, 71]).buffer);
  await setImmediate();
  assert.deepEqual(received.map((body) => body.type), ["input", "images", "input"]);
  assert.equal(received[1].images[0].data, "iVBORw==");
  assert.equal(received[2].data, "describe this\r");
  await writer.stop();
});

test("failed image upload prevents a queued Enter from submitting", async (t) => {
  const received = [];
  const errors = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    received.push(JSON.parse(options.body));
    return Response.json({ error: "SSH upload failed" }, { status: 500 });
  });
  const writer = createTerminalWriter("image-failure", (error) => errors.push(error.message));
  writer.pasteImages([new File(["data"], "test.png", { type: "image/png" })], true);
  writer.write("\r");
  await setImmediate();
  assert.equal(received.length, 1);
  assert.deepEqual(errors, ["SSH upload failed"]);
  await writer.stop();
});

test("closing during clipboard conversion cancels the image request", async (t) => {
  let release;
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ success: true }));
  const writer = createTerminalWriter("image-close", assert.fail);
  writer.pasteImages([{ type: "image/png", arrayBuffer: () => new Promise((resolve) => { release = resolve; }) }], true);
  await setImmediate();
  const stopped = writer.stop();
  release(new Uint8Array([1]).buffer);
  await stopped;
  assert.equal(fetch.mock.callCount(), 0);
});

test("file drop upload cannot be overtaken by Enter and uses multipart bytes", async (t) => {
  const bodies = [];
  let release;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(options.body instanceof FormData ? options.body : JSON.parse(options.body));
    if (options.body instanceof FormData) await new Promise(resolve => { release = resolve; });
    return Response.json({success:true});
  });
  const writer = createTerminalWriter("drop-order", assert.fail);
  writer.pasteFiles([new File(["payload"],"a.txt")],true);
  writer.write("\r");
  await setImmediate();
  assert.equal(bodies.length,1);
  assert.equal(await bodies[0].get("files").text(),"payload");
  release(); await setImmediate();
  assert.equal(bodies[1].data,"\r");
  await writer.stop();
});
