# Orca 复用与更新边界

上游：https://github.com/stablyai/orca
本轮参考提交：`b35791365427f097c134d7d856f31053f8aa399a`（MIT）。
许可证保存在 `../../bin/shell/ORCA-LICENSE`。

## 对应关系

| Orca 源文件 | TopCard 适配位置 | 保留／差异 |
| --- | --- | --- |
| Shell wrapper 的 zsh preexec/precmd 集成 | `bin/shell/zsh-integration.sh` | OSC 133 C/D 生命周期，保留用户 hooks |
| `powershell-osc133-bootstrap.ts` | `bin/shell/powershell-integration.ps1` | 保留 prompt/readline 包装，去除 Orca 自有环境和预检 |
| `src/main/claude/hook-settings.ts` | `lib/harness/hook-launch.ts` | 生命周期事件；采用会话级插件目录 |
| `src/main/cursor/hook-events.ts`, `hook-script.ts`, `hook-service.ts` | `lib/harness/hook-launch.ts`, `bin/harness-hook.cjs` | 事件及响应格式；不自动批准工具 |
| `src/main/grok/grok-hook-config.ts`, `grok-hook-config-file.ts` | `lib/harness/hook-launch.ts`, `bin/harness-hook.cjs` | 独立全局 hooks 文件，兼容大小写字段；不是 TUI --plugin-dir |
| `src/main/gemini/hook-service.ts` | `lib/harness/hook-launch.ts` | hooks 生命周期；保留原系统默认配置后追加 |

Pi CLI 使用 Pi 原生 extension 事件，完成边界为 agent_settled。TopCard 原生 Pi 会话不受影响。

## 同步步骤

1. 固定新 Orca commit，按上表查看旧新提交差异，先更新对应脚本和事件契约。
2. 保留 MIT 许可及脚本来源注释，记录新 commit 和本地必要差异。
3. 本地信号文件、SSH 专用 OSC 回传属于 TopCard 传输层；避免混入上游业务状态实现。
4. TopCard 独有调度留在 HarnessCard、runtime 和 card-completion：普通 Shell 默认留在卡片队列，命令运行 300ms 后仅显示“放入后台并通知”，点击才进入工作区，完成后返回并通知。
5. 更新后应验证启动、完成、权限等待、resume、退出及 SSH；本轮遵照用户要求未运行测试，也未启动各 CLI 实测。

## 当前边界

- Cursor 未接独立权限等待事件，等待批准可能仍显示工作中。
- Shell 后台通知支持 Bash、zsh、Windows PowerShell；Bash 使用 TopCard 精简探针，不继续同步 Orca 的完整 Bash 兼容实现；远端 Shell 探针不依赖 Node，其他远端适配依赖 Node。
- Grok 的 TopCard 专用 hooks 文件仅在选择并检测到 Grok 后安装；没有 TopCard 信号环境时不回传。
- Gemini 上层配置／组织策略仍优先；OpenCode 保留已有运行时配置并追加插件。
- 本轮入口：Codex、Claude Code、Cursor Agent、Pi CLI、Grok Build、Gemini CLI、OpenCode、Shell。不包含 Copilot、Aider。
