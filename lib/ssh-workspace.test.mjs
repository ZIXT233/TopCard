import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { shellQuote, sshLoginExec, sshLoginCommand, createSshWorkspaceExtension } = await jiti.import("./ssh-workspace.ts");

test("SSH shell quoting treats substitution and quotes as literal data", () => {
  assert.equal(shellQuote("a'b$(touch nope)"), `'a'"'"'b$(touch nope)'`);
});

test("Pi's built-in tools dispatch read/write/edit/bash to the remote root through SSH", async () => {
  const root = await mkdtemp(join(tmpdir(), "card-queue-ssh-test-"));
  const oldPath = process.env.PATH;
  try {
    const bin = join(root, "bin"), local = join(root, "local"), remote = join(root, "remote ' $(literal)");
    await Promise.all([mkdir(bin), mkdir(local), mkdir(remote)]);
    // A transport fixture, not a real SSH connection: execute the final SSH
    // command in an isolated temp directory and retain the same argument shape.
    await writeFile(join(bin, "ssh"), '#!/bin/sh\nfor arg do command="$arg"; done\nexec /bin/sh -c "$command"\n', { mode: 0o700 });
    process.env.PATH = `${bin}:${oldPath}`;
    const tools = new Map(), handlers = new Map();
    createSshWorkspaceExtension(local, { sshHost: "test-host", cwd: remote })({ registerTool: (tool) => tools.set(tool.name, tool), on: (name, handler) => handlers.set(name, handler) });
    assert.deepEqual([...tools.keys()].sort(), ["bash", "edit", "find", "grep", "ls", "read", "write"]);
    await tools.get("write").execute("w", { path: "note.txt", content: "hello remote" });
    assert.equal(await readFile(join(remote, "note.txt"), "utf8"), "hello remote");
    await assert.rejects(readFile(join(local, "note.txt")));
    const read = await tools.get("read").execute("r", { path: "note.txt" });
    assert.ok(read.content.some((item) => item.text?.includes("hello remote")));
    await tools.get("edit").execute("e", { path: "note.txt", edits: [{ oldText: "hello remote", newText: "edited remotely" }] });
    assert.equal(await readFile(join(remote, "note.txt"), "utf8"), "edited remotely");
    const bash = await tools.get("bash").execute("b", { command: "pwd" });
    assert.ok(bash.content.some((item) => item.text?.includes(remote)));
    const prompt = await handlers.get("before_agent_start")({ systemPrompt: "base" });
    assert.ok(prompt.systemPrompt.includes("test-host"));
  } finally { process.env.PATH = oldPath; await rm(root, { recursive: true, force: true }); }
});


test("remote CLI probe and launch load the login environment and ignore startup banners", async () => {
  const root = await mkdtemp(join(tmpdir(), "topcard-ssh-login-"));
  const oldPath = process.env.PATH, oldShell = process.env.SHELL;
  try {
    const bin = join(root, 'bin'), userBin = join(root, "user bin's");
    await Promise.all([mkdir(bin), mkdir(userBin)]);
    await writeFile(join(bin, 'ssh'), '#!/bin/sh\nfor arg do command="$arg"; done\nexec /bin/sh -c "$command"\n', { mode: 0o700 });
    const loginShell = join(root, 'login-shell');
    await writeFile(loginShell, `#!/bin/sh\n[ "$1" = "-ilc" ] || exit 7\nprintf 'startup banner\\n'\nexport PATH=${shellQuote(userBin)}:"$PATH"\nexec /bin/sh -c "$2"\n`, { mode: 0o700 });
    await writeFile(join(userBin, 'codex'), '#!/bin/sh\nprintf "fixture-codex:%s" "$1"\n', { mode: 0o700 });
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.SHELL = loginShell;
    assert.equal((await sshLoginExec('fixture', 'codex --version')).toString(), 'fixture-codex:--version');
    const literal = "quotes ' and $(not-a-command)";
    assert.equal((await sshLoginExec('fixture', `exec codex ${shellQuote(literal)}`)).toString(), `fixture-codex:${literal}`);
    assert.ok(sshLoginCommand('exec codex').includes('-ilc'));
    await assert.rejects(sshLoginExec('fixture', 'exit 9'));
  } finally {
    process.env.PATH = oldPath;
    if (oldShell === undefined) delete process.env.SHELL; else process.env.SHELL = oldShell;
    await rm(root, { recursive: true, force: true });
  }
});
