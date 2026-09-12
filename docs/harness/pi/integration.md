# Pi CLI 终端卡片

2026-09-12，静态依据为本项目安装的 @earendil-works/pi-coding-agent 0.85.1 文档及类型。

- 新会话 Pi 入口仍是原生聊天；CLI 选择区新增 Pi CLI，运行主机自己的 pi 命令，不混用原生 AgentSession wrapper。
- --extension 加载 TopCard 被动扩展；会话身份来自 ctx.sessionManager.getSessionId()，标题来自 getSessionName()，未命名时用第一条输入。
- agent_start 工作；agent_settled 完成。不能使用低层 agent_end，因为后续可能自动重试、压缩或继续。
- session_start / session_info_changed 处理续接和改名；ui_prompt_start / ui_prompt_end 在支持的 Pi 版本上反馈交互等待。
- 继续用 --session <完整 ID>，不是打开 --resume 选择器。Pi CLI 已关联的会话从原生历史选择中过滤，避免重复创建另一张原生 Pi 卡片。
- 要求 Pi >=0.80.4（agent_settled 引入版本）。较新版本才支持 ui_prompt 事件；未给旧版伪造批准状态。
- SSH 同其他插件适配器，远端 Node.js + 独立缓存文件 + OSC 状态回传。
- 按用户要求未运行自动测试/交互测试；尚未实机验证不同版本和三平台行为。

依据：node_modules/@earendil-works/pi-coding-agent/README.md（Session/Resource Options）、docs/extensions.md、dist/core/extensions/types.d.ts、CHANGELOG.md 的 0.80.4 条目。
