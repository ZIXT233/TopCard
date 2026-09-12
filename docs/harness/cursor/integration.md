# Cursor Agent 终端卡片

2026-09-12；本轮按用户要求未运行自动测试、未启动 CLI/桌面作交互验证。

- 入口为 `cursor-agent`，不启动 Cursor IDE、不扫描任意桌面会话。
- 用 --plugin-dir 加载 .cursor-plugin/plugin.json + hooks/hooks.json。命令仅在用户选择后探测，原有用户/项目 hooks 不改写。
- 订阅 sessionStart、beforeSubmitPrompt、postToolUse、postToolUseFailure、stop；使用 conversation_id（回退 session_id）记录身份，--resume <ID> 续接。
- beforeSubmitPrompt 返回 {continue:true}，其他观察事件返回 {}。没有安装会返回 allow 的权限 hooks。普通工具完成不是一轮完成。
- 当前覆盖提交/完成；尚无独立原生 PermissionRequest 适配，批准等待可能仍显示工作中。未收到 hook 时显示待确认，不靠输出安静推断完成。
- 标题使用本进程首次收到的 prompt；原会话历史标题和 IDE 内重命名尚未接入读取。切换会话后清旧标题。
- SSH 专用 OSC 回传方案同 Claude，需要远端 Node.js；不写远端全局 hooks.json。不支持 --plugin-dir 的旧 CLI 需升级。
- Shell 是独立类型，用于本地／远程操作，默认不自动通知，运行超过 300ms 后可手动放入后台并在完成时通知；终端退出仍保留内容、允许重新打开。

## 参考

- https://cursor.com/docs/cli/reference/parameters
- https://cursor.com/docs/hooks
- https://cursor.com/docs/reference/plugins
- Orca MIT 快照 b35791365427f097c134d7d856f31053f8aa399a：src/main/cursor/hook-events.ts、hook-script.ts、hook-service.ts。参考 hook JSON 响应契约及完成事件，未复制其全局配置安装逻辑。许可见 ../codex/ORCA-LICENSE。

## 本轮范围

另已加入 Grok Build、Gemini CLI、OpenCode、Pi CLI；不加入 Copilot 和 Aider。
Grok TUI 使用独立 hooks 文件，不使用仅适用于专用 agent 入口的 --plugin-dir。
