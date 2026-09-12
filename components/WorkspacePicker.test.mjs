import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./WorkspacePicker.tsx", import.meta.url), "utf8");
const picker = source.slice(source.indexOf("export function WorkspacePicker"), source.indexOf("export function WorkspaceForm"));
const form = source.slice(source.indexOf("export function WorkspaceForm"));
const css = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
const shell = await readFile(new URL("./CardQueueShell.tsx", import.meta.url), "utf8");

test("pointer hover does not persist as keyboard selection", () => {
  assert.match(picker, /const \[selected, setSelected\] = useState\(-1\)/);
  assert.match(picker, /const \[hovered, setHovered\] = useState<number \| null>\(null\)/);
  assert.match(picker, /onMouseEnter=\{\(\) => setHovered\(i\)\}/);
  assert.match(picker, /onMouseLeave=\{\(\) => setHovered\(null\)\}/);
  assert.doesNotMatch(picker, /onMouseEnter=\{\(\) => setSelected\(i\)\}/);
});

test("keyboard navigation remains available without an initial highlight", () => {
  assert.match(picker, /index < 0 \? 0 : \(index \+ 1\) % visibleMatches\.length/);
  assert.match(picker, /index < 0 \? visibleMatches\.length - 1/);
  assert.match(picker, /visibleMatches\[index < 0 \? 0 : index\]/);
  assert.doesNotMatch(picker, /metaKey|ctrlKey|<kbd>⌘/);
});

test("uses recognizable workspace, machine, and folder icons with readable metadata", () => {
  assert.match(picker, /cq-workspace-group-title[\s\S]*?<WorkspaceMachineIcon name=\{group\.kind === "ssh" \? "remote" : "local"\} size=\{16\}/);
  assert.match(picker, /t\("machines\.remote"\)[\s\S]*?<i>·<\/i>\{group\.host\}/);
  assert.doesNotMatch(picker, /className="cq-workspace-meta-host"><WorkspaceMachineIcon/);
  assert.match(picker, /className="cq-workspace-meta-path"><WorkspaceMachineIcon name="folder" size=\{13\}/);
  assert.match(picker, /className="cq-workspace-weight"[\s\S]*?aria-hidden="true">⚖️<\/span>\{workspace\.defaultConversationWeight \?\? 0\}/);
  assert.doesNotMatch(picker, /workspace\.kind === "ssh" \? "◇" : "▧"/);
  assert.match(css, /\.cq-workspace-text small \{[^}]*font-size: 13px;[^}]*font-weight: 450/);
  assert.match(css, /\.cq-workspace-meta-host \{[^}]*font-size: 14px;[^}]*font-weight: 650/);
  assert.match(css, /\.cq-workspace-weight \{[^}]*margin: 0 9px;[^}]*font-size: 14px;[^}]*font-weight: 650;[^}]*font-variant-numeric: tabular-nums/);
});

test("groups workspaces by machine and supports collapsing host groups", () => {
  assert.match(picker, /const \[collapsedHosts, setCollapsedHosts\] = useState<Set<string>>/);
  assert.match(picker, /workspace\.kind === "local" \? "local" : `ssh:\$\{workspace\.sshHost\}`/);
  assert.match(picker, /className="cq-workspace-group-toggle"[\s\S]*?aria-expanded=\{!collapsed\}/);
  assert.match(picker, /const searching = search\.trim\(\)\.length > 0/);
  assert.match(picker, /visibleMatches = grouped\.flatMap/);
  assert.match(css, /\.cq-workspace-row \{[^}]*width: calc\(100% - 22px\);[^}]*margin-left: 22px/);
  assert.doesNotMatch(picker, /cq-workspace-group-count/);
  assert.match(picker, /className="cq-workspace-group-add"[\s\S]*?name="folder-plus" size=\{26\}[\s\S]*?className="cq-workspace-group-toggle"/);
  assert.match(css, /\.cq-workspace-group-add \{ width: 38px; height: 38px/);
  assert.match(picker, /className="cq-workspace-group-add"[\s\S]*?onAddWorkspace\(group\.machine\)/);
  assert.match(picker, /className="cq-picker-add" onClick=\{onManageHosts\}/);
  assert.match(css, /\.cq-picker-add \{[^}]*justify-content: center;[^}]*text-align: center/);
});

test("confirms workspace removal with the same in-app pattern as archive", () => {
  assert.doesNotMatch(picker, /window\.confirm/);
  assert.match(picker, /className="cq-overlay cq-workspace-remove-backdrop"/);
  assert.match(picker, /className="cq-dialog cq-archive-confirm" role="alertdialog"/);
  assert.match(picker, /t\("queue\.removeWorkspaceDescription", \{ name: removingWorkspace\.name \}\)/);
  assert.match(picker, /className="cq-primary cq-danger"/);
});

test("edits workspace name and default weight without changing its location", () => {
  assert.match(picker, /onUpdate: \(id: string, value: \{ name: string; defaultConversationWeight: number \}\)/);
  assert.match(picker, /className="cq-workspace-edit"[\s\S]*?name="edit"/);
  assert.match(picker, /className="cq-dialog cq-workspace-edit-dialog"/);
  assert.match(picker, /id="edit-workspace-name"/);
  assert.match(picker, /id="edit-workspace-weight"/);
  assert.match(picker, /onUpdate\(editingWorkspace\.workspace\.id/);
  assert.match(shell, /run\("workspace_update", \{ workspaceId, \.\.\.value \}\)/);
});

test("resolves saved remote host ids to user-facing machine names", () => {
  assert.match(picker, /const knownHost = remoteHosts\.find\(\(host\) => host\.id === workspace\.sshHost\)/);
  assert.match(picker, /host: knownHost\?\.name \|\| workspace\.sshHost \|\| "SSH"/);
  assert.doesNotMatch(picker, /host: workspace\.sshHost/);
  assert.match(shell, /<WorkspacePicker workspaces=\{workspaces\} remoteHosts=\{remoteHosts\}/);
});

test("checks a remote workspace connection before opening it and exposes live host status", () => {
  assert.match(picker, /const connectAndSelect = useCallback/);
  assert.match(picker, /action: "test-host", host: host\.id/);
  assert.match(picker, /setConnectingWorkspace\(null\); onSelect\(workspace\.id\)/);
  assert.match(picker, /<SshConnectionWait/);
  assert.match(picker, /<SshAuthChallenge challenge=\{connectionChallenge\}/);
  assert.match(picker, /connectionStatus=\{group\.kind === "ssh"/);
  assert.match(picker, /workspace\.kind !== "ssh"\) \{ onSelect\(workspace\.id\); return; \}/);
});

test("remote connection can be cancelled without freezing the workspace flow", () => {
  assert.match(form, /const connectionController = useRef<AbortController \| null>/);
  assert.match(form, /machineRequest\(\{ action: 'connect',[\s\S]*?\}, controller\.signal\)/);
  assert.match(form, /const close = \(\) => \{ cancelConnection\(\); onClose\(\); \}/);
  assert.match(form, /className="machine-icon-button" disabled=\{busy\}/);
  assert.doesNotMatch(form, /const blocked = busy \|\| loading/);
});

test("workspace creation keeps back navigation in its action row", () => {
  assert.match(form, /const goBack = \(\) =>/);
  assert.match(form, /machine-folder-form[\s\S]*?className="machine-actions"><button[^>]*onClick=\{goBack\}>← \{t\('machines\.back'\)\}<\/button><button[^>]*is-primary/);
  assert.match(form, /<footer className="machine-footer"><span><kbd>Esc<\/kbd> \{t\('machines\.close'\)\}<\/span><\/footer>/);
  const folderForm = form.slice(form.indexOf('className="machine-folder-form"'), form.indexOf('<footer className="machine-footer">'));
  assert.doesNotMatch(folderForm, /t\('machines\.cancel'\)/);
  assert.match(shell, /<WorkspaceForm[\s\S]*?onBack=\{\(\) => \{ setAddingWorkspace\(false\); setCreating\(true\); \}\}/);
  assert.match(form, /entry: RemoteHost \| "local"/);
  assert.doesNotMatch(form, /step === ['"]machine|directMachine|RemoteHostEditor/);
  assert.match(shell, /onManageHosts=\{\(\) => \{ setCreating\(false\); setSettingsSection\("remote-hosts"\); setSettings\(true\); \}\}/);
});

test("host quick-add connects directly and shows a real connection wait state", () => {
  assert.match(form, /const remote = entry === "local" \? null : entry/);
  assert.match(form, /useState\(!!remote\)/);
  assert.match(form, /if \(!remote\) return;[\s\S]*?void connect\(remote\)/);
  assert.doesNotMatch(form, /initialConnectionStarted/);
  assert.match(form, /const awaitingRemoteConnection = !!remote && !cwd/);
  assert.match(form, /className="machine-connection-wait"/);
  assert.match(form, /!awaitingRemoteConnection && <form/);
  assert.match(form, /!loading && !authChallenge[\s\S]*?void connect\(remote\)/);
  assert.doesNotMatch(form, /machine-context[\s\S]{0,250}machines\.changeMachine/);
  assert.match(css, /\.machine-connection-wait \{[^}]*justify-content: center/);
});

test("local folder browsing is presented as a clear full-width action", () => {
  assert.match(form, /className="machine-browse-folder"[\s\S]*?<WorkspaceMachineIcon name="folder" size=\{18\}/);
  assert.match(form, /t\(loading \? 'machines\.pickerWaiting' : 'machines\.browse'\)[\s\S]*?t\('machines\.localHint'\)/);
  assert.match(css, /\.machine-browse-folder \{[^}]*width: 100%;[^}]*padding: 13px 14px/);
  assert.match(css, /\.machine-browse-folder strong \{[^}]*font-size: 13px;[^}]*font-weight: 600/);
});

test("the taller machine dialog keeps its footer at the actual bottom", () => {
  assert.match(css, /\.machine-dialog \{[^}]*height: min\(820px/);
  assert.match(css, /\.machine-body \{ flex: 1;/);
  assert.match(css, /\.machine-dialog \.machine-footer \{[^}]*flex-shrink: 0/);
});

test("remote connection failure stays in the connection wait state with retry", () => {
  assert.match(form, /role=\{localError && !authChallenge \? 'alert' : 'status'\}/);
  assert.match(form, /loading \? t\('machines\.connecting'/);
  assert.match(form, /!loading && !authChallenge[\s\S]*?t\('machines\.retry'\)/);
  assert.match(form, /\{alert && !awaitingRemoteConnection && <p className="machine-error"/);
});
