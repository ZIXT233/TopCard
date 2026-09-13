# TopCard Desktop

TopCard 的 Electron 入口。卡片、原生 Pi、CLI 终端复用现有界面和后端。

## 开发

先运行 `npm run dev`（已有健康的 30141 服务则直接复用），然后运行 `npm run desktop:dev`。
Electron 使用 Chromium，不包含 Safari 横滑补丁。开发桌面与浏览器连接同一后端；退出开发桌面不会结束该后端。

SSH 工作区的 CLI 版本检测、实际启动和 Node 状态探针使用远端用户的交互登录 Shell 环境，支持在 `.bashrc` 等启动文件中配置的 `.local/bin`、NVM 等安装路径。如果终端能运行 Codex 而旧版桌面提示找不到命令，更新桌面应用后重试即可，无需重新安装 Codex。

## 本机打包

`npm run desktop:package`

桌面构建在仓库内写入独立的 `.next-desktop`（不碰开发用的 `.next`），并按源码/锁文件指纹复用 `build/desktop-runtime`。无改动时 `desktop:build` 应秒级结束；改代码后 webpack 可走该缓存。强制重编：`npm run desktop:build:force`。日常迭代用 `desktop:build` + `desktop:start`，不必每次打 NSIS 安装包。
Webpack 生产构建默认给 Node **16GB** 堆（同时写入进程参数与 `NODE_OPTIONS`）。若仍 OOM，可再抬高：PowerShell 下 `$env:TOPCARD_DESKTOP_HEAP_MB="20480"` 后重跑。
产物在 `build/releases`，macOS 为 `mac-arm64/TopCard.app`（Intel 为 `mac/TopCard.app`）。
`npm run desktop:build` 只准备后端；`npm run desktop:start` 使用该后端运行桌面。

生产后端通过 Electron `utilityProcess` 复用 Electron 内置的 Node，不再携带第二套 Node 运行时，也不会把常驻服务注册成第二个 Dock 应用。少量服务端辅助脚本仍通过 `ELECTRON_RUN_AS_NODE` 短时复用同一运行时。Next standalone 运行目录保留标准 `node_modules`，只有打包时才复制到临时目录并暂存为 `runtime/modules` 以绕过 electron-builder 的 extraResources 过滤，完成应用目录后恢复为标准的 `runtime/node_modules`，让 CommonJS 和 ESM 都能正常解析。构建不会把开发目录的 node-pty 重编译成 Electron ABI；其目标平台预编译模块必须能被 Electron 内置 Node 加载。首次构建可能需要联网获取 Next 字体。构建必须在目标平台/架构上运行并安装其依赖；当前本机验证 macOS Apple Silicon。Windows 提供 NSIS 配置，Linux 提供 AppImage 配置，需要各平台验证。当前 macOS 产物具有本地 ad-hoc 应用签名，以满足系统通知的身份要求；尚未 Developer ID 签名及公证。

## 生命周期与数据

- 关闭主窗口会隐藏到后台，Pi/CLI 会话继续；从 Dock/托盘重新显示。
- 菜单「退出 TopCard」会结束桌面自有后端及其会话进程，保留已保存的历史和终端内容。
- 主页面只保留一个窗口，每张卡片也只保留一个窗口；网页弹窗入口同样交由桌面窗口管理器处理。独立卡片占用身份在刷新时不变，关闭窗口时释放，启动后自动清理上次运行的残留占用。
- 分离卡片通过 Electron 按卡片 ID 管理原生独立窗口；侧边栏点击会恢复最小化窗口并显示、聚焦，重复点击不会刷新会话。窗口关闭后可重新打开。外部 HTTP(S) 链接交给默认浏览器。
- 首次启动会通过原生测试通知触发系统权限流程。菜单「通知」提供再次申请/测试和系统通知设置入口；已被系统拒绝时需在系统设置中重新允许。完成通知沿用现有开关，点击后显示窗口并跳转对应卡片。网页权限 granted 不等于系统允许横幅；系统勿扰/通知权限仍由系统控制。
- 生产后端绑定随机 loopback 端口，由主进程为本应用发往该端口的请求自动附加内部认证，启动时生成密钥；Cookie 被清理也不要求用户登录；渲染器保持 sandbox/contextIsolation，不能直接调用 Node。
- Pi 与 CLI 的原始会话继续使用各自用户目录。队列、SSH 配置、终端记录在 Electron userData 的 `.topcard` 下（macOS：`~/Library/Application Support/TopCard/.topcard`）；开发环境仍在项目 `.topcard` 下。不会自动覆盖任何已有桌面队列。
- 日志在 userData 的 `logs/`：`main.log` 是 Electron 主进程时间线（后端就绪、窗口加载），`server.log` 是 Next 后端 stdout/stderr。打包应用可加 `--enable-logging` 或环境变量 `TOPCARD_DESKTOP_DEBUG=1`，额外写出 `chromium.log`。菜单「视图 → 切换开发者工具」可看渲染器 Network。Windows 路径一般为 `%APPDATA%\TopCard\logs`。

## 设置持久化与回归

生产桌面通过有限 IPC 将设置和草稿原子写入 userData 下的 `preferences.json`，不依赖随机后端端口的 localStorage；主窗口和分离卡片共享同一存储，并广播变更事件。存储上限为 8 MiB，超过上限的图片草稿仍使用页面内存兜底。浏览器版及 `desktop:dev` 继续使用浏览器 localStorage。旧版本其他端口下的 localStorage 不会自动导入。

`node e2e/desktop-persistence.mjs` 验证真实输入框草稿、主题、字体及声音设置跨重启恢复、窗口间同步和删除；设置 `TOPCARD_DESKTOP_EXECUTABLE` 可验证打包应用。`node e2e/desktop.mjs` 验证鉴权、原生 PTY、分离窗口及退出后端。

构建暂存排除 `build` 和 `dist`，不会复制历史发行包。历史产物应与当次发行包分别计量；目录占用不等于 DMG 下载大小。

桌面构建启用 `images.unoptimized`，直接显示本地图片原件，并移除 Next 基础服务追踪附带的可选 `sharp`/`@img` 原生依赖。浏览器生产构建继续保留 Next 图片优化；Pi 和浏览器的附件处理路径不变。真实模型冒烟验证可通过 `TOPCARD_TEST_PI_PROMPT=1` 启用。

2026-09-13 macOS ARM64 实测：本轮包位于 `build/review-fixes-releases`，应用约 400 MiB、DMG 约 138 MiB（此前默认发行包约 417/146 MiB）。1118 项单元测试通过；将应用复制到仓库外后，跨端口重启、真实 Pi 请求、原生 PTY、鉴权及窗口生命周期冒烟通过。模型请求测试先验证工作目录，再携带 `cwd` 请求模型列表，避免借用开发仓库已有的允许目录。
