# Claude Code 终端卡片

2026-09-12；本轮按用户要求未运行自动测试、未启动 CLI/桌面作交互验证。

- 入口：本机或 SSH 工作区运行 `claude`；只在用户选择后检查命令。
- 当前实现通过 `--plugin-dir` 加载 TopCard 自有的会话级插件，不写用户或项目 settings.json，不覆盖已有 statusLine，不增加权限绕过参数。
- SessionStart 提供身份；UserPromptSubmit / 工具事件提供 working；PermissionRequest、AskUserQuestion、Stop / StopFailure 提供需用户关注状态。忽略 agent_id 子 agent 事件。
- hook 捕获 session_id；继续按钮传 `--resume <完整 ID>`。在终端内 resume 后，以后续 hook 的身份更新卡片，不分析用户输入命令。
- 标题优先使用 hook 指向的 transcript 尾部 custom-title，否则使用本进程首次捕获的用户 prompt。尚未从 transcript 历史恢复自动标题的所有格式；无标题时仍使用新会话占位。
- 本地按启动独立目录落事件；远程把只读事件脚本部署到 ~/.cache/topcard/harness/<launch>，经 /dev/tty 的专用 OSC 回传，不把 hook stdout 注入模型上下文。远端需要 Node.js。
- 未收到 hook 不猜完成；正常交互、批准/中断、resume、Windows Git Bash、SSH 仍待实机验证。旧版 CLI 不支持 --plugin-dir 时需更新 CLI。

## 参考

- https://code.claude.com/docs/en/cli-reference （--plugin-dir、--resume）
- https://code.claude.com/docs/en/hooks-guide
- Orca MIT 快照 b35791365427f097c134d7d856f31053f8aa399a：src/main/claude/hook-settings.ts。参考生命周期边界；没有复制 Orca 的全局 hook 安装器或权限绕过策略。许可见 ../codex/ORCA-LICENSE。
