'use strict'
/**
 * 个人工作站 · 主进程
 *
 * 职责（第一版）：
 *   1. 建窗口、建网格布局
 *   2. 拉起 DSH 引擎（自带 DSH_HOME，从 stdout 抓 token），把 URL 交给渲染层
 *   3. 尝试拉起 VSCode serve-web（失败不阻塞，面板会显示原因）
 *   4. 提供 launch 能力：一键拉起本地 app（DevEco / PyCharm / VMware / VSCode 桌面版）
 *   5. 提供 file 能力：读目录、读文件
 *
 * 设计原则（抄自 dsh-worktable 与 luanyujia-workbench 的教训）：
 *   · DSH_HOME 必须显式设置，否则会话会在界面里"消失"
 *   · 启动进度必须回传界面，不能让用户看白屏
 *   · 所有能力走 preload 白名单，渲染层不直接碰 fs / child_process
 */

const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')

// 常见坑：环境里带 ELECTRON_RUN_AS_NODE=1 时，electron.exe 会退化成纯 Node，
// require('electron') 只返回可执行文件路径字符串，app 为 undefined。
// 这里显式拦一下，给一句能直接照做的提示，而不是 "Cannot read properties of undefined"。
if (!app || typeof app.whenReady !== 'function') {
  console.error('[workbench] Electron 主进程 API 不可用。')
  console.error('           多半是环境变量 ELECTRON_RUN_AS_NODE=1 导致以纯 Node 方式运行。')
  console.error('           解决：在启动前执行  $env:ELECTRON_RUN_AS_NODE=$null  再运行 npm start')
  process.exit(1)
}
// 双击启动器容易点两次；有实例在跑就直接把它提到前台，不要再起一套引擎/编辑器。
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
})
const { spawn, spawnSync, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const http = require('node:http')

const ROOT = __dirname
const LOG_DIR = path.join(ROOT, 'logs')
const SCENARIO_DIR = path.join(ROOT, 'scenarios')
const HOME_DIR = path.join(ROOT, 'runtime')
fs.mkdirSync(LOG_DIR, { recursive: true })
fs.mkdirSync(HOME_DIR, { recursive: true })

// Electron 默认把 userData 放在 %APPDATA%\Electron，受限环境里写不进去，
// Chromium 会刷一屏 "Failed to create directory: ...\Code Cache" / "拒绝访问 (0x5)"。
// 统一收到工作区 runtime/userdata，顺带让缓存与运行期状态可随工程一起删。
try {
  const userData = path.join(HOME_DIR, 'userdata')
  fs.mkdirSync(userData, { recursive: true })
  app.setPath('userData', userData)
} catch (e) {
  console.error('[workbench] 设置 userData 失败:', e.message)
}

let win = null
const procs = {}
const boot = { stage: 'init', pct: 0, text: '准备中…', detail: '' }

function log(name, text) {
  try { fs.appendFileSync(path.join(LOG_DIR, name + '.log'), `[${new Date().toISOString()}] ${text}\n`) } catch {}
}

function setBoot(patch) {
  Object.assign(boot, patch)
  if (win && !win.isDestroyed()) win.webContents.send('app:boot', { ...boot })
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

/** HTTP 探活：只要能连上就算就绪（不看状态码，引擎健康页可能是 302/401） */
function probe(port, host = '127.0.0.1', timeout = 1200) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout }, (res) => { res.resume(); resolve(true) })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

function kill(name) {
  const p = procs[name]
  if (!p || p.exitCode !== null) { procs[name] = null; return }
  try { spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }) } catch {}
  procs[name] = null
}

// ───────────────────────────── 配置 ─────────────────────────────

function loadScenario(id) {
  const file = path.join(SCENARIO_DIR, (id || 'dev') + '.json')
  const raw = fs.readFileSync(file, 'utf8')
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
}

// ───────────────────────────── 引擎 ─────────────────────────────

let engineUrl = ''

/**
 * 拉起 DSH 引擎。
 *
 * 两个配置决定"能不能看到你本来的对话"：
 *   engine.home  —— DSH_HOME。指到 C:\Users\<你>\.dsh 就和本机 DSH 共用同一份
 *                   会话与凭据；指到 runtime/dsh-home 则是一份干净的空数据。
 *   engine.cwd   —— 引擎的工作目录。DSH 按工作目录分目录存会话
 *                   （sessions/--D-deepseek-…--），cwd 不对就只看到另一个目录的会话。
 */
async function startEngine(cfg) {
  const ec = cfg.engine || {}
  const dshCmd = ec.cmd || process.env.DSH_CMD || 'dsh'
  const args = ec.args || ['web', '--no-open', '--port', '0']
  const port = ec.port || 0 // 0 = 让引擎自己挑

  // 上一轮被强杀（或崩溃）时引擎会变成孤儿进程继续占着端口，
  // 新的引擎就会 "listen EADDRINUSE" 直接退出。这里先按 pid 记录清一遍。
  const pidFile = path.join(HOME_DIR, 'engine.pid')
  try {
    const old = Number(fs.readFileSync(pidFile, 'utf8').trim())
    if (old > 0) {
      spawnSync('taskkill', ['/pid', String(old), '/T', '/F'], { windowsHide: true })
      log('engine', '清掉上一轮残留 pid=' + old)
    }
  } catch { /* 没有 pid 文件就是第一次跑 */ }

  setBoot({ stage: 'engine', pct: 15, text: '正在启动 DSH 引擎…', detail: [dshCmd, ...args].join(' ') })

  const env = { ...process.env }
  // DSH_HOME 语义：
  //   false      → 删掉，用引擎自己的默认值
  //   "绝对路径" → 用这个（数据隔离，推荐自用时装一份独立 home）
  //   其它       → 继承当前进程（沿用你已装的 DSH 数据）
  if (ec.home === false) delete env.DSH_HOME
  else if (typeof ec.home === 'string' && ec.home) {
    const shared = path.resolve(ROOT, ec.home)
    if (fs.existsSync(shared) || shared.startsWith(ROOT)) {
      env.DSH_HOME = shared
    } else {
      // 配了共享 home 但机器上没有（换机器/删过），退回自己的 runtime 目录，别卡在启动失败
      env.DSH_HOME = path.join(HOME_DIR, 'dsh-home')
      log('engine', '共享 home 不存在，回退: ' + shared + ' -> ' + env.DSH_HOME)
    }
  }
  if (port) env.PORT = String(port)

  // 工作目录决定会话分组：DSH 把会话按"启动时的 cwd"存到 sessions/--<编码后的路径>--
  const workDir = typeof ec.cwd === 'string' && ec.cwd ? path.resolve(ROOT, ec.cwd) : ROOT
  if (workDir !== ROOT) log('engine', 'cwd = ' + workDir)

  let proc
  try {
    proc = spawn(dshCmd, args, { cwd: workDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
  } catch (err) {
    log('engine', 'spawn failed: ' + err)
    setBoot({ stage: 'engine-error', pct: 30, text: '引擎启动失败', detail: String(err) })
    return { ok: false, error: String(err) }
  }
  procs.engine = proc
  try { if (proc.pid) fs.writeFileSync(pidFile, String(proc.pid)) } catch {}

  let token = ''
  let url = ''
  const onData = (buf) => {
    const s = String(buf)
    log('engine', s.trim())
    const mTok = s.match(/token=([A-Za-z0-9_\-]{8,})/)
    if (mTok) token = mTok[1]
    const mUrl = s.match(/https?:\/\/127\.0\.0\.1:(\d{2,5})/)
    if (mUrl) url = `http://127.0.0.1:${mUrl[1]}`
  }
  proc.stdout.on('data', onData)
  proc.stderr.on('data', onData)
  proc.on('exit', (code) => { log('engine', 'exit ' + code) })

  // 轮询就绪：引擎可能在 stdout 打印 URL，也可能只监听端口
  const deadline = Date.now() + (ec.timeoutMs || 60000)
  while (Date.now() < deadline) {
    await sleep(400)
    if (proc.exitCode !== null) {
      setBoot({ stage: 'engine-error', pct: 30, text: '引擎提前退出', detail: 'code=' + proc.exitCode + '，详见 logs/engine.log' })
      return { ok: false, error: 'engine exited code=' + proc.exitCode }
    }
    let ready = false
    if (url) ready = await probe(Number(url.split(':').pop()))
    if (ready) break
    // 兜底：扫一遍前端配置里的端口
    if (!url && port && (await probe(port))) { url = `http://127.0.0.1:${port}`; break }
    const secs = Math.round((Date.now() - (deadline - (ec.timeoutMs || 60000))) / 1000)
    setBoot({ stage: 'engine-wait', pct: Math.min(85, 20 + Math.round(secs * 1.2)), text: '引擎启动中…', detail: secs + 's' })
  }

  if (!url) {
    setBoot({ stage: 'engine-error', pct: 30, text: '引擎启动超时', detail: '详见 logs/engine.log' })
    return { ok: false, error: 'timeout' }
  }

  engineUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url
  setBoot({ stage: 'ready', pct: 92, text: '引擎已就绪', detail: url })
  log('engine', 'ready ' + engineUrl)
  return { ok: true, url: engineUrl }
}

// ───────────────────────────── VSCode ─────────────────────────────

const vscode = { status: 'idle', url: '', error: '' }

/**
 * 尝试拉起 VSCode serve-web。
 * 已知问题：便携重排版 VSCode 的 CLI 会去下载 "VS Code Server"，
 * 而更新服务器对该 commit 返回 204，进程会直接退出 → 这里只等 25 秒，失败就降级。
 */
async function startVSCode(cfg) {
  const vc = cfg.vscode || {}
  if (vc.url) { // 用户已给出一个现成的地址（例如 code-server），直接用
    vscode.status = 'ready'; vscode.url = vc.url
    return vscode
  }
  if (vc.mode === 'off' || vc.mode === 'launcher') { vscode.status = 'off'; return vscode }

  const port = vc.port || 8899
  // 端口上已经有 code-server 在跑就直接复用，避免 EADDRINUSE 后新进程退出导致面板空白
  async function httpOk(p) {
    return await new Promise((resolve) => {
      const req = require('node:http').get({ host: '127.0.0.1', port: p, path: '/', timeout: 2500 }, (res) => {
        res.resume(); resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  }
  if ((await probe(port)) && (await httpOk(port))) {
    const folder = vc.folder ? `/?folder=${encodeURIComponent(vc.folder)}` : '/'
    vscode.status = 'ready'
    vscode.url = `http://127.0.0.1:${port}${folder}`
    log('vscode', '端口 ' + port + ' 已有实例，直接复用')
    return vscode
  }
  vscode.status = 'starting'
  setBoot({ stage: 'vscode', pct: 88, text: '正在启动 VSCode serve-web…', detail: 'port ' + port })

  // cmd/args 可在场景里覆盖：code-server 只需给 cmd=node + entry.js 的参数
  // 支持 {port} 占位符，避免端口写死在两处
  const cmd = vc.cmd || 'code'
  const args = Array.isArray(vc.args) && vc.args.length
    ? vc.args.map((a) => String(a).replace(/\{port\}/g, String(port)))
    : ['serve-web', '--port', String(port), '--without-connection-token', '--accept-server-license-terms']
  // 相对路径（如 vendor/cs/...）先解析成绝对路径：走 cmd 时会因为路径不存在于 PATH 而报
  // "'vendor' 不是内部或外部命令"。绝对路径就不必经过 shell。
  const abs = path.isAbsolute(cmd) ? cmd : path.resolve(ROOT, cmd)
  const useShell = !path.isAbsolute(cmd)
  log('vscode', 'spawn ' + abs)
  let proc
  try {
    proc = spawn(abs, args, { cwd: ROOT, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: useShell })
  } catch (err) {
    vscode.status = 'failed'; vscode.error = String(err); return vscode
  }
  procs.vscode = proc
  proc.stdout.on('data', (d) => log('vscode', String(d).trim()))
  proc.stderr.on('data', (d) => log('vscode', String(d).trim()))

  const deadline = Date.now() + (vc.timeoutMs || 25000)
  while (Date.now() < deadline) {
    await sleep(600)
    if (proc.exitCode !== null) {
      vscode.status = 'failed'
      vscode.error = '进程退出 code=' + proc.exitCode + '（详见 logs/vscode.log）'
      return vscode
    }
    if (await probe(port)) {
      // 探活通过后再确认一次：serve-web 可能在 202「正在下载服务端」阶段假活
      const folder = vc.folder ? `/?folder=${encodeURIComponent(vc.folder)}` : '/'
      vscode.status = 'ready'; vscode.url = `http://127.0.0.1:${port}${folder}`
      return vscode
    }
  }
  vscode.status = 'failed'
  vscode.error = `端口 ${port} 在 ${Math.round((vc.timeoutMs || 25000) / 1000)} 秒内未就绪（详见 logs/vscode.log）`
  log('vscode', 'ERROR ' + vscode.error)
  return vscode
}

// ───────────────────────────── 本地 app 启动 ─────────────────────────────

function launchApp(key, cfg) {
  const list = cfg.launchers || []
  const item = list.find((x) => x.key === key)
  if (!item) return { ok: false, error: 'unknown launcher: ' + key }
  try {
    const child = spawn(item.path, item.args || [], {
      detached: true, stdio: 'ignore', cwd: item.cwd || ROOT, shell: false,
    })
    child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ───────────────────────────── 文件能力 ─────────────────────────────

function listDir(dir) {
  const abs = path.resolve(dir)
  const ents = fs.readdirSync(abs, { withFileTypes: true })
    .map((d) => {
      const full = path.join(abs, d.name)
      const isDir = d.isDirectory()
      let size = 0
      let mtimeMs = 0
      try {
        const st = fs.statSync(full)
        size = isDir ? 0 : st.size
        mtimeMs = st.mtimeMs
      } catch (err) {}
      return { name: d.name, path: full, isDir, hidden: d.name.startsWith('.'), size, mtimeMs }
    })
    .sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)))
  return { path: abs, entries: ents.slice(0, 800) }
}

function readFileSafe(p) {
  const abs = path.resolve(p)
  const st = fs.statSync(abs)
  if (!st.isFile()) throw new Error('not a file')
  if (st.size > 4 * 1024 * 1024) throw new Error('file too large (>4MB)')
  const ext = (abs.split('.').pop() || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'].includes(ext)) {
    return { kind: 'image', path: abs, mime: 'image/' + (ext === 'jpg' ? 'jpeg' : ext), data: fs.readFileSync(abs).toString('base64') }
  }
  return { kind: 'text', path: abs, ext, text: fs.readFileSync(abs, 'utf8') }
}

// ───────────────────────────── 窗口 ─────────────────────────────


/* ── 文件预览 / 系统监控 ── */
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'])
const VID_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'])
const AUD_EXT = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'])
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif' }

ipcMain.handle('app:pick-file', async () => {
  try {
    const r = await dialog.showOpenDialog(win, { title: '选择要预览的文件', properties: ['openFile'] })
    if (r.canceled || !r.filePaths.length) return null
    return r.filePaths[0]
  } catch (err) { return null }
})

ipcMain.handle('app:preview', async (_e, p) => {
  try {
    const abs = path.resolve(String(p || ''))
    const st = fs.statSync(abs)
    if (!st.isFile()) return { ok: false, error: '不是文件：' + abs }
    const ext = path.extname(abs).toLowerCase()
    const base = { ok: true, path: abs, name: path.basename(abs), size: st.size, mtimeMs: st.mtimeMs, ext }
    if (IMG_EXT.has(ext) && st.size <= 40 * 1024 * 1024) {
      return Object.assign({}, base, { kind: 'image', dataUrl: 'data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + fs.readFileSync(abs).toString('base64') })
    }
    if (VID_EXT.has(ext)) return Object.assign({}, base, { kind: 'video', url: pathToFileURL(abs).href })
    if (AUD_EXT.has(ext)) return Object.assign({}, base, { kind: 'audio', url: pathToFileURL(abs).href })
    if (st.size <= 4 * 1024 * 1024) {
      return Object.assign({}, base, { kind: 'text', text: fs.readFileSync(abs, 'utf8') })
    }
    return Object.assign({}, base, { kind: 'other' })
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
})

let cpuPrev = os.cpus().map((c) => Object.assign({}, c.times))
ipcMain.handle('app:sys-stats', async () => {
  try {
    const now = os.cpus()
    let idle = 0
    let total = 0
    now.forEach((c, i) => {
      const t = c.times
      const p = cpuPrev[i] || t
      idle += t.idle - p.idle
      total += (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + (t.idle - p.idle)
    })
    cpuPrev = now.map((c) => Object.assign({}, c.times))
    const cpu = total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0
    const memTotal = os.totalmem()
    const memFree = os.freemem()
    let gpu = null
    try {
      const CAND = ['nvidia-smi', 'C:\\Windows\\System32\\nvidia-smi.exe', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe']
      let out = ''
      for (const bin of CAND) {
        try {
          out = execFileSync(bin, ['--query-gpu=utilization.gpu,memory.used,memory.total,name', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 2500, windowsHide: true })
          if (out) break
        } catch (e) {}
      }
      if (!out) throw new Error('no nvidia-smi')
      const line = String(out).trim().split(/\r?\n/)[0]
      const parts = line.split(',').map((s) => s.trim())
      gpu = { util: Math.round(parseFloat(parts[0])), usedMB: Math.round(parseFloat(parts[1])), totalMB: Math.round(parseFloat(parts[2])), name: parts[3] || 'GPU' }
    } catch (err) { gpu = null }
    return { ok: true, at: Date.now(), cpu, cpuCount: now.length, mem: { total: memTotal, used: memTotal - memFree }, gpu, platform: process.platform, host: os.hostname() }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
})

function createWindow() {
  // 注意 workAreaSize 是「设备像素」，而 BrowserWindow 的 width/height 是「CSS 像素」。
  // 本机缩放 125%，直接把设备像素传给 Electron 会让窗口比屏幕宽 25%——右侧一列被切掉。
  const d = screen.getPrimaryDisplay()
  const sf = d.scaleFactor || 1
  const width = Math.min(1680, Math.max(900, Math.round(d.workAreaSize.width / sf) - 20))
  const height = Math.min(1040, Math.max(600, Math.round(d.workAreaSize.height / sf) - 20))
  win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    title: '我的工作站',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })
  win.setMenuBarVisibility(false)
  win.maximize() // 默认全屏：用最大化而不是 exclusive fullscreen，保留任务栏与多屏切换
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'))
  win.webContents.on('did-finish-load', () => win.webContents.send('app:boot', { ...boot }))
  if (process.argv.includes('--diag')) scheduleDiag()

  // --docktest <key>：无人点击时自测「任务栏 → 停进 editor 面板」
  // --eval "<js>"：在渲染层执行一段脚本并把结果写到 logs/eval-result.json（无人值守自测用）
  const evFileIdx = process.argv.indexOf('--eval-file')
  const evIdx = process.argv.indexOf('--eval')
  if (evIdx >= 0 || evFileIdx >= 0) {
    let expr = evIdx >= 0 ? (process.argv[evIdx + 1] || '') : ''
    if (evFileIdx >= 0) {
      try { expr = fs.readFileSync(process.argv[evFileIdx + 1], 'utf8') } catch (err) { expr = 'null' }
    }
    setTimeout(async () => {
      try {
        const out = await win.webContents.executeJavaScript(expr)
        fs.writeFileSync(path.join(LOG_DIR, 'eval-result.json'), JSON.stringify({ ok: true, out }, null, 2), 'utf8')
        log('eval', 'ok ' + String(JSON.stringify(out)).slice(0, 400))
      } catch (err) {
        fs.writeFileSync(path.join(LOG_DIR, 'eval-result.json'), JSON.stringify({ ok: false, error: String(err) }, null, 2), 'utf8')
        log('eval', 'error ' + String(err))
      }
    }, 22000)
  }

  const dtIdx = process.argv.indexOf('--docktest')
  if (dtIdx >= 0) runDockTest(process.argv[dtIdx + 1] || 'pycharm')
  return win
}

/**
 * --diag：启动 30 秒后把渲染层实际布局与整窗截图落盘（logs/diag.json / diag.png）。
 * 断言"界面到底渲染出来没有"时用它，比远程调试端口可靠（本机 9222 会被拦）。
 */
async function runDockTest(key) {
  await new Promise((r) => setTimeout(r, 6000))
  try {
    let ready = null
    for (let i = 0; i < 60 && !(ready && ready.buttons > 0); i += 1) {
      ready = await win.webContents.executeJavaScript("window.__wtState ? window.__wtState() : null")
      if (!(ready && ready.buttons > 0)) await new Promise((r) => setTimeout(r, 1000))
    }
    log('dock', 'docktest ready=' + JSON.stringify(ready))
    const started = await win.webContents.executeJavaScript("window.__wtDock(" + JSON.stringify(key) + ")")
    log('dock', 'docktest invoke ' + key + ' -> ' + started)
    let res = null
    for (let i = 0; i < 90 && !res; i += 1) {
      res = await win.webContents.executeJavaScript("(async()=>{const l=await window.app.dockList();return l.includes(" + JSON.stringify(key) + ")?{ok:true}:null})()")
      if (!res) await new Promise((r) => setTimeout(r, 1000))
    }
    const rect = await win.webContents.executeJavaScript("(()=>{const b=document.querySelector('.panel[data-panel-id=\"editor\"] .panel-body');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
    const ui = await win.webContents.executeJavaScript("window.__wtState()")
    const reflowProbe = { before: null, after: null, bounds: null, hwnd: 0 }
    try {
      const sc2 = loadScenario('dev')
      const it2 = (sc2.launchers || []).find((l) => l.key === key)
      const exe2 = it2 && it2.path ? path.basename(String(it2.path)) : ''
      const f1 = await runWinDock(['--exe', exe2, '--find'])
      const m1 = /HWND\s+(\d+)/.exec(f1.out)
      if (m1) {
        reflowProbe.hwnd = Number(m1[1])
        reflowProbe.before = (await runWinDock(['--hwnd', String(reflowProbe.hwnd), '--probe'])).out
        const orig = win.getBounds()
        if (win.isMaximized()) { win.unmaximize(); await new Promise((r) => setTimeout(r, 900)) }
        win.setBounds({ x: orig.x, y: orig.y, width: 1100, height: 760 })
        await new Promise((r) => setTimeout(r, 2600))
        reflowProbe.bounds = win.getBounds()
        reflowProbe.after = (await runWinDock(['--hwnd', String(reflowProbe.hwnd), '--probe'])).out
      } else { reflowProbe.before = 'find-failed:' + f1.out }
    } catch (err) { reflowProbe.before = 'err:' + String(err) }
    fs.writeFileSync(path.join(LOG_DIR, 'dock-result.json'), JSON.stringify({ key, rect, res, ui, reflowProbe }, null, 2), 'utf8')
    log('dock', 'docktest ' + key + ' ' + JSON.stringify(res))
  } catch (e) { log('dock', 'docktest error ' + String(e)) }
}
function scheduleDiag() {
  const expr = `(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
    const ws = document.getElementById('grid')
    const colEls = [...document.querySelectorAll('.col')]
    const before = colEls.map((c) => Math.round(c.getBoundingClientRect().width))

    // 真的拖一下第一条竖直分隔条，验证"能调左右"；拖完双击恢复均分
    const sv = document.querySelector('.splitter-v')
    let drag = null
    if (sv) {
      const b = sv.getBoundingClientRect()
      const x = b.left + b.width / 2
      const y = b.top + b.height / 2
      const ev = (t, cx) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: cx, clientY: y, button: 0, buttons: t === 'pointerup' ? 0 : 1, pointerId: 7, isPrimary: true, pointerType: 'mouse' })
      sv.dispatchEvent(ev('pointerdown', x))
      window.dispatchEvent(ev('pointermove', x + 120))
      window.dispatchEvent(ev('pointerup', x + 120))
      const after = colEls.map((c) => Math.round(c.getBoundingClientRect().width))
      drag = { before, after, moved: after[0] !== before[0] }
      sv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      drag.afterReset = colEls.map((c) => Math.round(c.getBoundingClientRect().width))
    }

    // 再拖一次水平分隔条，验证"能调上下"
    const sh = document.querySelector('.splitter-h')
    let dragH = null
    if (sh) {
      const col = sh.parentElement
      const ps = [...col.querySelectorAll(':scope > .panel')]
      const hBefore = ps.map((p) => Math.round(p.getBoundingClientRect().height))
      const b = sh.getBoundingClientRect()
      const cx = b.left + b.width / 2
      const cy = b.top + b.height / 2
      const ev = (t, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: cx, clientY: y, button: 0, buttons: t === 'pointerup' ? 0 : 1, pointerId: 8, isPrimary: true, pointerType: 'mouse' })
      sh.dispatchEvent(ev('pointerdown', cy))
      window.dispatchEvent(ev('pointermove', cy - 80))
      window.dispatchEvent(ev('pointerup', cy - 80))
      const hAfter = ps.map((p) => Math.round(p.getBoundingClientRect().height))
      dragH = { before: hBefore, after: hAfter, moved: hBefore[0] !== hAfter[0] }
      sh.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      dragH.afterReset = ps.map((p) => Math.round(p.getBoundingClientRect().height))
    }

    return {
      viewport: { w: innerWidth, h: innerHeight },
      workspaceDisplay: ws ? getComputedStyle(ws).display : null,
      bootHidden: document.getElementById('boot').hidden,
      status: (document.getElementById('status') || {}).textContent,
      splitterCount: { v: document.querySelectorAll('.splitter-v').length, h: document.querySelectorAll('.splitter-h').length },
      drag,
      dragH,
      cols: colEls.map((c) => ({
        rect: r(c),
        panels: [...c.querySelectorAll(':scope > .panel')].map((p) => p.dataset.panelId),
        heights: [...c.querySelectorAll(':scope > .panel')].map((p) => Math.round(p.getBoundingClientRect().height)),
      })),
      panels: [...document.querySelectorAll('.panel')].map((p) => ({
        id: p.dataset.panelId,
        title: (p.querySelector('.title') || {}).textContent,
        rect: r(p),
        dot: (p.querySelector('.dot') || {}).className,
        hasWebview: !!p.querySelector('webview'),
        body: ((p.querySelector('.panel-body') || {}).innerText || '').slice(0, 120),
      })),
    }
  })()`
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const info = await win.webContents.executeJavaScript(expr)
        fs.writeFileSync(path.join(LOG_DIR, 'diag.json'), JSON.stringify(info, null, 2), 'utf8')
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(LOG_DIR, 'diag.png'), img.toPNG())
        log('diag', '已写 logs/diag.json 与 logs/diag.png')
      } catch (err) {
        log('diag', 'failed: ' + err.message)
      }
    }, Number(process.env.WT_DIAG_DELAY || 0) || 30000)
  })
}

app.whenReady().then(() => createWindow())

app.on('window-all-closed', () => {
  kill('engine'); kill('vscode')
  app.quit()
})
app.on('before-quit', () => {
  try {
    docked.forEach((d) => {
      const exe = path.join(ROOT, 'tools', 'WinDock.exe')
      if (fs.existsSync(exe)) spawnSync(exe, ['--hwnd', String(d.hwnd), '--undock'], { timeout: 3000 })
    })
    docked.clear()
  } catch (e) {}
  kill('engine'); kill('vscode')
})

// ───────────────────────────── IPC ─────────────────────────────

ipcMain.handle('app:scenario', (_e, id) => loadScenario(id))

ipcMain.handle('app:start', async (_e, scenarioId) => {
  const cfg = loadScenario(scenarioId)
  const results = { engine: null, vscode: null }
  results.engine = await startEngine(cfg)
  results.vscode = await startVSCode(cfg)
  setBoot({ stage: 'done', pct: 100, text: '就绪', detail: '' })
  // 落一份启动结果，便于「窗口看不见/没反应」时直接查日志定位
  try {
    fs.writeFileSync(LOG_DIR + '/start-result.json', JSON.stringify({
      at: new Date().toISOString(),
      scenario: scenarioId,
      engine: results.engine,
      vscode,
      url: engineUrl,
    }, null, 2), 'utf8')
  } catch (err) { log('start', 'write result failed: ' + err.message) }
  return { ok: true, engine: results.engine, vscode, url: engineUrl }
})

ipcMain.handle('app:engine-url', () => engineUrl)
ipcMain.handle('app:vscode-status', () => vscode)
ipcMain.handle('app:boot', () => ({ ...boot }))

ipcMain.handle('app:launch', (_e, key, scenarioId) => launchApp(key, loadScenario(scenarioId)))

// ── 任务栏停窗：把外部 exe 的窗口停到某块面板的区域里 ──
const docked = new Map()

function runWinDock(args) {
  const exe = path.join(ROOT, 'tools', 'WinDock.exe')
  if (!fs.existsSync(exe)) return Promise.resolve({ ok: false, out: '', error: 'WinDock.exe 缺失' })
  return new Promise((resolve) => {
    let out = ''
    const c = spawn(exe, args, { windowsHide: true })
    c.stdout.on('data', (d) => { out += String(d) })
    c.stderr.on('data', (d) => { out += String(d) })
    c.on('error', (e) => resolve({ ok: false, out, error: String(e) }))
    c.on('close', (code) => resolve({ ok: code === 0, code, out: out.trim() }))
  })
}

function winHwndBuffer() {
  try {
    if (!win) return 0
    const buf = win.getNativeWindowHandle()
    return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0)
  } catch (e) { return 0 }
}

async function findAppWindow(exeName, tries) {
  for (let i = 0; i < (tries || 80); i += 1) {
    const r = await runWinDock(['--exe', exeName, '--find'])
    const mt = /HWND\s+(\d+)/.exec(r.out)
    if (mt) return Number(mt[1])
    await new Promise((res) => setTimeout(res, 700))
  }
  return 0
}

async function placeWindow(hwnd, rect) {
  if (!win || !rect) return { ok: false, out: 'no-rect' }
  const d = screen.getDisplayMatching(win.getBounds())
  const sf = d.scaleFactor || 1
  const cb = win.getContentBounds()
  const args = [
    '--hwnd', String(hwnd),
    '--x', String(Math.round((cb.x + rect.x) * sf)),
    '--y', String(Math.round((cb.y + rect.y) * sf)),
    '--w', String(Math.round(rect.w * sf)),
    '--h', String(Math.round(rect.h * sf)),
  ]
  const owner = winHwndBuffer()
  if (owner) args.push('--owner', String(owner))
  return runWinDock(args)
}

async function embedWindow(hwnd, rect) {
  if (!win || !rect) return { ok: false, out: 'no-rect' }
  const d = screen.getDisplayMatching(win.getBounds())
  const sf = d.scaleFactor || 1
  const owner = winHwndBuffer()
  if (!owner) return { ok: false, out: 'no-owner' }
  const args = [
    '--hwnd', String(hwnd),
    '--embed',
    '--owner', String(owner),
    '--x', String(Math.round(rect.x * sf)),
    '--y', String(Math.round(rect.y * sf)),
    '--w', String(Math.round(rect.w * sf)),
    '--h', String(Math.round(rect.h * sf)),
  ]
  return runWinDock(args)
}

async function seatWindow(hwnd, rect) {
  if (!win || !rect) return { ok: false, out: 'no-rect' }
  const d = screen.getDisplayMatching(win.getBounds())
  const sf = d.scaleFactor || 1
  const args = [
    '--hwnd', String(hwnd),
    '--seat',
    '--x', String(Math.round(rect.x * sf)),
    '--y', String(Math.round(rect.y * sf)),
    '--w', String(Math.round(rect.w * sf)),
    '--h', String(Math.round(rect.h * sf)),
  ]
  return runWinDock(args)
}

function hookReflow() {
  if (!win || win.__reflowHooked) return
  win.__reflowHooked = true
  const send = () => { try { win.webContents.send('app:reflow') } catch (e) {} }
  win.on('move', send)
  win.on('resize', send)
}

async function dockApp(scenarioId, key, rect) {
  try {
    const sc = loadScenario(scenarioId)
    const item = (sc.launchers || []).find((l) => l.key === key)
    if (!item || !item.path) return { ok: false, error: '启动项不完整: ' + key }
    if (docked.has(key)) return { ok: true, hwnd: docked.get(key).hwnd, reused: true }
    const exeName = path.basename(String(item.path))
    let pid = 0
    try {
      const child = spawn(String(item.path), (item.args || []).map(String), { detached: true, stdio: 'ignore', cwd: ROOT })
      child.unref()
      pid = child.pid || 0
    } catch (err) { return { ok: false, error: '启动失败：' + String(err) } }
    log('dock', 'spawn ' + key + ' pid=' + pid)
    const hwnd = await findAppWindow(exeName)
    if (!hwnd) {
      log('dock', 'no-window ' + exeName)
      return { ok: false, error: '没等到「' + exeName + '」的窗口（可能已在运行且最小化）' }
    }
    const tb = (sc.taskbar || []).find((t) => t.key === key) || {}
    const pick = (v) => (v === 'embed' || v === 'owned' ? v : null)
    const want = pick(tb.dock) || pick(item.dock) || (sc.dockMode === 'embed' ? 'embed' : 'owned')
    const mode = want
    let r
    if (mode === 'embed') r = await embedWindow(hwnd, rect)
    else if (mode === 'embed') r = await embedWindow(hwnd, rect)
    else r = await placeWindow(hwnd, rect)
    docked.set(key, { hwnd, pid, label: item.label || key, mode })
    hookReflow()
    log('dock', 'ok ' + key + ' hwnd=' + hwnd + ' ' + JSON.stringify(rect) + ' ' + r.out)
    return { ok: true, hwnd, pid }
  } catch (err) { return { ok: false, error: String(err) } }
}

ipcMain.handle('app:dock', (_e, scenarioId, key, rect) => dockApp(scenarioId, key, rect))

ipcMain.handle('app:move-dock', async (_e, key, rect) => {
  const d = docked.get(key)
  if (!d) return { ok: false, error: '未停靠' }
  const r = d.mode === 'embed' ? await seatWindow(d.hwnd, rect) : await placeWindow(d.hwnd, rect)
  log('dock', 'move ' + key + ' ' + JSON.stringify(rect) + ' ' + (r.out || '').trim())
  return { ok: r.ok, out: r.out, mode: d.mode }
})

ipcMain.handle('app:undock', async (_e, key) => {
  const d = docked.get(key)
  if (!d) return { ok: false }
  docked.delete(key)
  await runWinDock(['--hwnd', String(d.hwnd), '--undock'])
  log('dock', 'undock ' + key)
  return { ok: true }
})

ipcMain.handle('app:dock-list', () => Array.from(docked.keys()))

function listRoots() {
  const items = []
  for (let i = 67; i <= 90; i += 1) {
    const letter = String.fromCharCode(i)
    const p = letter + ':\\'
    try { if (fs.existsSync(p)) items.push({ name: letter + ':', path: p, kind: 'drive' }) } catch (e) {}
  }
  const home = os.homedir()
  const quick = [
    { name: '用户目录', path: home },
    { name: '桌面', path: path.join(home, 'Desktop') },
    { name: '下载', path: path.join(home, 'Downloads') },
    { name: '文档', path: path.join(home, 'Documents') },
    { name: 'DSH 数据', path: path.join(home, '.dsh') },
    { name: '工作站', path: ROOT },
  ]
  for (const q of quick) {
    try { if (q.path && fs.existsSync(q.path)) items.push({ name: q.name, path: q.path, kind: 'quick' }) } catch (e) {}
  }
  return items
}

ipcMain.handle('app:fs-roots', () => {
  try { return { ok: true, items: listRoots() } } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('app:fs-list', (_e, dir) => {
  try { return { ok: true, ...listDir(dir) } } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('app:open-path', async (_e, p) => {
  try {
    const err = await shell.openPath(path.resolve(p))
    return err ? { ok: false, error: err } : { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('app:fs-read', (_e, p) => {
  try { return { ok: true, ...readFileSafe(p) } } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('app:note-save', (_e, p, text) => {
  try {
    if (typeof p !== 'string' || !p) return { ok: false, error: '路径为空' }
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, String(text == null ? '' : text), 'utf8')
    return { ok: true, path: p, bytes: Buffer.byteLength(String(text || ''), 'utf8') }
  } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) } }
})

ipcMain.handle('app:open-external', (_e, url) => { shell.openExternal(url); return { ok: true } })
