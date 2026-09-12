import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { POST, GET } = await jiti.import("./route.ts");

test("workspace creation persists once; new sessions select a workspace and preserve ordering", async () => {
  const root = await mkdtemp(join(tmpdir(), "card-queue-api-test-"));
  const previous = process.env.TOPCARD_QUEUE_FILE;
  process.env.TOPCARD_QUEUE_FILE = join(root, "queue.json");
  const post = async (body) => {
    const response = await POST(new Request("http://127.0.0.1/api/card-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await post({ action: "create", cwd: root })).status, 400);
    const workspace = await post({ action: "workspace_create", name: "Test project", kind: "local", cwd: root });
    assert.equal(workspace.status, 200);
    assert.equal(workspace.data.workspaces.length, 1);
    const workspaceId = workspace.data.workspaces[0].id;
    // Simulate a backend restart: saved workspaces remain, memory-only roots do not.
    const { getAdditionalAllowedRoots } = await jiti.import("../../../lib/allowed-roots.ts");
    const { getAllowedFileRoots, isExistingFilePathAllowed } = await jiti.import("../../../lib/file-access.ts");
    getAdditionalAllowedRoots().delete(root);
    globalThis.__piAllowedRootsCache = undefined;
    assert.equal(isExistingFilePathAllowed(root, await getAllowedFileRoots()), false);
    await GET();
    assert.equal(isExistingFilePathAllowed(root, await getAllowedFileRoots()), true);

    const duplicate = await post({ action: "workspace_create", name: "Duplicate", kind: "local", cwd: root, createCard: true });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.workspaces.length, 1);
    assert.equal(duplicate.data.workspaces[0].id, workspaceId);
    assert.equal(duplicate.data.workspaces[0].name, "Duplicate");
    assert.equal(duplicate.data.cards[0].workspaceId, workspaceId);
    const renamed = await post({ action: "workspace_update", workspaceId, name: "Renamed project", defaultConversationWeight: 17 });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.workspaces[0].name, "Renamed project");
    assert.equal(renamed.data.workspaces[0].defaultConversationWeight, 17);
    const first = await post({ action: "create", workspaceId });
    const second = await post({ action: "create", workspaceId });
    assert.equal(second.data.cards.length, 1);
    assert.equal(second.data.order[0], first.data.order[0]);
    assert.ok(second.data.cards.every((card) => card.workspaceId === workspaceId && card.cwd === root));
    const otherRoot = await mkdtemp(join(root, "other-"));
    const other = await post({ action: "workspace_create", name: "Other project", kind: "local", cwd: otherRoot });
    const otherId = other.data.workspaces.find((workspace) => workspace.cwd === otherRoot).id;
    const replaced = await post({ action: "create", workspaceId: otherId });
    assert.equal(replaced.data.cards.length, 1);
    assert.equal(replaced.data.cards[0].id, first.data.cards[0].id);
    assert.equal(replaced.data.cards[0].workspaceId, otherId);
    assert.equal(replaced.data.cards[0].cwd, otherRoot);
    assert.equal(replaced.data.insertionPosition, "bottom");
    const changed = await post({ action: "insertion_position", position: "top" });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.data.order, replaced.data.order);
    assert.equal(changed.data.insertionPosition, "top");
    assert.equal((await post({ action: "insertion_position", position: "invalid" })).status, 400);
    const reloaded = await (await GET()).json();
    assert.equal(reloaded.insertionPosition, "top");
    assert.deepEqual(reloaded.order, second.data.order);
    assert.equal(JSON.parse(await readFile(process.env.TOPCARD_QUEUE_FILE, "utf8")).workspaces[0].name, "Renamed project");
    const removed = await post({ action: "workspace_remove", workspaceId: otherId });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.workspaces.some((item) => item.id === otherId), false);
    assert.equal(removed.data.cards.some((item) => item.workspaceId === otherId), false);
  } finally {
    if (previous === undefined) delete process.env.TOPCARD_QUEUE_FILE;
    else process.env.TOPCARD_QUEUE_FILE = previous;
    await rm(root, { recursive: true, force: true });
  }
});
