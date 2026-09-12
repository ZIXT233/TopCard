# grok 集成

使用独立的 ~/.grok/hooks/topcard-session-state.json（尊重 GROK_HOME），保留用户其他 hooks。仅覆盖带 TopCard 所有权标记的文件。兼容 camelCase/PascalCase 事件字段；使用 --resume 指定会话。TUI 不使用 agent 入口的 --plugin-dir。

来源、更新步骤与限制见 [Orca 对照表](../ORCA-UPSTREAM.md)。本轮仅构建，未运行测试或 CLI 交互验证。
