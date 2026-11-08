# 我的工作站（my-workbench）

Electron 桌面工作台：**一个窗口里同时有 DSH、VSCode、文件树**。

- 形态：独立桌面软件（不是网页、不是 DSH 插件）
- 大脑：内嵌 DSH 引擎（`dsh web --no-open --port 0`，自己拉起、自己抓 token）
- 编辑器：独立 `code-server` 4.145.2（自带 VS Code，不依赖本机安装）
- 当前版本：**0.2.0（C1 网格 + C2 引擎 + C4 编辑器）**，三面板已实机跑通

---

## 快速开始

```powershell
cd E:\Work\workbench
npm install        # 只装 electron（已装过可跳过）
npm start
```

`npm start` = `electron . --no-sandbox`。启动后：进度遮罩 → 三个面板（文件 / VSCode / DSH）。

第一次启动会稍慢（引擎约 10 秒、code-server 约 5 秒），进度会显示在遮罩上。

---

## 现在窗口里有什么

| 面板 | 内容 |
| --- | --- |
| 文件 | `scenarios/dev.json` 里 `root` 指向的目录（当前 `D:/Python/pycharm`），左树右预览，支持文本与图片 |
| VSCode | code-server 页面，直接打开 `vscode.folder`（当前 `D:/deepseek/电脑`）；点文件树里的文件不会同步过去（见"下一步"） |
| DSH | 内嵌 DSH Web UI，独立 `DSH_HOME`，会话与你自己装的 DSH 互不干扰 |

底部状态条：`DSH 引擎：127.0.0.1:xxxxx · VSCode：ready · 面板：3`。

---

## 目录

```
workbench/
  main.js              主进程：建窗、拉引擎、拉 code-server、IPC、退出清理
  preload.js           能力白名单（渲染层拿不到 fs / child_process）
  renderer/
    index.html         页面骨架 + 启动遮罩
    styles.css         暗色样式，无框架
    renderers.js       面板渲染器注册表 RENDERERS[type] = fn
    renderer.js        读场景 → 建网格 → 逐面板渲染
  scenarios/
    dev.json           布局与启动配置（改这个就能改工作台长相）
  vendor/cs/           code-server 4.145.2（含自带 node.exe 与原生模块）
  tools/
    fetch-chunked.js   Range 断点续传下载器（大文件过镜像用）
    shim-argon2.js     npm 版 code-server 的 argon2 替身（当前不再使用）
    probe-main.js      Electron 启动探针（排查 RUN_AS_NODE 用）
  logs/                引擎、code-server、启动结果、诊断快照
  runtime/             DSH 独立 home、code-server 用户数据、engine.pid
```

---

## 这台机器上必须知道的四个坑

前两个是**环境**问题，后两个是**代码**问题，都已经在代码里处理掉了，换成新机器时要重新确认：

### 1. 启动必须带 `--no-sandbox`

裸跑 `electron .` 会**瞬间退出、无任何输出**，退出码 `-2147483645`（`0x80000003`）。
带上 `--no-sandbox` 立刻正常。`package.json` 的 `start` 已经写死。

### 2. `ELECTRON_RUN_AS_NODE=1` 会让 electron.exe 退化成纯 Node

被这个变量影响时，`electron.exe --version` 打印的是 **Node 的版本号**，`--no-sandbox` 会被当成 node 的非法参数（`bad option: --no-sandbox`），`require('electron')` 只返回一个路径字符串。

本机来源：DSH 宿主进程 spawn 子进程时注入（`pwsh` 自己的 `Get-ChildItem Env:` 里看不到，但子进程里 `process.env.ELECTRON_RUN_AS_NODE` 就是 `"1"`）。
绕过方式：经 `cmd` 清掉再启——

```powershell
cmd /c "set ELECTRON_RUN_AS_NODE=&& ""<path>\electron.exe"" . --no-sandbox"
```

`main.js` 顶部有防御：拿不到 `app.whenReady` 时直接打印这条提示并退出，不会只丢一句 `Cannot read properties of undefined`。

### 3. 引擎端口用 `--port 0`，别写死

3080 被上一轮孤儿引擎占住时，新引擎会 `listen EADDRINUSE` 退出，界面就停在"等待地址"。
现在：`--port 0` 让系统挑，端口从 stdout 的 `dsh web: http://127.0.0.1:<port>/?token=...` 正则抓；
并且启动前会按 `runtime/engine.pid` 先 `taskkill /T /F` 清掉上一轮残留。

### 4. `#grid` 初始 `hidden`，建完必须显式打开

`styles.css` 里有 `.grid[hidden] { display: none }`，`renderer.js` 建完网格必须 `g.hidden = false`，
否则三个面板全都 `display:none`，窗口一片黑——而且不报任何错。

---

## code-server 怎么接的

`serve-web` 路线在本机走不通（VSCode 是目录重排版便携安装，CLI 去 `update.code.visualstudio.com` 下载 VS Code Server，该接口对所需 commit 返回 **204 无内容**，进程直接退出）。

改成独立 code-server：

```jsonc
"vscode": {
  "mode": "code-server",
  "cmd": "vendor/cs/code-server-4.145.2-windows-amd64/lib/node.exe",
  "args": [
    "vendor/cs/code-server-4.145.2-windows-amd64",
    "--bind-addr", "127.0.0.1:{port}",
    "--auth", "none",
    "--disable-telemetry", "--disable-update-check", "--disable-workspace-trust",
    "--user-data-dir", "runtime/code-server-data"
  ],
  "port": 9123,
  "timeoutMs": 90000,
  "folder": "D:/deepseek/电脑"
}
```

要点：

- `{port}` 是占位符，主进程替换；端口就写一处。
- `cmd` 给**相对路径**没问题（主进程会 `path.resolve` 成绝对路径再 spawn）；直接写 `vendor\...` 交给 cmd 会报 `'vendor' 不是内部或外部命令`。
- `--auth none` 只监听 `127.0.0.1`，不给外面开口子。
- `folder` 拼成 `/?folder=<encoded>`，让编辑器一开就是目标目录。
- 日志里会周期性出现 `EPERM ... AppData\Local\code-server\Data\heartbeat`：code-server 有一处写死在 `%LOCALAPPDATA%`，沙箱下写不进去。**不影响服务**，正常终端里运行不会有。

---

## 配置：改 `scenarios/dev.json` 就够了

```jsonc
{
  "grid":  { "cols": 12, "rows": 10, "gap": 6 },
  "engine":{ "cmd": "dsh", "args": ["web", "--no-open", "--port", "0"], "home": "runtime/dsh-home", "timeoutMs": 60000 },
  "vscode":{ "...": "见上", "port": 9123, "timeoutMs": 90000, "folder": "D:/deepseek/电脑" },
  "panels": [
    { "id": "files",  "type": "file",   "col": 0, "row": 0, "w": 2, "h": 10, "root": "D:/Python/pycharm" },
    { "id": "editor", "type": "vscode", "col": 2, "row": 0, "w": 6, "h": 10 },
    { "id": "ai",     "type": "web",    "col": 8, "row": 0, "w": 4, "h": 10, "embed": "engine" }
  ],
  "launchers": [ { "key": "pycharm", "label": "PyCharm", "path": "..." } ]
}
```

- `engine.home`：字符串 = 相对本目录（或绝对路径）的独立 DSH 数据目录；`false` = 用引擎默认；省略 = 继承当前环境。**别让它继承你日常用的 home**，否则会话列表会混在一起。
- `panels[].type`：`web` / `vscode` / `file` / `launch` / `term` / `view`
- 新增面板类型：在 `renderer/renderers.js` 加 `RENDERERS.xxx = (body, panel, api) => {...}`，`main.js` 不用动。

---

## 出问题先看这四个文件

| 文件 | 什么时候看 |
| --- | --- |
| `logs/start-result.json` | 窗口起来了但面板空：引擎/编辑器的启动结果、URL、失败原因都在这 |
| `logs/engine.log` | DSH 引擎的 stdout/stderr（含完整异常栈） |
| `logs/vscode.log` | code-server 的输出 |
| `logs/diag.json` + `logs/diag.png` | 用 `npm start -- --diag` 启动，30 秒后落一份"面板真实位置 + 整窗截图"，用来判断到底渲染没渲染 |

---

## 三条从参考项目抄来的规矩

1. **`DSH_HOME` 不显式设，会话会在界面里"消失"** —— 引擎启动时一定带环境变量。
2. **能放 `renderers.js` 的就别放 `main.js`** —— 前者改完刷新就生效，后者要重启整个 app。
3. **空态必须显式** —— 每个面板没数据时都要说清楚为什么，白屏是最难排查的故障。

---

## 下一步

- **C3 终端面板**：node-pty + xterm.js，在网格里开 shell
- **C5 Obsidian 库**：直读 `E:\Obsidian` 与 `note/*` 的 md + 全文搜索（不嵌 Obsidian 本体）
- **C6 联动**：文件面板点文件 → code-server 打开（走 `/?folder=...&file=...` 或 code-server 的 IPC）
- **C7 窗口摆位**：`launch` 面板拉起 PyCharm / DevEco / VMware 后，用 Win32 API 把原生窗口摆到指定区域
- **C8 场景切换**：多份 scenario（写作 / 开发 / 查资料），启动前选

## 文件面板：整台电脑

左侧「文件」面板默认落在 **此电脑**，不是某个固定目录。

- 驱动器：自动枚举所有存在的盘符（C:/D:/E:/F: …）
- 常用位置：用户目录、桌面、下载、文档、`~/.dsh`（DSH 数据）、工作站目录
- 单击文件夹进入；顶部路径条显示当前绝对路径；`..` 从盘符根再往上回到「此电脑」
- 单击文件在右侧预览（文本直显，图片按 data URL 内联；单文件上限 4 MB）

改回固定目录：`scenarios/dev.json` 里 files 面板的 `root` 写成绝对路径（如 `"D:/Python/pycharm"`），
忽略这个字段或写 `"roots"` 就是整机浏览。

## 顶部任务栏：把本地 exe 停进面板

窗口最上方那条是任务栏，按钮来自 `scenarios/dev.json` 的 `taskbar` 数组（不写则退回 `launchers`）。

用法：

1. 点「PyCharm」→ 启动它，并把它的窗口停进 `dockTarget` 指定的面板（默认 `editor`，也就是原 VSCode 的位置）；面板本身显示「这块面板正被「PyCharm」接管」。
2. 再点同一个按钮 → 结束接管，窗口归还桌面。
3. 拖动分隔条、缩放窗口 → 停靠的窗口跟着重新贴合面板。
4. 条目里写 `"dock": false` 的（比如 VMware、资源管理器）不接管，只做普通启动。

实现要点：

- 不用 `SetParent`（对 Chromium / JVM 应用会崩、输入丢失），而是把对方窗口设成工作台窗口的**属主窗口**（`GWL_HWNDPARENT`），再用 `SetWindowPos` 精确贴到面板矩形上。属主窗口天然压在属主之上、随属主最小化。
- 定位前先 `SW_RESTORE`，所以最小化/停到屏幕外（`-25600,-25600`）的窗口也能拉回来。
- 面板区域按 CSS 像素算，交给 Win32 前用 `scaleFactor` 换算成物理像素（本机 125% 缩放）。
- 关闭工作台时会先把每个停靠窗口解绑，再退出——不会连带杀掉你的 IDE。
- 工具是 `tools/WinDock.exe`（源码 `tools/WinDock.cs`，用 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 编译）。
- 自测入口：`electron . --no-sandbox --docktest pycharm`，结果写 `logs/dock-result.json`。

已知限制：按 exe 名找窗口，如果某应用是「启动器进程 + 真正的窗口在子进程」，可能匹配到启动器；这类应用先用 `"dock": false`，或者把 `taskbar` 条目的 `path` 直接指向真正那个 exe。
## 布局：默认三等分，可拖拽调整

启动即最大化全屏，横向三等分：**文件 | VSCode | DSH**，右列再上下分成 **DSH / 本地应用**。

| 操作 | 效果 |
| --- | --- |
| 拖动竖直分隔条 | 调左右列宽 |
| 拖动水平分隔条 | 调同列内上下两块的高度 |
| 双击分隔条 | 该方向恢复均分 |
| 关掉再开 | 记住你拉过的比例（localStorage `workbench.layouts.v1`） |

默认布局写在 `scenarios/dev.json` 的 `layout` 里：

```json
"layout": {
  "columns": [
    { "width": 1, "panels": ["files"] },
    { "width": 1, "panels": ["editor"] },
    { "width": 1, "panels": ["ai", "apps"] }
  ]
}
```

`width` 是列宽权重，`panels` 按顺序上下排列（高度权重取面板的 `height`，默认 1）。
去掉 `apps` 就是纯三列；想加一层上下分割，把另一个面板 id 塞进同一条 `panels` 即可。

## 做成 exe（打包）

```powershell
npm run build        # 等价于 node tools/build-exe.js
```

产物：`dist2\Workbench-win32-x64\Workbench.exe`（约 890MB）。

**必须整目录使用**：exe 依赖同目录的 `locales\`、`*.dll`、`resources\app\`（里面是我们自己的代码与 vendor 里的 code-server）。
只把这个 exe 单独拷走是跑不起来的；要搬就整个 `Workbench-win32-x64` 文件夹一起搬。

双击 `Workbench.exe` 即可，不需要命令行、也不需要 `--no-sandbox`（启动器里那句 `set ELECTRON_RUN_AS_NODE=` 只是给被污染的环境兜底）。

体积构成：code-server 的 extensions 约 262MB + node_modules 约 210MB + Electron 运行时约 180MB + 其余。

### 关于 dist 与 dist2

当前可用产物在 **`dist2\Workbench-win32-x64\Workbench.exe`**，双击即用（必须整目录搬）。

`dist` 是一次重打包被占用后留下的空壳（只剩 `Workbench-win32-x64\resources\app` 三层空目录，Windows 拒绝删除）。
重启电脑后执行 `Remove-Item dist -Recurse -Force` 清掉，之后 `npm run build` 会照常输出到 `dist`。
也可以 `node tools/build-exe.js 任意目录名` 换个输出位置。

## 和工作台外的 DSH 共用对话

工作台里的 DSH 面板跑的是**另一个引擎进程**（端口随机），但它读的是同一份数据：

```json
"engine": {
  "home": "C:\\Users\\aa\\.dsh",
  "cwd": "D:\\deepseek\\电脑"
}
```

- `home` = `DSH_HOME`。指到你自己的 `.dsh`，会话、工作区列表、登录态、凭据全都和桌面版共用；
  指到 `runtime/dsh-home` 就是一份干净的空数据（会显示"开始使用 / 添加 API Key"）。
- `cwd` = 引擎的工作目录。DSH 按工作目录分目录存会话（`sessions/--D-deepseek-…--`），
  不设就会落到 `E:\Work\workbench` 那个目录名下，看起来"历史会话不见了"。

两条注意：

1. 桌面版 DSH 和工作台可以同时开着，它们各写各自的会话文件；但同一个会话别两边同时聊。
2. 从别处拷过去/换了机器，`.dsh` 不存在时程序会自动回退到 `runtime/dsh-home`，不会启动失败（日志里有一行 `共享 home 不存在，回退`）。

## 界面结构（v2）

启动时按场景里的 `layout` 重建界面，并因为 `resetOnStart: true` 清掉上一轮记下的布局，所以**每次打开都是标准布局**。

默认（两行三列）：

| | 第 1 列 | 第 2 列 | 第 3 列 |
| --- | --- | --- | --- |
| 第一行 | 电脑监控 | 文件预览器 | 文件浏览器 |
| 第二行 | 空（占位） | DSH（跨两列） | |

第二行任务栏从左到右：`工作站` / **设置** / **外观** / **窗口 ▾** / 已开窗口芯片（每个带 × 关闭）。

- **设置 / 外观**：目前是占位按钮，点了只弹一条提示，接口留着以后接工程。
- **窗口 ▾**：下拉列出可加的窗口——电脑监控、文件预览器、文件浏览器、笔记、DSH、VSCode；点一个就**在界面最右侧新开一列**放它。
- 芯片上的 **×** 关掉窗口，关完自动收回空列/空行。

### 新增的两个窗口

- **电脑监控**：CPU（按时间片差值算百分比）、内存（已用/总量）、GPU（调 `nvidia-smi` 取利用率与显存；没有 NVIDIA 卡时显示「无 GPU 数据」），每 2 秒刷新。
- **文件预览器**：「选择文件…」或直接把文件拖进面板，图片内联显示、视频/音频可播放、文本按等宽字体显示；>4 MB 的文本与未知类型只显示文件信息。

配置文件：`scenarios/dev.json` 的 `layout: { mode: "grid", cells: [[...],[...]] }`，`cells` 里同一个 id 出现两次就是跨列/跨行。
