# TopCard

**Just handle the top card.**

[English](README.md) · 简体中文

TopCard 是一个面向多会话的注意力调度队列。让多个 Agent 并行工作，让你一次只需处理眼前的一张卡片。

支持主流 CLI Harness 和 Pi 原生会话，将不同 Agent 的工作汇入同一处，方便你审阅、回复和推进。

## 为什么是队列？

并行运行更多 Agent，不应该意味着盯着更多终端。真正稀缺的是你的注意力：审阅结果、回答问题，以及决定下一步。

TopCard 将正在执行的工作与需要你处理的工作分开。执行中的会话放在 **Working**，需要关注的卡片进入队列。后台完成的卡片排到队尾，不会抢走你正在阅读的位置。

- **一次专注一张卡片。** 阅读结果、回复，或决定接下来怎么做。
- **让工作持续推进。** 将会话送回执行状态，接着处理下一张。
- **主动决定稍后处理。** 暂时不处理的卡片可以下沉；浏览卡片不会改变队列顺序。
- **保留上下文。** 需要深入处理时，在独立窗口打开卡片，之后再回到队列。
- **清理注意力队列。** 标记已处理只移出卡片，不删除底层会话。

## Agent 工作方式

| 方式 | 使用体验 |
| --- | --- |
| CLI Harness | 在内嵌终端中运行 Codex、Claude Code、Cursor Agent、Pi CLI、Grok Build、Antigravity CLI 和 OpenCode，由 Harness 集成将状态反馈给队列。 |
| Pi 原生会话 | 直接在卡片中对话，支持流式回复、工具输出、模型选择、引导、压缩和分支。 |
| Shell | 普通终端，提供命令完成通知；不接入 Harness 通知探针。 |

CLI 工具需要在实际运行的机器上安装并完成认证。状态反馈取决于各 Harness 的具体集成，能打开终端不代表所有工具都具有相同的生命周期支持。

工作区可以使用本机或 SSH 目录。远程 CLI 在远端主机运行，并加载用户的交互登录 Shell 环境，包括 NVM 等工具配置的路径。Pi 原生会话使用本机模型凭证，通过 SSH 执行工作区工具；不会自动加载远端的 Pi 凭证、技能或扩展，远程文件与 Git 面板尚未完全接通。

## 开始使用

在应用中添加工作区，创建卡片，选择 CLI Harness 或 Pi 原生会话。也可以将已有 Pi 会话接入队列。`Cmd/Ctrl + J` 打开创建窗口，`Cmd/Ctrl + ]` 将当前卡片放到队尾。

### npm（浏览器）

需要 **Node.js >= 22.19.0**：

```bash
npm install -g topcard
topcard
```

打开 [http://127.0.0.1:30141](http://127.0.0.1:30141)。这是与 Electron 安装包并列的第二种发行方式；不包含桌面托盘与独立卡片窗口。

### 从源码开发

```bash
npm ci
npm run dev
```

打开 [http://127.0.0.1:30141](http://127.0.0.1:30141)。如果已有健康的开发服务，直接复用，不要在同一目录启动第二个服务。

开发桌面版时，保持上述服务运行，在另一个终端执行：

```bash
npm run desktop:dev
```

Pi 原生会话使用现有 `~/.pi/agent` 中的配置、凭证和会话。可用 `PI_CODING_AGENT_DIR` 指定独立数据目录，也可以在应用设置中配置模型服务。

## 构建

### 桌面安装包

执行 `npm ci` 安装依赖后运行：

```bash
npm run desktop:package
```

安装包输出到 `build/releases/`。

| 平台 | 产物 | 验证情况 |
| --- | --- | --- |
| macOS Apple Silicon | `TopCard-<版本>-arm64.dmg`、`mac-arm64/TopCard.app` | 已验证 |
| macOS Intel | DMG、`.app` | 需在目标机器验证 |
| Windows | NSIS `.exe` 安装程序 | 已配置，待验证 |
| Linux | `.AppImage` | 已配置，待验证 |

请在目标操作系统和架构上构建：当前流程包含 `node-pty` 等原生依赖，不支持保证跨平台构建。macOS 安装包目前采用本地 ad-hoc 签名，尚未公证。

桌面构建写入独立的 `.next-desktop`，不改开发服务的 `.next`，可与 `npm run dev` 并行。输入未变时复用已有 `build/desktop-runtime`；首次或强制构建仍会跑完整 Next 生产构建。安装包阶段的 NSIS 压缩无法靠这份缓存跳过。

如果只需构建并运行生产桌面，不生成安装包：

```bash
npm run desktop:build
npm run desktop:start
```

运行产物位于 `build/desktop-runtime/`，会启动自己的后端；修改应用代码后需重新构建。实现细节见[桌面开发说明](desktop/README.md)。

### 浏览器生产版 / npm 包

在没有运行开发服务的独立目录中执行：

```bash
npm ci
npm run build
npm start
# 或：npx topcard
```

打开 [http://127.0.0.1:30141](http://127.0.0.1:30141)。此构建会写入当前目录的 `.next`，不要与同目录的开发服务同时运行。`npm publish` 会通过 `prepublishOnly` 先执行生产构建，并把 `.next` 打进 `topcard` 包。

## 数据与运行周期

- 浏览器版及桌面开发模式将队列保存在 `.topcard/queue.json`，可通过 `TOPCARD_QUEUE_FILE` 更换路径；设置和草稿使用浏览器 localStorage。
- 生产桌面将队列、SSH 配置和终端记录保存在 Electron 用户数据目录的 `.topcard/` 下。设置和草稿保存在 `preferences.json`，可跨后端端口变化恢复。macOS 默认目录为 `~/Library/Application Support/TopCard/`。
- Pi 保留自己的会话历史；各 CLI Harness 保留自己的配置与认证。
- 关闭浏览器标签页不会停止后台工作。关闭桌面主窗口后应用继续运行；退出 TopCard 才会结束其后端和管理的会话进程。

当前面向一台本机、一个后端进程。队列持久化不意味着进程退出后任务仍会执行；重启后，原来执行中的卡片回到待处理区。在 TopCard 外自行启动的 CLI 会话不会被自动监控。

## 验证

```bash
npm test
node_modules/.bin/tsc --noEmit
npm run lint
```

执行 `npm run desktop:build` 后，可以运行桌面回归：

```bash
npm run test:desktop
node e2e/desktop-persistence.mjs
```

验证 macOS ARM64 打包应用：

```bash
TOPCARD_DESKTOP_EXECUTABLE="$PWD/build/releases/mac-arm64/TopCard.app/Contents/MacOS/TopCard" npm run test:desktop
TOPCARD_DESKTOP_EXECUTABLE="$PWD/build/releases/mac-arm64/TopCard.app/Contents/MacOS/TopCard" node e2e/desktop-persistence.mjs
```

桌面测试使用临时用户目录，覆盖鉴权、原生终端、窗口复用、退出清理以及设置与草稿持久化。设置 `TOPCARD_TEST_PI_PROMPT=1` 可额外发送一次真实模型请求，需要已配置凭证，并会消耗模型用量。

## 致谢与许可

TopCard 基于 [agegr/pi-web](https://github.com/agegr/pi-web) 和 Pi SDK 构建 Pi 原生体验，在此基础上加入注意力队列与 CLI Harness 工作流。上游基线为 `d10988df5bed37f83ebeac70daa995ef2382f1ce`，原版说明保留在 [UPSTREAM-README](docs/UPSTREAM-README.md)。

采用 [MIT 许可证](LICENSE)。
