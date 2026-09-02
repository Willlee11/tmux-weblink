# tmux-weblink

[English](README.md) | **中文**

在浏览器里访问你的 tmux 会话。一个轻量级 Web 服务器：列出正在运行的 tmux 会话，并让你通过浏览器里的完整终端接入——内置笔记与文件浏览，移动端与桌面端都能用。

## 特性

- **完整终端**：xterm.js 渲染，支持 256 色、复制粘贴、粘贴图片到 CLI 工具
- **触摸优化**：移动端惯性回看历史、左半屏点按翻页、拖选自动复制、虚拟键盘工具栏
- **PWA**：手机"添加到主屏幕"、桌面浏览器"安装应用"即为独立窗口应用
- **侧边栏会话分组**：按工作目录自动聚类（显示文件夹名），可折叠
- **New Session 目录树选择器**：层层展开目录树，直接定位到当前会话所在路径（含隐藏目录）
- **笔记（Notes）**：每个会话独立的 Markdown 便签，自动保存
- **文件浏览/编辑（Files）**：浏览、编辑本地文件与 git 状态
- **Machines 联邦**：把 NAT 后的机器加入公共 hub（hub 无需开放端口），多机终端矩阵
- **安全**：scrypt 哈希密码认证、登录限流、审计日志

---

# 使用教程（手把手）

## 1. 安装与启动

```bash
npm install -g tmux-weblink

# 启动（默认端口 21000）
tmux-weblink
```

打开浏览器访问 **http://localhost:21000**。

## 2. 第一次使用：设置密码并登录

第一次访问会看到 **"Set your password"（设置密码）** 页面（要求至少 8 位）。设置后密码以 scrypt 哈希保存在本机，以后每次打开都输入同一个密码即可。

> 也可以用命令行初始化：`tmux-weblink setup`

## 3. 界面一览

登录后主界面分三块：

- **左侧边栏（Sessions 模式，默认）**：
  - 顶部 **`+ New Session`** 按钮——创建新 tmux 会话
  - 下方会话列表，**按工作目录自动分组**（每组一个文件夹标题，可点击折叠）。同目录的多个会话堆在一起，一眼看到"我在哪个项目里开了什么"
  - 每个会话前面的小圆点显示活动状态：**绿色 = 空闲（idle），橘黄 = 正在干活（working）**（后台自动探测，无需配置）
  - 若 session 在 tmux 里被杀掉，会出现在 **"失效会话"** 分组（灰显，见 §9）
- **底部三个模式按钮**：`Sessions`（会话）/ `Files`（文件）/ `Settings`（设置）
- **右侧主区**：点击会话前的占位提示；接入终端后显示完整终端

## 4. 接入终端 & 每天的操作

### 打开一个会话

直接**点击侧边栏里的会话**即可接入（通过 `tmux attach` 接入真实会话，不是模拟）。接入后侧边栏自动收起，终端占满屏幕。

- 需要切换会话时，点左上角 **tmux-weblink** 标志展开侧边栏，再点另一个会话
- 会话是真实 attach：你在 tmux 里开的窗口/面板，以及**别的终端**（如 tmux 原始终端）看到的内容完全同步

### 复制与粘贴

| 操作 | 方法 |
| --- | --- |
| 复制终端里的文本 | 用鼠标**拖选**，松手即自动复制（桌面 & 移动端通用）；或先 `Shift` 再拖选 |
| 粘贴到终端 | 焦点在终端里直接 `Ctrl+V`（Mac 为 `Cmd+V`）——页面接管：文本 = 直接输入，图片 = 自动上传（首次需放行剪贴板权限） |
| 粘贴**图片**（≥2.2.24） | 复制一张图片（截图/剪贴板图片），在终端里 `Ctrl+V` 粘贴 → 图片自动上传到本机 `~/.tmux-web/uploads/`，并把**文件路径输入到终端**。终端是文本协议，粘贴图片 = 得到路径，可在 shell 里 `cat` / `vim` 查看 |

> 在 agent 会话（Machines）里粘贴图片，文件会传到 **agent 那台机器**上，路径对那台机器有效。

### 触摸屏（手机 / 平板）

终端区域分左右两区，**左手拇指方便操作的左 40% 是翻页区**：

- **左 40%**（按手指落点分上下两半）是翻页区：
  - 点/滑 **上半区** = 上翻一页（PgUp，vim 友好）
  - 点/滑 **下半区** = 下翻一页（PgDn）
  - 会弹出半透明提示（↑/↓），不弹软键盘；要输入时点击终端主体即可
- **右 60%**：上下拖动**回看终端历史**（带惯性），像普通手机页面一样往回翻

### 虚拟键盘工具栏（移动端）

点击屏幕下方输入条弹出工具栏：`ESC` / `Tab` / `Shift+Tab` / 方向键等软键盘没有的键。

### 在终端头部切换 tmux 窗口

多窗口会话顶部有 **窗口抽屉**（移动端友好的标签选择器），点击即切换到对应 tmux 窗口，不用记 `Ctrl+B n` 之类的快捷键。

### 快速命令 Quick Commands

打开 **`/quick-commands`** 页面：把常用命令存成卡片（标题 + 命令 + 可指定在哪个 session 执行），点一下即执行。适合"重启服务"、"跑测试"这类天天要敲的命令。

## 5. 创建新会话（New Session）

侧边栏点 **`+ New Session`**，弹窗里：

1. **Session name**：会话名（字母数字，如 `myproject`）
2. **Start directory**：起始目录，两种填法：
   - 直接输入路径，下面会**实时补全匹配**（输入 `~/.cl` 会补全出 `~/.claude`）
   - 点目录树按钮（📁）弹出**目录树**，层层展开选择；树会自动展开到当前会话所在目录，**隐藏目录（`.claude`、`.config` 等）也可见**（≥2.2.25，排在普通目录后面）
3. 点 **Create**：创建并自动接入

> 不会用目录树也没关系：留空 = 在 home 目录创建，之后在会话里 `cd` 即可。

## 6. 笔记 Notes & 文件 Files

### Notes（每个会话一块便签）

会话头部点**记事本图标**，打开该会话的 Markdown 便签，**边写边自动保存**到 `~/.tmux-web/db.json`。下次再打开这个会话，便签还在。想用大编辑区/导出，打开 `/notes/<session名>` 或全局便签 `/notes/__global__`。

### Files（文件浏览/编辑 + git）

点底部 **Files** 模式：

- **默认**（未配置时）：打开会话后切到 Files，直接浏览**当前会话的工作目录**
- **配置后**（`TMUX_WEB_FS_ROOTS=/path1:/path2`）：显示多个根目录入口
- 点文件夹逐层进入，点文件在右侧打开编辑器直接改，**Save** 保存；`..` 回上级
- 目录里有 git 仓库时显示**分支名**，文件旁标注改动状态；顶部/侧栏可看 **git diff**
- 新建文件：底部输入文件名 + **New File**

安全限制：路径必须落在配置的根目录内（默认单文件 ≤1 MiB），`../../../etc/passwd` 这类越界会被拒绝。

## 7. 多机使用 Machines（把 NAT 后的机器接进来）

一台 **hub**（有公网 IP 或至少你能访问它）+ 任意台**被 NAT 挡住的机器**。所有机器装的是同一个包、跑的是同一条命令，只是角色不同：

1. **hub 上**：打开 `http://<hub>:21000/settings/machines`，点创建 agent token，复制（一次性的，关页就看不到）
2. **远端机器**（如家里/公司内网的电脑）：安装好并启动后，打开**它本机**的 `http://localhost:21000/settings/machines`，粘贴 hub 地址 + token，点 **Save & Connect**
3. 回到 **hub 的浏览器页面**：侧边栏出现该机器的分组（显示机器名），点里面的会话就像操作本机会话一样——输入、触摸、图片粘贴全部走加密隧道

要点：

- agent 客户端与普通服务器**同进程**运行，远端机器不需要开放任何端口
- **hub 升级新版后，远端 agent 也要升级到对应版本**（agent 端逻辑随版本变化）
- 浏览器端改版后记得**硬刷新**（见 §10）

## 8. 在 tmux 里关掉的会话（失效会话/墓碑）

在 tmux 里 `kill-session` 或关闭了某个会话后，列表不会立刻把它扔掉，而是移到 **"失效会话"** 分组灰显（保留你记得住的位置）。

点它弹出操作面板：

- **重建同名同路径 session**：在原工作目录把会话原样拉起来（最常用）
- **重命名（仅记录）**：只改记录不改 tmux
- **删除失效记录（墓碑消失）**：彻底忘掉它

## 9. 手机 / 桌面安装成独立应用

- **iOS**：Safari 分享 → **添加到主屏幕**，全屏独立运行
- **Android / Chrome**：菜单 → **添加到主屏幕** / **安装应用**
- **桌面**（Linux/Windows/macOS 浏览器）：Chrome/Edge/Chromium 地址栏右侧点**安装**图标，变成独立窗口应用
- 注意：内网 HTTP IP 不会出现安装提示（浏览器要求 secure context）；本机 `localhost` 或 HTTPS 都可以

## 10. 常见问题 Troubleshooting

| 现象 | 解决办法 |
| --- | --- |
| 页面功能没更新（缺新按钮/触摸手势不对） | **硬刷新**：`Ctrl+Shift+R`（Mac `Cmd+Shift+R`）。前端 JS 是服务端启动时下发的，服务端升级后**已打开的页面不会自动更新** |
| 升级后 agent 会话仍旧行为 | 升级 **hub** 后记得升级远端机器上的 agent 到新版本 |
| 粘贴图片没反应 | 需要 ≥2.2.24；确认终端里 `Ctrl+V`（浏览器剪贴板权限要放行一次） |
| 目录树里看不到 `.claude` 等隐藏目录 | 需要 ≥2.2.25（隐藏目录排在列表末尾） |
| 端口被占 | `PORT=8080 tmux-weblink` 换端口 |
| 忘了密码 | 本机重跑 `tmux-weblink setup` 重置 |
| 用 systemd 托管 | 配置文件必须带 `KillMode=process`（否则重启服务会连坐杀掉 tmux server，见 [docs/index.md](docs/index.md)） |
| Windows 上服务端起不来 | 服务端推荐在 **WSL2** 里运行；Windows 浏览器作为客户端完全正常（接 WSL2 或远程 hub） |

---

# 命令速查

```bash
# 交互式初始化（设置密码等）
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

> **每台机器都用同一条启动命令。** 加入 hub 也可不开命令行：机器启动后到本机
> `http://localhost:21000/settings/machines` 粘贴 hub 地址 + token，点 **Save & Connect**。
> hub 自己的 `/settings/machines` 负责创建/吊销 token。

# 环境变量（常用）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `21000` | HTTP 端口 |
| `TMUX_WEB_MODE` | `production` | `development` 用 dev 数据目录 |
| `TMUX_WEB_INITIAL_LINES` | — | 打开会话时先读尾部 N 行 |
| `TMUX_WEB_HISTORY_CHUNK` | — | 历史分批加载的块大小 |
| `TMUX_WEB_AGENT_HUB` / `TMUX_WEB_AGENT_TOKEN` / `TMUX_WEB_AGENT_NAME` | — | agent 连接参数 |
| `TMUX_WEB_FS_ROOTS` | — | 文件浏览根目录（冒号分隔）。不设时 Files 模式浏览当前会话的工作目录 |
| `TMUX_WEB_MAX_IMAGE_UPLOAD_BYTES` | 10 MiB | 图片粘贴上传大小上限 |

# 更多文档

- [文档中心](docs/index.md)（含 systemd 服务配置）
- [笔记](docs/notes.md)
- [文件 API / 安全](docs/files.md)
- [Machines / Agents](docs/agents.md)
- [架构](docs/architecture.md)

# 前提条件

- **Node.js** >= 22
- **tmux** 已安装且在 PATH 中
- 可写的 `~/.tmux-web/` 和 `~/.config/tmux-web/`（dev 模式路径见 [docs](docs/index.md)）

# Windows 说明

- 服务端在 Windows 上原生运行受限（node-pty 在 Windows 无 linux-x64 类 prebuild，需源码编译；推荐 **WSL2** 内运行服务）
- 浏览器客户端（PWA / 网页）在 Windows 上完全正常，可接入本机 WSL2 或远程 hub 的会话

# 致谢

本项目建立在以下项目的想法和代码之上：

- [tmux-web](https://github.com/ashutoshpw/tmux-web) by [@ashutoshpw](https://github.com/ashutoshpw)
- [persalink](https://github.com/brobata/persalink) by [@brobata](https://github.com/brobata)

它是这些实验的延续与重新打包，目标是做一个单用户、浏览器优先、易于安装运行的 tmux 伴侣。

# 许可证

MIT
