# shell 集成

复用 Orca 的 OSC 133 Shell 集成，保留用户 prompt/hooks。命令默认不进入工作队列；运行超过 300ms 显示“放入后台并通知”，用户点击才进入工作区，收到命令完成标记后回卡片并通知。不用输出静默推断完成。后台通知支持 Bash/zsh/Windows PowerShell。Bash 使用 TopCard 的精简 DEBUG/PROMPT_COMMAND 探针，保留已有钩子；不覆盖用户配置文件。其他 Shell 普通启动，不安装探针。

来源、更新步骤与限制见 [Orca 对照表](../ORCA-UPSTREAM.md)。本轮仅构建，未运行测试或 CLI 交互验证。
