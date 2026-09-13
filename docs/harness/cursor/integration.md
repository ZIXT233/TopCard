# Cursor Agent 终端卡片

2026-09-12；本轮按用户要求未运行自动测试、未启动 CLI/桌面作交互验证。

- 入口为 `cursor-agent`，不启动 Cursor IDE、不扫描任意桌面会话。
- 用 --plugin-dir 加载会话级插件脚本。Cursor TUI 在派发 beforeSubmitPrompt / stop / afterAgentResponse 前只检查 user/project hooks，因此启动时把同一组命令合并进 ~/.cursor/hooks.json（识别并替换 TopCard 自己的条目，保留用户其他 hooks）。Windows 上只调用 node helper（不经 PowerShell/`set`），信号目录靠插件旁的 active.json；没有 TopCard 信号环境时 helper 立刻退出。观察类 hook（含 afterAgentResponse）先写信号再回 JSON，避免 Cursor 收完 stdout 后掐掉进程导致通知拿不到回复摘要。
- active.json 按 conversation_id 路由：新卡片进入 pending，仅 sessionStart 认领；已绑定会话写入 sessions。IDE/其他聊天的 beforeSubmitPrompt 不会抢占 pending，也不会改写本卡片的 providerSessionId。
- 订阅 sessionStart、beforeSubmitPrompt、postToolUse、postToolUseFailure、afterAgentResponse、stop、sessionEnd；使用 conversation_id（回退 session_id）记录身份，--resume <ID> 续接。
- beforeSubmitPrompt 返回 {continue:true}，其他观察事件返回 {}。没有安装会返回 allow 的权限 hooks。普通工具完成不是一轮完成。
- 当前覆盖提交/完成；尚无独立原生 PermissionRequest 适配，批准等待可能仍显示工作中。hook 落盘或 SSH OSC 到达后由 /api/card-queue/events 推送，页面立刻对账；未收到 hook 时显示待确认，不靠输出安静推断完成。
- 标题使用本进程首次收到的 prompt；原会话历史标题和 IDE 内重命名尚未接入读取。切换会话后清旧标题。
- SSH 同样合并远端 ~/.cursor/hooks.json，并用 OSC 回传；需要远端 Node.js。不支持 --plugin-dir 的旧 CLI 需升级。
- Shell 是独立类型，用于本地／远程操作，默认不自动通知，运行超过 300ms 后可手动放入后台并在完成时通知；终端退出仍保留内容、允许重新打开。

## 参考

- https://cursor.com/docs/cli/reference/parameters
- https://cursor.com/docs/hooks
- https://cursor.com/docs/reference/plugins
- Orca MIT 快照 b35791365427f097c134d7d856f31053f8aa399a：src/main/cursor/hook-events.ts、hook-script.ts、hook-service.ts。参考 hook JSON 响应契约及完成事件，未复制其全局配置安装逻辑。许可见 ../codex/ORCA-LICENSE。

## 本轮范围

另已加入 Grok Build、Gemini CLI、OpenCode、Pi CLI；不加入 Copilot 和 Aider。
Grok TUI 使用独立 hooks 文件，不使用仅适用于专用 agent 入口的 --plugin-dir。
