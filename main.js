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
const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
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
 * 关键：DSH_HOME 指向应用自己的 runtime 目录，避免和用户已装的 DSH 抢数据。
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
  else if (typeof ec.home === 'string' && ec.home) env.DSH_HOME = path.resolve(ROOT, ec.home)
  if (port) env.PORT = String(port)

  let proc
  try {
    proc = spawn(dshCmd, args, { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
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
    .map((d) => ({ name: d.name, path: path.join(abs, d.name), isDir: d.isDirectory(), hidden: d.name.startsWith('.') }))
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

function createWindow() {
  // 固定 1680×1040 在 1536×864 的屏上会被裁掉一截（面板右侧看不见），
  // 所以按工作区尺寸取比例，留出任务栏与边框。
  const area = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1680, Math.max(900, area.width - 40))
  const height = Math.min(1040, Math.max(600, area.height - 60))
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
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'))
  win.webContents.on('did-finish-load', () => win.webContents.send('app:boot', { ...boot }))
  if (process.argv.includes('--diag')) scheduleDiag()
  return win
}

/**
 * --diag：启动 30 秒后把渲染层实际布局与整窗截图落盘（logs/diag.json / diag.png）。
 * 断言"界面到底渲染出来没有"时用它，比远程调试端口可靠（本机 9222 会被拦）。
 */
function scheduleDiag() {
  const expr = `(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
    const g = document.getElementById('grid')
    return {
      viewport: { w: innerWidth, h: innerHeight },
      gridDisplay: g ? getComputedStyle(g).display : null,
      bootHidden: document.getElementById('boot').hidden,
      status: (document.getElementById('status') || {}).textContent,
      panels: [...document.querySelectorAll('.panel')].map((p) => ({
        id: p.dataset.panelId,
        title: (p.querySelector('.title') || {}).textContent,
        rect: r(p),
        dot: (p.querySelector('.dot') || {}).className,
        hasWebview: !!p.querySelector('webview'),
        body: ((p.querySelector('.panel-body') || {}).innerText || '').slice(0, 160),
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
    }, 30000)
  })
}

app.whenReady().then(() => createWindow())

app.on('window-all-closed', () => {
  kill('engine'); kill('vscode')
  app.quit()
})
app.on('before-quit', () => { kill('engine'); kill('vscode') })

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

ipcMain.handle('app:fs-list', (_e, dir) => {
  try { return { ok: true, ...listDir(dir) } } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('app:fs-read', (_e, p) => {
  try { return { ok: true, ...readFileSafe(p) } } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('app:open-external', (_e, url) => { shell.openExternal(url); return { ok: true } })
