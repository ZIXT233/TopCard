import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeAuthPath,
  claudeHarnessEnv,
  readClaudeHarnessAuth,
  writeClaudeHarnessAuth,
} from "./claude-auth.ts";

test("stores a relay Anthropic key and maps it to Claude Code env", async () => {
  const root = await mkdtemp(join(tmpdir(), "topcard-claude-auth-"));
  const auth = await writeClaudeHarnessAuth({
    apiKey: " sk-relay-test ",
    baseUrl: "https://relay.example.com/v1/",
  }, root);
  assert.deepEqual(auth, { apiKey: "sk-relay-test", baseUrl: "https://relay.example.com/v1" });
  assert.deepEqual(await readClaudeHarnessAuth(root), auth);
  assert.match(await readFile(claudeAuthPath(root), "utf8"), /sk-relay-test/);
  assert.deepEqual(claudeHarnessEnv(auth), {
    ANTHROPIC_API_KEY: "sk-relay-test",
    ANTHROPIC_BASE_URL: "https://relay.example.com/v1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  });
});

test("keeps an existing key when only the base URL is updated", async () => {
  const root = await mkdtemp(join(tmpdir(), "topcard-claude-auth-"));
  await writeClaudeHarnessAuth({ apiKey: "sk-keep", baseUrl: "https://old.example" }, root);
  const next = await writeClaudeHarnessAuth({ baseUrl: "https://new.example" }, root);
  assert.equal(next.apiKey, "sk-keep");
  assert.equal(next.baseUrl, "https://new.example");
  assert.deepEqual(claudeHarnessEnv({}), {});
});
