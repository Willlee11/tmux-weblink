# tmux-weblink

[English](README.md) | **中文**

在浏览器里访问你的 tmux 会话。一个轻量级 Web 服务器：列出正在运行的 tmux 会话，并让你通过浏览器里的完整终端接入——内置笔记与侧边栏，移动端与桌面端都能用。

## 特性

- **完整终端**：xterm.js 渲染，支持 256 色、复制粘贴、粘贴图片到 CLI 工具
- **触摸优化**：移动端惯性滚动、Shift+拖选松手自动复制、虚拟键盘工具栏
- **PWA**：手机"添加到主屏幕"、桌面浏览器"安装应用"即为独立窗口应用
- **侧边栏会话分组**：按工作目录自动聚类（显示文件夹名），可折叠
- **New Session 目录树选择器**：层层展开目录树，直接定位到当前会话所在路径
- **笔记（Notes）**：每个会话独立的 Markdown 便签
- **文件浏览/编辑（Files）**：浏览、编辑本地文件（默认仅本机，路径受限）
- **Machines 联邦**：把 NAT 后的机器加入公共 hub（hub 无需开放端口），多机终端矩阵
- **窗口抽屉**：在终端头部切换 tmux 窗口（移动端友好的标签选择器）
- **安全**：scrypt 哈希 token 认证、登录限流、审计日志

## 安装

```bash
npm install -g tmux-weblink
```

或者直接用 npx 运行：

```bash
npx tmux-weblink
```

## 使用

```bash
# 交互式初始化（创建 token 等）
tmux-weblink setup

# 默认端口 21000 启动
tmux-weblink

# 自定义端口
PORT=8080 tmux-weblink

# 可选：先读尾部缓冲再加载历史（见 docs/architecture.md）
TMUX_WEB_INITIAL_LINES=1000 TMUX_WEB_HISTORY_CHUNK=500 tmux-weblink

# Machines：把本机加入一个 hub（无需开放端口）
tmux-weblink agent --hub wss://hub.example.com --token <agent-token> --name laptop
```

> **每台机器都用同一条启动命令。** 加入 hub：在要接入的机器上打开
> `http://localhost:21000/settings/machines`，粘贴 hub 地址 + token，点
> **Save & Connect**——agent 客户端与普通服务器同进程运行。hub 自己的
> `/settings/machines` 页面负责创建/吊销 token。

然后浏览器打开 `http://localhost:21000`，你会看到活跃的 tmux 会话列表——点击即可接入。

## 手机端 / PWA

- **iOS**：Safari 分享 → "添加到主屏幕"，全屏独立运行
- **Android / Chrome**：菜单 → "添加到主屏幕" / "安装应用"
- 支持软键盘自动适配、触摸惯性滚动、拖选复制

## 桌面端（Linux / Windows / macOS）

桌面浏览器（Chrome / Edge / Chromium）地址栏右侧点"安装"图标即可生成**独立窗口应用**：

- 本机 `http://localhost:端口` 或 HTTPS 均可；内网 HTTP IP 不会出现安装提示（非 secure context）
- Windows 上服务端原生运行受限（node-pty 需 WSL2），可用 WSL2 或接入远程 hub 使用

## 文档

- [文档中心](docs/index.md)
- [笔记](docs/notes.md) — 每个会话独立的 Markdown 便签
- [文件](docs/files.md) — 浏览/编辑本地文件
- [Machines / Agents](docs/agents.md) — 把 NAT 机器接入公共 hub
- [架构](docs/architecture.md) — 服务器、终端、侧边栏如何协作

## 环境变量（常用）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `21000` | HTTP 端口 |
| `TMUX_WEB_MODE` | `production` | `development` 用 dev 数据目录 |
| `TMUX_WEB_INITIAL_LINES` | — | 打开会话时先读尾部 N 行 |
| `TMUX_WEB_HISTORY_CHUNK` | — | 历史分批加载的块大小 |
| `TMUX_WEB_AGENT_HUB` / `TMUX_WEB_AGENT_TOKEN` / `TMUX_WEB_AGENT_NAME` | — | agent 连接参数 |
| `FS_ROOTS` | `~` | 文件浏览可访问的根目录（逗号分隔） |

## 前提条件

- **Node.js** >= 22
- **tmux** 已安装且在 PATH 中
- 可写的 `~/.tmux-web/` 和 `~/.config/tmux-web/`（dev 模式路径见 [docs](docs/index.md)）

## Windows 说明

- 服务端在 Windows 上原生运行受限（node-pty 在 Windows 无 linux-x64 类 prebuild，需源码编译；推荐 **WSL2** 内运行服务）
- 浏览器客户端（PWA / 网页）在 Windows 上完全正常，可接入本机 WSL2 或远程 hub 的会话

## 致谢

本项目建立在以下项目的想法和代码之上：

- [tmux-web](https://github.com/ashutoshpw/tmux-web) by [@ashutoshpw](https://github.com/ashutoshpw)
- [persalink](https://github.com/brobata/persalink) by [@brobata](https://github.com/brobata)

它是这些实验的延续与重新打包，目标是做一个单用户、浏览器优先、易于安装运行的 tmux 伴侣。

## 许可证

MIT
