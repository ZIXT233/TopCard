# opencode 集成

通过 OPENCODE_CONFIG_CONTENT 追加状态插件，保留已有配置。插件接收 session.status/idle、权限事件，过滤子会话并兼容两代 SDK session.get 调用。续接使用 --session。

来源、更新步骤与限制见 [Orca 对照表](../ORCA-UPSTREAM.md)。本轮仅构建，未运行测试或 CLI 交互验证。
