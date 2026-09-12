# Codex 终端卡片：Orca / cmux 探针核实

核实日期：2026-09-12。静态源码核实，不等同于跨平台运行验证。

## 源码快照

- Orca `b35791365427f097c134d7d856f31053f8aa399a`，MIT。
- cmux `e9ec596d12d854d6569b53b38bb21b62f8126d56`，根 LICENSE 为 GPL-3.0-or-later；具体文件还需检查自身声明。
- 临时只读研究 checkout：`/tmp/topcard-research-orca`、`/tmp/topcard-research-cmux`。

## Orca 实际行为

不是单一标题正则。它维护 hooks 安装/信任检查、事件归一化、终端标题识别、远程 relay、退出身份清理、状态恢复和补报。

`src/main/codex/codex-hook-definition.ts` 安装 SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、SubagentStart、SubagentStop、Stop。

`src/shared/agent-hook-listener/providers/codex-events.ts` 映射：

| 信号 | Orca 状态 |
| --- | --- |
| SessionStart、UserPromptSubmit、普通 PreToolUse、PostToolUse | working |
| PermissionRequest | waiting |
| request_user_input 等提问工具的 PreToolUse | waiting |
| Stop | done，再结合子 agent 状态聚合 |

因此 PostToolUse 不是一轮完成；子 agent 的 Stop 也不能直接把父卡片标成完成。Orca 还用 transcript 补充子 agent roster，完整实现已超过 TopCard 只观察终端主会话的最小范围。

`src/shared/agent-title-status.ts` 另有标题识别和状态转换跟踪。不能把整个 Orca 简化为“只用 hooks”或“只看标题”，也不应假设所有信号简单按最后到达覆盖。

`src/main/codex/codex-hook-script.ts` 每次 hook 读取当前 endpoint 文件，通过带令牌的 HTTP 上报；POSIX 路径含连接/总耗时限制，失败进入 spool。`codex-hook-status.ts` 区分 installed / partial / error，包括事件缺失、禁用和 trust hash 失效。安装文件存在不等于探针可用。

## cmux 实际行为

`Resources/bin/cmux-codex-wrapper` 为被 cmux 管理的终端按单次启动补充缺失 hooks，携带真实 surface 身份；说明要求失败时继续运行真正的 Codex。

`docs/agent-hooks.md` 说明会话层 `-c hooks.<event>=...` 与用户/项目 hooks 分层加载，不应复制已有用户 hooks 导致双重执行。其回归测试 `tests/test_codex_wrapper_hook_append.py` 使用本地假模型提供方验证真实 Codex 行为。

当前 wrapper 注入时使用 `--dangerously-bypass-hook-trust`：它跳过整个进程的 hook 审核，包含用户/项目 hooks。TopCard 不直接照搬这个开关。原生 CLI 的权限批准应继续交给用户。

## TopCard 框架决策

当前 `cli` 分支已接入原卡片布局、xterm.js / node-pty、hooks 和 OSC 探针。下述为实现边界。

1. PTY 生命周期、agent 工作状态、探针健康分别记录。进程活着不等于 working；没有新事件不等于 done。
2. 以已验证的原生 hooks 表达提交/工具/批准/完成，用标题信号补足实时 TUI 状态。来源、启动代次、provider session id、事件时间必须保留，旧进程迟到事件不能修改新进程卡片。
3. 保持原生终端输入和批准；探针只报告，不返回批准决定。
4. 检查 hook 实际握手，不只检查安装/版本。失效时保留可操作卡片并显示未知或探针异常，不能假装完成。
5. 复用优先考虑 Orca 的 MIT 模块和边界测试，记录上游 commit/许可；cmux 参考入口、配置合并和测试办法，暂不直接复制代码。
6. 仍需真实验证：正常问答、工具执行、权限批准、提问、Esc 中断、连续两轮、hook 不触发、刷新/卡片切换、退出、旧事件、远程断线。三平台分别报告验证结果。

TopCard 仅为自己启动的 Codex 注入会话级 hooks 和标题配置，没有安装 Orca/cmux，也没有改写用户全局 Codex 配置。

## 来源

- https://www.onorca.dev/docs/agents/hooks-memory
- https://github.com/stablyai/orca/blob/b35791365427f097c134d7d856f31053f8aa399a/src/main/codex/codex-hook-definition.ts
- https://github.com/stablyai/orca/blob/b35791365427f097c134d7d856f31053f8aa399a/src/shared/agent-hook-listener/providers/codex-events.ts
- https://github.com/stablyai/orca/blob/b35791365427f097c134d7d856f31053f8aa399a/src/shared/agent-title-status.ts
- https://github.com/stablyai/orca/blob/b35791365427f097c134d7d856f31053f8aa399a/src/main/codex/codex-hook-script.ts
- https://github.com/manaflow-ai/cmux/blob/e9ec596d12d854d6569b53b38bb21b62f8126d56/docs/agent-hooks.md
- https://github.com/manaflow-ai/cmux/blob/e9ec596d12d854d6569b53b38bb21b62f8126d56/Resources/bin/cmux-codex-wrapper


## Resume 身份核实与本轮验证

Orca 的 `src/shared/agent-hook-listener.ts` 从主会话 hook 提取 providerSession，排除带 agent_id 的 Codex 子会话；`agent-session-resume.ts` 从 session_id / transcript_path 保存身份，并构造 `codex resume <id>`。并非解析用户键入的 /resume 字符串。SessionStart 会清理窗格旧的子 agent 跟踪状态。以上是该源码快照的静态结论，不等于已实测 Orca 所有版本的 /resume 行为。

TopCard 同样优先接收主会话 hook 的完整 ID。Codex 0.154.0 的 OSC session-id 被截成 29 字符加省略号，补充路径仅通过本机 session_index 和会话文件名作唯一匹配，零个或多个匹配都不猜 ID、不允许误续接；不读取对话正文。会话身份改变时清掉旧标题，重新读取标题索引。CLI 子命令的配置参数必须放到 resume 子命令之后，否则本次实测中标题配置丢失。

macOS / Codex 0.154.0 实测：两轮问答、一次 pwd 权限请求、归档后输出回看、继续原会话保留 ID/标题/前两轮、终端内 /new 清除旧身份、/resume 返回原会话恢复 ID 和标题。空新会话尚未落盘时可能暂时没有可验证 ID。Solarized Light/Dark、卡片外纵向 Pi/CLI 开关、原归档图标均已接入。浏览器实际 wheel 验证：鼠标位于 xterm 时横向滚动使卡片 scroller 从 0 到 765，纵向仍由终端处理。

尚未实机验证 Linux/Windows；SSH 目前只有标题状态探针，不能在本地解析远端截断 ID。终端保存的是有界原始输出回放（128 KiB），不是完整 xterm 屏幕序列化。已启动的旧 CLI 进程不会因前端更新被强制重启，新的启动参数在下次启动/继续会话时生效。

## 2026-09-13：SSH hooks 与启动并发修复

SSH Codex 现在也通过 `prepareHookLaunch()` 注入六类会话级 hooks，远端需要 Node.js 和支持 hooks 的 Codex。远端脚本把带启动令牌的 OSC 777 事件写入启动时记录的 PTY，随 SSH 输出进入本地探针；不另开端口，不修改用户全局 Codex 配置。安装失败会明确报错，安装成功不等于 hooks 已获信任或已触发。

Codex 远端脚本按内容哈希存放，避免每次启动令牌变化都改变 hook 命令。首次或脚本变化后，按 CLI 提示通过 `/hooks` 审核；不使用跳过信任的启动选项。实际 hook 到达前继续用标题探测，到达后以 hooks 为准。官方信任说明：https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks 。此前“SSH 目前只有标题状态探针”的说明仅适用于旧实现及尚未确认 hooks 的运行实例。

标题的截断 ID 如果匹配已有完整 ID，就保留该 ID；如果指向其他会话则清掉旧 ID，避免误续接。新远端会话的完整 ID 由实际 hook 提供，不能从本机索引猜测。

CLI 启动拆成锁内捕获、锁外启动、锁内校验提交。同卡片并发启动被拒绝，其他卡片可以读写。启动期间卡片被删除、被原生会话占用、切换工作区或归档状态变化，会拒绝提交并清理新 PTY；写盘失败同样清理，恢复启动失败保留原会话。

验证：回归测试覆盖远程 hook 配置、真实 helper 执行与分块解析、匹配/不匹配身份、队列并发和失败清理。现有 Linux VM 上实际 SSH PTY 传输收到 Stop、完整 ID 和摘要，临时脚本随后删除；该 VM 未安装 Codex，因此此次未完成真实远程 Codex 问答、权限、断线与恢复的端到端验收。已运行的 CLI 需要下次启动/续接才能使用新参数。
