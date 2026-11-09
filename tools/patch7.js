'use strict'
/* 第七轮：第一行改书签栏（本地/网站）+ 右键菜单 + 图标提取 */
const fs = require('node:fs')
const P = 'E:/Work/workbench/'
const log = (...a) => console.log('[patch7]', ...a)

/* ---------- 1. main.js：launch-path / exe-icon / fetch-icon ---------- */
let m = fs.readFileSync(P + 'main.js', 'utf8')
if (!m.includes("'app:launch-path'")) {
  const anchor = "app.whenReady().then(() => createWindow())"
  const block = `/* ───────── 第一行任务栏：按路径启动 / 提图标 / 取网站图标 ───────── */
ipcMain.handle('app:launch-path', async (_e, target) => {
  try {
    const p = path.resolve(String(target || ''))
    if (!fs.existsSync(p)) return { ok: false, error: '文件不存在：' + p }
    spawn(p, [], { detached: true, stdio: 'ignore', cwd: path.dirname(p) }).unref()
    return { ok: true, path: p }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

const iconCache = new Map()

ipcMain.handle('app:exe-icon', async (_e, target) => {
  try {
    const p = path.resolve(String(target || ''))
    if (!fs.existsSync(p)) return { ok: false, error: '文件不存在' }
    if (iconCache.has(p)) return { ok: true, dataUrl: iconCache.get(p) }
    const out = path.join(LOG_DIR, 'icon-' + Buffer.from(p).toString('hex').slice(0, 24) + '.png')
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      '$src = ' + "'" + p.replace(/'/g, "''") + "'",
      '$dst = ' + "'" + out.replace(/'/g, "''") + "'",
      '$ico = [System.Drawing.Icon]::ExtractAssociatedIcon($src)',
      'if (-not $ico) { exit 2 }',
      '$bmp = New-Object System.Drawing.Bitmap 48, 48',
      '$g = [System.Drawing.Graphics]::FromImage($bmp)',
      '$g.InterpolationMode = "HighQualityBicubic"',
      '$g.Clear([System.Drawing.Color]::Transparent)',
      '$g.DrawImage($ico.ToBitmap(), (New-Object System.Drawing.Rectangle 0,0,48,48))',
      '$bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)',
      '$g.Dispose(); $bmp.Dispose(); $ico.Dispose()',
    ].join('; ')
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, windowsHide: true })
    if (r.status !== 0 || !fs.existsSync(out)) {
      return { ok: false, error: '取图标失败' + (r.stderr ? '：' + String(r.stderr).slice(0, 120) : '') }
    }
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(out).toString('base64')
    try { fs.unlinkSync(out) } catch (err) {}
    iconCache.set(p, dataUrl)
    return { ok: true, dataUrl }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('app:fetch-icon', async (_e, target) => {
  const http = require('node:http')
  const https = require('node:https')
  const clean = (u) => String(u || '').trim().replace(/^["']|["']$/g, '')
  let base = clean(target)
  if (!/^https?:\\/\\//i.test(base)) base = 'https://' + base
  let origin = ''
  try { origin = new URL(base).origin } catch (err) { return { ok: false, error: '网址格式不对' } }
  if (iconCache.has('W' + origin)) return { ok: true, dataUrl: iconCache.get('W' + origin) }

  const tryGet = (url) => new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { timeout: 6000, headers: { 'user-agent': 'Mozilla/5.0 workbench' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(tryGet(new URL(res.headers.location, url).toString()))
        return
      }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > 400 * 1024) { req.destroy(); resolve(null); return }
        chunks.push(c)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })

  const candidates = [origin + '/favicon.ico', origin + '/favicon.png']
  for (const u of candidates) {
    const buf = await tryGet(u)
    if (buf && buf.length > 100) {
      const dataUrl = 'data:image/png;base64,' + buf.toString('base64')
      iconCache.set('W' + origin, dataUrl)
      return { ok: true, dataUrl }
    }
  }
  return { ok: false, error: '该网站没有可用的 favicon' }
})

` + anchor
  m = m.replace(anchor, block)
  fs.writeFileSync(P + 'main.js', m, 'utf8')
  log('main.js 三个 IPC 已加')
}

/* ---------- 2. preload ---------- */
let pre = fs.readFileSync(P + 'preload.js', 'utf8')
if (!pre.includes('launchPath')) {
  pre = pre.replace(`  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),`, `  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  launchPath: (p) => ipcRenderer.invoke('app:launch-path', p),
  exeIcon: (p) => ipcRenderer.invoke('app:exe-icon', p),
  fetchIcon: (u) => ipcRenderer.invoke('app:fetch-icon', u),`)
  fs.writeFileSync(P + 'preload.js', pre, 'utf8')
  log('preload 已加 launchPath / exeIcon / fetchIcon')
}

/* ---------- 3. index.html 挂 bar.js ---------- */
let html = fs.readFileSync(P + 'renderer/index.html', 'utf8')
if (!html.includes('bar.js')) {
  html = html.replace('<script src="./renderers.js"></script>', '<script src="./renderers.js"></script>\n  <script src="./bar.js"></script>')
  fs.writeFileSync(P + 'renderer/index.html', html, 'utf8')
  log('index.html 已挂 bar.js')
}

/* ---------- 4. renderer.js：第一栏交给 bar.js，另加 __wtAddWeb/__wtToast ---------- */
let r = fs.readFileSync(P + 'renderer/renderer.js', 'utf8')
const bStart = r.indexOf('function buildTaskbar(sc) {')
const bEnd = r.indexOf('// ───────────────────────────── 第二行任务栏', bStart)
if (bStart > 0 && bEnd > bStart) {
  const stub = `function buildTaskbar(sc) {
  if (window.__wtBuildBar) return window.__wtBuildBar(sc)
}

window.__wtToast = toast
window.__wtAddWeb = function (url, title) {
  const sc = state.scenario || {}
  const id = 'web-' + Date.now().toString(36)
  sc.panels = sc.panels || []
  sc.panels.push({ id: id, type: 'web', title: title || url, url: url })
  if (state.gridMode) {
    const cells = gridCells()
    cells.forEach((row) => row.push(id))
    gridRender()
    rerenderPanels()
    buildWindowBar(sc)
    if (typeof saveUi === 'function') saveUi()
  } else {
    addPanelByType('web')
  }
  return id
}

`
  r = r.slice(0, bStart) + stub + r.slice(bEnd)
  fs.writeFileSync(P + 'renderer/renderer.js', r, 'utf8')
  log('buildTaskbar 已交给 bar.js')
}

/* ---------- 5. 样式 ---------- */
let C = fs.readFileSync(P + 'renderer/styles.css', 'utf8')
if (!C.includes('.lbar-item')) {
  C += `
/* ───────── 第一行：书签式任务栏 ───────── */
.lbar { display: flex; align-items: center; gap: 8px; overflow: visible; }
.lbar-brand { font-size: 12px; opacity: .5; letter-spacing: .1em; }
.lbar-group { display: flex; align-items: center; gap: 6px; }
.lbar-cap { font-size: 12px; opacity: .6; }
.lbar-list { display: flex; align-items: center; gap: 4px; min-height: 26px; }
.lbar-item {
  width: 30px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 6px; background: transparent; cursor: pointer;
  padding: 0;
}
.lbar-item:hover { background: rgba(255, 255, 255, .07); border-color: rgba(255, 255, 255, .1); }
.lbar-item.dragging { opacity: .4; }
.lbar-item.drop-target { border-color: rgba(79, 142, 247, .9); background: rgba(79, 142, 247, .16); }
.lbar-ico { width: 18px; height: 18px; object-fit: contain; display: block; }
.lbar-ph { font-size: 12px; opacity: .75; }
.lbar-empty { font-size: 11px; opacity: .35; }
.lbar-sep { width: 1px; height: 18px; background: rgba(255, 255, 255, .16); margin: 0 6px; }

/* 右键菜单 */
.lbar-menu {
  position: fixed; z-index: 2000; min-width: 132px; padding: 4px;
  background: #171b23; border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 8px; box-shadow: 0 12px 30px rgba(0, 0, 0, .55);
}
.lbar-menu-item {
  display: block; width: 100%; padding: 7px 10px;
  border: 0; border-radius: 6px; background: transparent; color: #dfe5ee;
  font-size: 12.5px; text-align: left; cursor: pointer;
}
.lbar-menu-item:hover { background: rgba(79, 142, 247, .22); }
.lbar-menu-item.danger { color: #ff8b93; }
.lbar-menu-item.danger:hover { background: rgba(244, 49, 70, .22); }
.lbar-menu-sep { height: 1px; margin: 4px 4px; background: rgba(255, 255, 255, .12); }

/* 新增/修改弹窗 */
.lbar-pop {
  position: fixed; z-index: 2100; width: 460px; max-height: 78vh; display: flex; flex-direction: column;
  background: #141821; border: 1px solid rgba(255, 255, 255, .14); border-radius: 10px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, .6); padding: 12px;
}
.lbar-pop-head { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.lbar-seg { display: inline-flex; gap: 6px; margin-bottom: 10px; }
.lbar-seg-btn {
  height: 26px; padding: 0 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, .14); background: transparent; color: inherit; font-size: 12px;
}
.lbar-seg-btn.on { border-color: rgba(79, 142, 247, .85); background: rgba(79, 142, 247, .18); }
.lbar-pop-body { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: auto; }
.lbar-row { display: flex; gap: 6px; }
.lbar-input {
  flex: 1 1 auto; height: 28px; padding: 0 8px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, .14); background: rgba(0, 0, 0, .25); color: inherit; font-size: 12px; outline: none;
}
.lbar-input:focus { border-color: rgba(79, 142, 247, .7); }
.lbar-btn {
  height: 28px; padding: 0 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
  border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .05); color: inherit;
}
.lbar-btn:hover { background: rgba(255, 255, 255, .1); }
.lbar-btn.primary { border-color: rgba(79, 142, 247, .8); background: rgba(79, 142, 247, .25); }
.lbar-btn.small { height: 22px; padding: 0 8px; }
.lbar-browse { border: 1px solid rgba(255, 255, 255, .1); border-radius: 8px; overflow: hidden; }
.lbar-browse-bar { display: flex; align-items: center; gap: 8px; padding: 6px; background: rgba(255, 255, 255, .04); }
.lbar-browse-path { font-size: 11px; opacity: .6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbar-browse-list { max-height: 240px; overflow: auto; padding: 4px; }
.lbar-frow { display: flex; align-items: center; gap: 6px; padding: 3px 5px; border-radius: 5px; cursor: pointer; font-size: 12px; }
.lbar-frow:hover { background: rgba(79, 142, 247, .18); }
.lbar-ficon { width: 16px; }
.lbar-fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbar-pop-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
`
  fs.writeFileSync(P + 'renderer/styles.css', C, 'utf8')
  log('样式已追加')
}

log('done')
