import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelSource = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/settings.css", import.meta.url), "utf8");
const queueStyles = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const shellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const sidebarSource = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const themeSource = await readFile(new URL("../hooks/useTheme.ts", import.meta.url), "utf8");
const themeOptionsSource = await readFile(new URL("../lib/theme.ts", import.meta.url), "utf8");
const enSource = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zhSource = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");
const loginSource = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const remoteHostsSource = await readFile(new URL("./RemoteHostsSettings.tsx", import.meta.url), "utf8");
const machineRouteSource = await readFile(new URL("../app/api/workspace-machines/route.ts", import.meta.url), "utf8");
const sshAuthSource = await readFile(new URL("./SshAuthChallenge.tsx", import.meta.url), "utf8");

test("opens one settings panel from direct sidebar shortcuts", () => {
  assert.match(shellSource, /<SettingsPanel/);
  assert.match(shellSource, /setSettingsSection\(section\)/);
  assert.match(shellSource, /initialSection=\{settingsSection\}/);
  assert.match(shellSource, /translate\("common\.settings"\)/);
  assert.match(shellSource, /<SettingsSectionIcon section=\{section\} size=\{14\} strokeWidth=\{2\} \/>\s*<span>\{label\}<\/span>/);
  assert.match(shellSource, /<SettingsSectionIcon section="general" size=\{14\} strokeWidth=\{2\} \/>/);
  assert.doesNotMatch(shellSource, /\["plugins", translate\("common\.plugins"\)\]/);
  assert.doesNotMatch(shellSource, /setModelsConfigOpen|setSkillsConfigOpen|setAgentsConfigOpen|setPluginsConfigOpen/);
});

test("keeps every requested configuration surface inside the settings panel", () => {
  for (const section of ["general", "models", "skills", "agents", "plugins"]) {
    assert.match(panelSource, new RegExp(`id: "${section}"`));
  }
  for (const component of ["ModelsConfig", "SkillsConfig", "AgentsConfig", "PluginsConfig"]) {
    assert.match(panelSource, new RegExp(`<${component} embedded`));
  }
});

test("groups TopCard settings before Pi settings", () => {
  const sections = panelSource.slice(
    panelSource.indexOf("const sections:"),
    panelSource.indexOf("useEffect(() => setLastSettingsSection"),
  );
  const expected = ["general", "remote-hosts", "models", "skills", "agents", "plugins", "turn-tags"];
  let previous = -1;
  for (const id of expected) {
    const position = sections.indexOf(`id: "${id}"`);
    assert.ok(position > previous, `${id} should follow the preceding settings section`);
    previous = position;
  }
});

test("restores the settings section and each list detail selection", async () => {
  assert.match(shellSource, /getLastSettingsSection\(projectTrustCwd\)/);
  assert.match(panelSource, /setLastSettingsSection\(initialSection\)/);
  assert.match(panelSource, /setLastSettingsSection\(nextSection\)/);
  for (const name of ["ModelsConfig", "SkillsConfig", "AgentsConfig", "PluginsConfig"]) {
    assert.match(
      await readFile(new URL(`./${name}.tsx`, import.meta.url), "utf8"),
      /getLastSettingsSelection/,
    );
  }
});

test("keeps visited settings sections mounted and contains nested Escape handling", async () => {
  const modelsSource = await readFile(new URL("./ModelsConfig.tsx", import.meta.url), "utf8");
  assert.match(panelSource, /mountedSections\.has\(id\)/);
  assert.match(panelSource, /hidden=\{section !== id\}/);
  assert.match(panelSource, /event\.defaultPrevented/);
  assert.match(modelsSource, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onClose\(\);/);
});

test("offers only light, dark, and system theme selection with native radios", () => {
  for (const preference of ["light", "dark", "auto"]) {
    assert.match(themeOptionsSource, new RegExp(`id: "${preference}"`));
  }
  for (const retired of ["mist", "rose", "pine"]) {
    assert.doesNotMatch(themeOptionsSource, new RegExp(`id: "${retired}"`));
  }
  assert.match(panelSource, /THEME_OPTIONS\.map/);
  assert.match(panelSource, /type="radio"/);
  assert.match(panelSource, /setThemePreference\(option\.id\)/);
  assert.match(themeSource, /const setThemePreference = useCallback/);
});

test("groups chat display controls together without row backgrounds", () => {
  const appearanceSection = panelSource.slice(
    panelSource.indexOf('{t("settings.appearance")}'),
    panelSource.indexOf('{t("settings.chat")}'),
  );
  const chatSection = panelSource.slice(
    panelSource.indexOf('{t("settings.chat")}'),
    panelSource.indexOf("{shellSettings?.isWindows"),
  );

  assert.doesNotMatch(appearanceSection, /settings-chat-content/);
  assert.match(chatSection, /className="settings-chat-options"/);
  assert.equal((chatSection.match(/className="settings-chat-option(?: |")/g) ?? []).length, 3);
  assert.equal((chatSection.match(/<ConfigSwitch/g) ?? []).length, 2);
  for (const key of ["thinkingExpandedDefault", "chatContentFontSize", "quoteSelection"]) {
    assert.match(chatSection, new RegExp(`t\\("settings\\.${key}"\\)`));
  }
  assert.doesNotMatch(chatSection, /chatContentWidth|settings-chat-content-width/);
  assert.doesNotMatch(panelSource, /ThinkingIcon|settings-thinking-/);
  const chatOptionStyles = cssSource.match(/\.settings-chat-option \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(chatOptionStyles, /font-size: 12px/);
  assert.doesNotMatch(chatOptionStyles, /background/);
});

test("keeps General free of divider rows", () => {
  assert.match(panelSource, /className="settings-dialog-header"/);
  assert.match(cssSource, /\.settings-dialog-header \{[\s\S]*?display: flex[\s\S]*?align-items: center[\s\S]*?min-height: 68px/);
  assert.doesNotMatch(panelSource, /sections\.find\(\(item\) => item\.id === section\)/);
  assert.doesNotMatch(panelSource, /<section style=\{\{[^}]*borderBottom/);
  assert.doesNotMatch(panelSource, /borderLeft: index > 0/);
});

test("centers General while keeping its scrollbar on the dialog edge", () => {
  assert.match(panelSource, /className=\{`settings-section-host\$\{id === "general" \? " is-general" : ""\}`\}/);
  assert.match(cssSource, /\.settings-section-host\.is-general \{[\s\S]*?overflow-y: auto/);
  assert.match(cssSource, /\.settings-general \{[\s\S]*?max-width: 680px;[\s\S]*?margin: 0 auto/);
  const generalRule = cssSource.match(/\.settings-general \{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(generalRule, /overflow-y/);
});

test("gives the queue-specific settings pages balanced side gutters", () => {
  assert.match(cssSource, /\.turn-tag-settings\{[^}]*max-width:800px;[^}]*margin-inline:auto/);
  assert.match(cssSource, /\.remote-host-settings \{[^}]*max-width: 800px;[^}]*margin-inline: auto/);
});

test("places the SSH port beside the host address before the user field", () => {
  assert.match(remoteHostsSource, /className="machine-field-grid"><label>\{t\('machines\.hostname'\)\}[\s\S]*?<label>\{t\('machines\.port'\)\}[\s\S]*?<\/div>\s*<label>\{t\('machines\.user'\)\}/);
});

test("tests the current SSH form values without collecting or saving credentials", () => {
  assert.doesNotMatch(remoteHostsSource, /type="password"|machines\.password|machines\.passwordHint/);
  assert.match(remoteHostsSource, /machineRequest\(\{ action: 'test', host: \{ hostname, user, port: Number\(port\) \},[\s\S]*?trustedPrompt[\s\S]*?\}, controller\.signal\)/);
  assert.match(remoteHostsSource, /finally \{ if \(testController\.current === controller\) \{[\s\S]*?setTesting\(false\);/);
  assert.match(remoteHostsSource, /machines\.testConnection/);
  assert.match(remoteHostsSource, /machines\.connectionReady/);
  const testBranch = machineRouteSource.slice(
    machineRouteSource.indexOf("body.action === 'test'"),
    machineRouteSource.indexOf("body.action === 'local-folder'"),
  );
  assert.match(testBranch, /PASSWORD_INVALID/);
  assert.match(testBranch, /testSshConnection\([\s\S]*?body\.password,[\s\S]*?body\.trustedPrompt[\s\S]*?req\.signal\)/);
  assert.doesNotMatch(testBranch, /updateHost/);
  const saveRequest = remoteHostsSource.slice(
    remoteHostsSource.indexOf("action: 'save'"),
    remoteHostsSource.indexOf("catch (e) { setError(e); }"),
  );
  assert.doesNotMatch(saveRequest, /password/);
});

test("each SSH config host controls its own visibility", () => {
  assert.match(remoteHostsSource, /host\.source === 'config' && <label className="machine-visibility-toggle"/);
  assert.match(remoteHostsSource, /checked=\{host\.visible !== false\}/);
  assert.match(remoteHostsSource, /action: 'set-visibility', host: host\.id, visible/);
  assert.doesNotMatch(remoteHostsSource, /showConfigHosts|SHOW_SSH_CONFIG_HOSTS_KEY/);
  assert.match(cssSource, /\.machine-visibility-toggle \{[^}]*display: inline-flex/);
});

test("SSH config hosts show their resolved connection target", () => {
  assert.match(remoteHostsSource, /const target = `\$\{host\.user \? `\$\{host\.user\}@` : ''\}\$\{host\.hostname\}/);
  assert.match(remoteHostsSource, /<small>\{target\}\{host\.source === 'config' && <span className="machine-row-source"> · \{t\('machines\.configSource'\)\}<\/span>\}<\/small>/);
});

test("keeps editor test feedback stable and tests hosts directly from the list", () => {
  assert.match(remoteHostsSource, /className=\{`machine-test-status\$\{testError/);
  assert.match(cssSource, /\.machine-test-status \{[^}]*height: 20px;[^}]*overflow: hidden/);
  assert.match(remoteHostsSource, /action: 'test-host', host: host\.id/);
  assert.match(remoteHostsSource, /hosts\.map\(host =>[\s\S]*?machines\.testConnection/);
  assert.match(machineRouteSource, /body\.action === 'test-host'[\s\S]*?connectSsh\(body\.host, body\.password,[\s\S]*?body\.trustedPrompt[\s\S]*?req\.signal\)/);
  assert.match(remoteHostsSource, /const \[testingHosts, setTestingHosts\] = useState<ReadonlySet<string>>/);
  assert.match(remoteHostsSource, /const testing = testingHosts\.has\(host\.id\)/);
  assert.match(remoteHostsSource, /aria-busy=\{testing \|\| undefined\} disabled=\{busy \|\| testing\}/);
  assert.match(remoteHostsSource, /disabled=\{busy\} onClick=\{\(\) => setEditing\(host\)\}/);
  assert.match(remoteHostsSource, /<ConfigButton variant="primary" disabled=\{busy\} type="submit">/);
});

test("remote host icons report the server-side connection state", () => {
  assert.match(machineRouteSource, /hosts\.map\(async host => \(\{ \.\.\.host, connected: await isSshConnected\(host\.id\) \}\)\)/);
  assert.match(remoteHostsSource, /connectionStatus=\{host\.connected \? 'connected' : 'disconnected'\}/);
  assert.match(remoteHostsSource, /setHosts\(current => current\.map\(item => item\.id === host\.id \? \{ \.\.\.item, connected: true \}/);
});

test("reuses one SSH authentication challenge flow for connections and both test entry points", () => {
  assert.match(sshAuthSource, /export function useSshAuthChallenge/);
  assert.match(sshAuthSource, /failure\.code === "HOST_TRUST_REQUIRED"/);
  assert.match(sshAuthSource, /failure\.code === "AUTH_REQUIRED"/);
  assert.match(sshAuthSource, /export function SshAuthChallenge/);
  assert.match(sshAuthSource, /document\.querySelector<HTMLElement>\("\.cq-shell"\) \?\? document\.body/);
  assert.match(sshAuthSource, /machine-auth-backdrop machine-auth-theme/);
  assert.match(queueStyles, /:is\(\.machine-dialog, \.machine-auth-theme\) input/);
  assert.match(remoteHostsSource, /useSshAuthChallenge\(\)/);
  assert.match(remoteHostsSource, /<SshAuthChallenge/g);
});

test("uses Back instead of a redundant Cancel inside the workspace host editor", () => {
  assert.match(remoteHostsSource, /onBack \? `← \$\{t\('machines\.back'\)\}` : t\('machines\.cancel'\)/);
});

test("gives the workspace picker room below its directory popup", async () => {
  assert.match(queueStyles, /\.machine-dialog \{[^}]*height: min\(820px, calc\(100dvh - 48px\)\)/);
});

test("uses scoped top navigation on desktop and a compact section picker on mobile", () => {
  assert.match(panelSource, /className="settings-scope-tabs"/);
  assert.match(panelSource, /settingsScope\(item\.id\) === activeScope/);
  assert.match(panelSource, /className="settings-mobile-section-picker"/);
  assert.match(panelSource, /className="settings-section-tabs"/);
  assert.match(panelSource, /className="settings-section-tab"/);
  assert.match(cssSource, /\.settings-section-tab \{[\s\S]*?width: 102px/);
  assert.match(cssSource, /\.settings-section-icon \{[\s\S]*?flex-shrink: 0/);
  assert.match(cssSource, /\.settings-section-tab::after \{[\s\S]*?width: 24px/);
  assert.match(cssSource, /\.settings-section-tab\[aria-current="page"\]::after/);
  assert.match(cssSource, /\.settings-section-tab:focus-visible:not\(\[aria-current="page"\]\)/);
  assert.match(cssSource, /\.settings-section-tab:focus-visible\[aria-current="page"\][\s\S]*?outline: none/);
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?\.settings-section-tabs \{[\s\S]*?display: none/);
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?\.settings-mobile-section-picker \{[\s\S]*?display: block/);
  assert.doesNotMatch(panelSource, /width: isMobile \? "100%" : 188/);
  assert.match(panelSource, /<main className="settings-dialog-main">/);
  assert.doesNotMatch(panelSource, /<style>/);
  assert.doesNotMatch(panelSource, /style=\{\{/);
});

test("uses the TopCard brand and card-like settings shell", () => {
  assert.match(panelSource, /className="settings-dialog-brand"[\s\S]*?<strong>TopCard<\/strong>/);
  assert.match(cssSource, /\.settings-dialog-surface \{[\s\S]*?border-radius: 22px/);
  assert.match(cssSource, /\.settings-dialog-mark \{[\s\S]*?color: var\(--accent\)/);
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?\.settings-dialog-brand > span:last-child \{ display: none; \}/);
});

test("scopes the TopCard green accent to settings while preserving semantic status colors", () => {
  assert.match(cssSource, /\.settings-dialog-surface \{[\s\S]*?--accent: #6b7d58/);
  assert.match(cssSource, /html\.dark \.settings-dialog-surface \{[\s\S]*?--accent: #b5cba2/);
  assert.match(cssSource, /\.machine-test-status\.is-success \{ color: var\(--success/);
  assert.match(cssSource, /\.machine-test-status\.is-error \{ color: var\(--error/);
});

test("places the sound preview immediately before its enabled-by-default switch", () => {
  assert.match(panelSource, /settings-chat-option-actions[\s\S]*?settings\.previewSound[\s\S]*?<ConfigSwitch checked=\{audio\.soundEnabled\}/);
  assert.match(cssSource, /\.settings-chat-option-actions \{[\s\S]*?display: flex;[\s\S]*?align-items: center/);
});

test("keeps sorting tags in aligned single rows and expands rules below their own column", async () => {
  const tagsSource = await readFile(new URL("./TurnTagSettings.tsx", import.meta.url), "utf8");
  assert.match(tagsSource, /className="turn-tag-columns"/);
  assert.match(tagsSource, /className="turn-tag-rule-toggle"[\s\S]*?aria-expanded/);
  assert.match(tagsSource, /expandedTag === i && <div className="turn-tag-rule-editor"><textarea/);
  assert.match(cssSource, /\.turn-tag-columns,\.turn-tag-row\{display:grid;grid-template-columns:/);
  assert.match(cssSource, /\.turn-tag-rule-editor>:first-child\{grid-column:3/);
});

test("labels agent profiles as sub-agents", () => {
  assert.match(enSource, /"common\.agents": "Sub-agents"/);
  assert.match(enSource, /"agents\.new": "New sub-agent"/);
  assert.match(zhSource, /"common\.agents": "子代理"/);
  assert.match(zhSource, /"agents\.new": "新建子代理"/);
});

test("uses the child-session robot glyph for the sub-agents tab", () => {
  const robotGlyph = /<rect x="5" y="7" width="14" height="11" rx="2" \/>\s*<path d="M9 11h\.01M15 11h\.01M9 15h6M12 7V4M10 4h4" \/>/;
  assert.match(panelSource, robotGlyph);
  assert.match(sidebarSource, robotGlyph);
  assert.match(panelSource, /section === "agents"[\s\S]*?className="settings-section-icon is-agent"/);
  assert.match(cssSource, /\.settings-section-icon\.is-agent \{[\s\S]*?transform: scale\(1\.25\)/);
});

test("uses the compact controls glyph for General", () => {
  assert.match(panelSource, /section === "general"[\s\S]*?<path d="M20 7h-9M14 17H5" \/>[\s\S]*?<circle cx="7" cy="7" r="3" \/>[\s\S]*?<circle cx="17" cy="17" r="3" \/>/);
});

test("keeps password authentication to one login field and one settings action", () => {
  assert.equal((loginSource.match(/type="password"/g) ?? []).length, 1);
  assert.doesNotMatch(loginSource, /type="(?:text|email)"/);
  assert.match(loginSource, /autoComplete="current-password"/);
  assert.match(loginSource, /safeTopCardDestination\(destination, window\.location\.origin\)/);
  assert.match(panelSource, /fetch\("\/api\/web-auth", \{ method: "DELETE" \}\)/);
  assert.match(panelSource, /t\("auth\.logOut"\)/);
  assert.match(loginSource, /className="web-login-composer"[\s\S]*?type="password"[\s\S]*?<button type="submit"/);
  assert.match(globalCssSource, /\.web-login-composer \{[\s\S]*?display: flex;[\s\S]*?border-radius: 14px/);
});
