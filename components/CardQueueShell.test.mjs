import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./CardQueueShell.tsx", import.meta.url), "utf8");
const detachedToolsSource = await readFile(new URL("./DetachedCardTools.tsx", import.meta.url), "utf8");
const minimapSource = await readFile(new URL("./CardQueueMinimap.tsx", import.meta.url), "utf8");
const quickSearchSource = await readFile(new URL("./CardQuickSearch.tsx", import.meta.url), "utf8");
const queueCssSource = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
const tagColorSource = await readFile(new URL("../lib/tag-color.ts", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const languageIconSource = await readFile(new URL("./LanguageIcon.tsx", import.meta.url), "utf8");

test("inherits the global theme in both the queue and detached card page", () => {
  assert.doesNotMatch(source, /setThemePreference\("light"\)/);
  assert.match(source, /const \{ preference, setThemePreference \} = useTheme\(\)/);
  assert.match(queueCssSource, /html\.dark \.cq-shell \{[\s\S]*?--cq-paper: #232623;[\s\S]*?color-scheme: dark/);
  assert.match(queueCssSource, /html\.dark \.cq-chat \{[\s\S]*?--bg: var\(--cq-paper\)/);
  assert.match(queueCssSource, /html\.dark \.cq-card-search-field/);
  assert.match(queueCssSource, /html\.dark \.cq-large-card\[data-working-view="true"\]/);
  const darkActionFallback = queueCssSource.match(/html\.dark \.cq-card-actions button \{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(darkActionFallback, /!important/);
  for (const action of ["defer", "popout", "archive"]) {
    assert.match(queueCssSource, new RegExp(`html\\.dark \\.cq-large-card \\.cq-card-actions \\.cq-action-${action}\\s*\\{`));
  }
  assert.match(tagColorSource, /"--tag-hue": String\(hue\)/);
  assert.match(queueCssSource, /html\.dark \.cq-score-chip\[style\] \{[\s\S]*?hsl\(var\(--tag-hue\)/);
  assert.match(queueCssSource, /html\.dark \.cq-score-weight \{/);
  assert.match(queueCssSource, /html\.dark \.cq-score-wait \{/);
});

test("uses a filled enabled notification bell", () => {
  assert.match(source, /name === "bell-filled"[\s\S]*?fill="currentColor"/);
  assert.equal((source.match(/notifications\.enabled \? "bell-filled" : "bell"/g) ?? []).length, 2);
});

test("puts the new-session action first in the mobile sidebar row", () => {
  const sidebar = source.slice(source.indexOf('<aside className="cq-sidebar">'), source.indexOf('<div className="cq-content">'));
  const newSession = sidebar.indexOf('className="cq-new"');
  const mobileSettings = sidebar.indexOf('className="cq-mobile-settings"');
  const mobileNotifications = sidebar.indexOf('cq-mobile-notifications');
  assert.ok(newSession >= 0 && newSession < mobileSettings && mobileSettings < mobileNotifications);
});

test("shows directional queue arrivals and keeps detached completion sounds", () => {
  assert.match(source, /audio: Pick<ReturnType<typeof useAudio>, "soundEnabled" \| "onSoundToggle" \| "playDoneSound" \| "unlockAudio">/);
  assert.match(source, /playDoneSound=\{audio\.playDoneSound\}/);
  assert.match(source, /queueArrivalSide\(orderedIds, focusedId, card\.id\)/);
  assert.match(source, /<QueueArrivalPreview notice=\{arrivalNotice\}/);
  assert.match(source, /playQueueArrivalSound\(arrivalNoticeSide\)/);
  assert.match(source, /setTimeout\(\(\) => setArrivalNotices[\s\S]*?5000\)/);
  assert.doesNotMatch(source, /cq-preemption-hint|cq-preemption-icon|💡/);
  assert.match(queueCssSource, /cq-arrival-left 5s/);
  assert.match(queueCssSource, /cq-arrival-right 5s/);
});

test("orders theme, language, and sorting controls in the content toolbar", () => {
  const toolbarStart = source.indexOf('className="cq-content-toolbar"');
  const themeStart = source.indexOf('aria-label={t("settings.appearance")}', toolbarStart);
  const languageStart = source.indexOf('aria-label={t("common.language")}', toolbarStart);
  const sortingStart = source.indexOf('className="cq-insertion-position"', toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarStart < themeStart && themeStart < languageStart && languageStart < sortingStart);
  assert.match(source, /THEME_OPTIONS\.map\(\(option\)/);
  assert.match(source, /supportedLocales\.map\(\(plugin\)/);
  assert.match(source, /setLocale\(plugin\.id as typeof locale\)/);
  assert.match(source, /<LanguageIcon \/>/);
  assert.match(appShellSource, /<LanguageIcon \/>/);
  assert.match(languageIconSource, /<path d="m5 8 6 6" \/>/);
  assert.match(source, /t\("queue\.先进先出"\)/);
  assert.match(source, /className="cq-toolbar-popover cq-sort-popover"/);
  assert.match(source, /chooseSortMode\("score"\)/);
  assert.match(source, /chooseSortMode\("fifo"\)/);
  assert.match(source, /aria-checked=\{queue\?\.sortMode === "score"\}/);
  assert.match(source, /aria-checked=\{queue\?\.sortMode === "fifo"\}/);
  assert.doesNotMatch(source, /mode:queue\?\.sortMode === "score" \? "fifo" : "score"/);
  assert.doesNotMatch(source, /cq-theme-toggle|cq-mobile-theme/);
  assert.match(queueCssSource, /\.cq-toolbar-menu:hover>\.cq-toolbar-popover,\.cq-toolbar-menu:focus-within>\.cq-toolbar-popover/);
});

test("fresh accepted sessions leave the deck before durable attachment", () => {
  const created = source.slice(
    source.indexOf("  const onCreated = useCallback"),
    source.indexOf("  const onAdopt = useCallback"),
  );

  assert.ok(created.indexOf("finishCard(cardId)") < created.indexOf('run("attach"'));
  assert.ok(created.indexOf("markWorking(cardId, session)") < created.indexOf('run("attach"'));
  assert.match(created, /if \(!result\) \{\s*onRejected\(cardId\);/);
});

test("only individually enabled SSH config hosts appear as workspace choices", () => {
  assert.match(source, /hosts\.filter\(\(host\) => host\.source !== "config" \|\| host\.visible !== false\)/);
  assert.match(source, /window\.addEventListener\("topcard-remote-hosts-changed", refresh\)/);
  assert.match(source, /window\.removeEventListener\("topcard-remote-hosts-changed", refresh\)/);
});

test("fresh submissions leave immediately and can return after rejection", () => {
  const submitted = source.slice(
    source.indexOf("  const onSubmitted = useCallback"),
    source.indexOf("  const onCreated = useCallback"),
  );

  assert.match(submitted, /markWorking\(cardId, undefined, true\)/);
  assert.match(submitted, /requestAnimationFrame\(\(\) => \{[\s\S]*?finishCard\(cardId\)/);
  assert.ok(submitted.indexOf("markWorking(cardId, undefined, true)") < submitted.indexOf("requestAnimationFrame"));
  assert.match(submitted, /cancelAnimationFrame\(frame\)/);
  assert.match(submitted, /rollbackWorking\(cardId\)/);
  assert.match(submitted, /setInspecting\(cardId\)/);
});

test("keeps session tool inspection beside the card title and loads it on demand", () => {
  assert.match(source, /className="cq-title-branches" \/><div className="cq-title-tools"/);
  assert.match(source, /createPortal\([\s\S]*?className="cq-tools-trigger"/);
  assert.match(source, /const opening = !toolsOpen;[\s\S]*?if \(!opening\) return;[\s\S]*?toolsLoaderRef\.current/);
  assert.match(source, /onSystemToolsChange=\{onSystemToolsChange\} onSystemInfoLoaderChange=\{onSystemInfoLoaderChange\}/);
});

test("uses the detached right panel for session tool definitions", () => {
  assert.match(detachedToolsSource, /"file" \| "terminal" \| "tools" \| null/);
  assert.match(detachedToolsSource, /current === "tools" \? null : "tools"/);
  assert.match(detachedToolsSource, /className="cq-task-tools-definitions"/);
  assert.match(source, /detachedTools\.toolsPanelTarget/);
});

test("overlays card tool definitions without moving the conversation", async () => {
  const styles = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
  assert.match(styles, /\.cq-inline-tools \{ position: absolute;/);
  assert.doesNotMatch(styles, /\.cq-inline-tools \{[^}]*flex-shrink/);
});

test("keeps attention scoring in the header, removes its state label, and enlarges the title", async () => {
  const styles = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
  const header = source.slice(source.indexOf("const showScore"), source.indexOf("<SessionCard"));
  const footer = source.slice(source.indexOf("<SessionCard"), source.indexOf("</article>"));
  assert.match(header, /showScore && <div className="cq-score-row">/);
  assert.doesNotMatch(footer, /cq-card-score-footer/);
  assert.doesNotMatch(header, /queue\.轮到你了/);
  assert.match(styles, /\.cq-card-header \{ padding: 25px 28px 21px; border-bottom: 1px solid var\(--cq-line\); \}/);
  assert.match(styles, /\.cq-card-title-row \{[^}]*margin: 6px 0 0 6px;/);
  assert.match(styles, /\.cq-card-header h2 \{ font-size: 22px; \}/);
});

test("keeps the original composer treatment and fades the last 4px of conversation", async () => {
  const styles = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /chat-composer-region/);
  assert.match(styles, /\.cq-chat \[data-conversation-scroll\] \{[^}]*calc\(100% - 4px\)[^}]*transparent 100%/);
});

test("shows only the TopCard product name in the sidebar without the retired copy", () => {
  assert.match(source, /<span className="cq-logo"><Icon name="stack" size=\{21\} \/><\/span>TopCard<\/Link>/);
  assert.doesNotMatch(source, /cq-brand-copy/);
  assert.doesNotMatch(source, /多条思路，一次只关注一张/);
});

test("maps the attention queue to a clickable minimap and marks only the focused card", () => {
  assert.match(source, /cards=\{ready\.map\(\(card\) => \{[\s\S]*?sessionId: card\.session\?\.id,[\s\S]*?title: titleOf\(card\),[\s\S]*?excerpt: card\.session\?\.firstMessage[\s\S]*?host:[\s\S]*?workspace:[\s\S]*?remote:/);
  assert.match(source, /activeIndex=\{inspecting \? -1 : deckIndex\}/);
  assert.match(source, /onSelect=\{selectQueueCard\}/);
  assert.match(minimapSource, /aria-current=\{current \? "true" : undefined\}/);
  assert.match(minimapSource, /if \(event\.detail === 0\) onSelect\(index\)/);
  assert.match(minimapSource, /onMouseEnter=\{\(event\) => showPreview\(index, event\.currentTarget\)\}/);
  assert.match(minimapSource, /className="cq-queue-minimap-preview"/);
  assert.match(minimapSource, /\?tail=8&deferThinking=1&deferMedia=1/);
  assert.match(minimapSource, /Math\.abs\(index - preview\.index\)/);
  assert.match(minimapSource, /`is-near-\$\{proximity\}`/);
});

test("searches all available card surfaces by title and opens their native destination", () => {
  assert.match(source, /working\.map\(\(card\) => \(\{ card, location: "working"/);
  assert.match(source, /ready\.map\(\(card\) => \(\{ card, location: "queue"/);
  assert.match(source, /detached\.map\(\(card\) => \(\{ card, location: "detached"/);
  assert.match(source, /<CardQuickSearch items=\{cardSearchItems\}/);
  assert.match(source, /item\.location === "detached"[\s\S]*?openDetachedCardTab\(item\.id\)/);
  assert.match(source, /item\.location === "working"[\s\S]*?setInspecting\(item\.id\)/);
  assert.match(source, /ready\.findIndex[\s\S]*?selectQueueCard\(index\)/);
  assert.match(quickSearchSource, /fuzzyTitleScore/);
  assert.match(quickSearchSource, /if \(!needle\) return 0/);
  assert.match(quickSearchSource, /role="combobox"/);
  assert.match(quickSearchSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(quickSearchSource, /WorkspaceMachineIcon name=\{item\.remote \? "remote" : "local"\}/);
  assert.match(quickSearchSource, /WorkspaceMachineIcon name="folder"/);
});

test("reuses an already-open detached card tab without navigating it again", () => {
  assert.match(source, /const tab = window\.open\("", name\)/);
  assert.match(source, /current\.searchParams\.get\("card"\) === cardId/);
  assert.match(source, /if \(!alreadyOpen\) tab\.location\.replace\(targetUrl\.href\)/);
  assert.match(source, /tab\.focus\(\)/);
  assert.match(source, /const tab = openDetachedCardTab\(active\.id\)/);
  assert.match(source, /onClick=\{\(\) => openDetachedCardTab\(card\.id\)\}/);
});

test("collapses the sort trigger to an icon when horizontal space is limited", async () => {
  const styles = await readFile(new URL("../app/card-queue.css", import.meta.url), "utf8");
  assert.match(styles, /@media\(max-width:900px\)\{\.cq-content-toolbar \.cq-insertion-position\{[^}]*width:32px;[^}]*min-width:32px;[^}]*max-width:32px;[^}]*gap:0\}\.cq-sort-label\{display:none\}\}/);
});
