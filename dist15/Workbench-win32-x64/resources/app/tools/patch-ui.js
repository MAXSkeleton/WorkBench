'use strict'
/* 一次性改造：自动重置 / 任务栏三区 + 窗口下拉 / 网格布局 / 预览器 / 电脑监控 */
const fs = require('node:fs')
const P = 'E:/Work/workbench/'
const log = (...a) => console.log('[patch]', ...a)

/* ---------------- 1. main.js ---------------- */
let m = fs.readFileSync(P + 'main.js', 'utf8')
if (!m.includes("app:sys-stats")) {
  m = m.replace("ipcMain, shell }", "ipcMain, shell, dialog }")
  if (!m.includes("require('node:url')")) {
    m = m.replace("const os = require('node:os')", "const os = require('node:os')\nconst { pathToFileURL } = require('node:url')")
  }
  const block = `
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
      const out = execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used,memory.total,name', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 2000, windowsHide: true })
      const line = String(out).trim().split(/\\r?\\n/)[0]
      const parts = line.split(',').map((s) => s.trim())
      gpu = { util: Math.round(parseFloat(parts[0])), usedMB: Math.round(parseFloat(parts[1])), totalMB: Math.round(parseFloat(parts[2])), name: parts[3] || 'GPU' }
    } catch (err) { gpu = null }
    return { ok: true, at: Date.now(), cpu, cpuCount: now.length, mem: { total: memTotal, used: memTotal - memFree }, gpu, platform: process.platform, host: os.hostname() }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
})

function createWindow(`
  m = m.replace('function createWindow(', block)
  fs.writeFileSync(P + 'main.js', m, 'utf8')
  log('main.js: 已加 pick-file / preview / sys-stats')
} else log('main.js 已有监控接口，跳过')

/* ---------------- 2. preload.js ---------------- */
let pre = fs.readFileSync(P + 'preload.js', 'utf8')
if (!pre.includes('sysStats')) {
  pre = pre.replace(/(\n\s*)noteSave:/, `$1pickFile: () => ipcRenderer.invoke('app:pick-file'),$1preview: (p) => ipcRenderer.invoke('app:preview', p),$1sysStats: () => ipcRenderer.invoke('app:sys-stats'),$1noteSave:`)
  fs.writeFileSync(P + 'preload.js', pre, 'utf8')
  log('preload.js: pickFile / preview / sysStats')
} else log('preload.js 已有，跳过')

/* ---------------- 3. renderers.js ---------------- */
let R = fs.readFileSync(P + 'renderer/renderers.js', 'utf8')
if (!R.includes('window.RENDERERS.preview')) {
  R += `

/* ───────────── 文件预览器 ───────────── */
function pvSize(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return n + ' 字节'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

window.RENDERERS.preview = function (body, panel, api) {
  const wrap = el('div', 'pv')
  const bar = el('div', 'pv-bar')
  const pick = el('button', 'pv-btn', '选择文件…')
  const pathEl = el('div', 'pv-path', '还没有选择文件')
  bar.appendChild(pick)
  bar.appendChild(pathEl)
  const view = el('div', 'pv-view')
  view.appendChild(el('div', 'empty', '选一个图片 / 视频 / 文本，这里原地显示'))
  wrap.appendChild(bar)
  wrap.appendChild(view)
  body.innerHTML = ''
  body.appendChild(wrap)

  function showMsg(text) {
    view.innerHTML = ''
    view.appendChild(el('div', 'empty', text))
  }

  async function show(p) {
    if (!p) return
    pathEl.textContent = '读取中…'
    const res = await api.preview(p)
    if (!res || !res.ok) {
      pathEl.textContent = p
      showMsg((res && res.error) || '读取失败')
      return
    }
    pathEl.textContent = res.path + '   ·   ' + res.name + '   ·   ' + pvSize(res.size)
    view.innerHTML = ''
    if (res.kind === 'image') {
      const img = el('img', 'pv-img')
      img.src = res.dataUrl
      img.alt = res.name
      view.appendChild(img)
    } else if (res.kind === 'video') {
      const v = document.createElement('video')
      v.className = 'pv-video'
      v.src = res.url
      v.controls = true
      view.appendChild(v)
    } else if (res.kind === 'audio') {
      const a = document.createElement('audio')
      a.src = res.url
      a.controls = true
      a.className = 'pv-audio'
      view.appendChild(a)
    } else if (res.kind === 'text') {
      view.appendChild(el('pre', 'pv-text', res.text))
    } else {
      showMsg('这个类型只能显示文件信息：' + res.name + '（' + pvSize(res.size) + '）')
    }
  }

  pick.addEventListener('click', async () => {
    const p = await api.pickFile()
    if (p) show(p)
  })
  wrap.addEventListener('dragover', (ev) => ev.preventDefault())
  wrap.addEventListener('drop', (ev) => {
    ev.preventDefault()
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]
    if (f && f.path) show(f.path)
  })
}

/* ───────────── 电脑监控 ───────────── */
window.RENDERERS.monitor = function (body, panel, api) {
  const wrap = el('div', 'mon')
  function row(label) {
    const r = el('div', 'mon-row')
    const l = el('div', 'mon-label', label)
    const bar = el('div', 'mon-bar')
    const fill = document.createElement('i')
    bar.appendChild(fill)
    const val = el('div', 'mon-val', '—')
    r.appendChild(l)
    r.appendChild(bar)
    r.appendChild(val)
    return { r: r, fill: fill, val: val, bar: bar }
  }
  const cpu = row('CPU')
  const mem = row('内存')
  const gpu = row('GPU')
  const sub = el('div', 'mon-sub', '采样中…')
  wrap.appendChild(cpu.r)
  wrap.appendChild(mem.r)
  wrap.appendChild(gpu.r)
  wrap.appendChild(sub)
  body.innerHTML = ''
  body.appendChild(wrap)

  function paint(item, pct, text, extra) {
    const p = Math.max(0, Math.min(100, pct || 0))
    item.fill.style.width = p + '%'
    item.fill.dataset.level = p > 85 ? 'hot' : p > 60 ? 'warm' : 'cool'
    item.val.textContent = text
    if (extra != null) item.bar.title = extra
  }

  let timer = null
  let alive = true
  async function tick() {
    if (!alive) return
    const s = await api.sysStats()
    if (!alive) return
    if (!s || !s.ok) {
      sub.textContent = '读取失败：' + ((s && s.error) || '未知错误')
    } else {
      paint(cpu, s.cpu, s.cpu + '%', s.cpuCount + ' 线程')
      const mp = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0
      paint(mem, mp, (s.mem.used / 1024 / 1024 / 1024).toFixed(1) + ' / ' + (s.mem.total / 1024 / 1024 / 1024).toFixed(1) + ' GB')
      if (s.gpu) {
        paint(gpu, s.gpu.util, s.gpu.util + '%', s.gpu.usedMB + ' / ' + s.gpu.totalMB + ' MB')
        sub.textContent = (s.gpu.name || 'GPU') + ' · 每 2 秒刷新'
      } else {
        paint(gpu, 0, '无 GPU 数据')
        sub.textContent = '没检测到 nvidia-smi，只显示 CPU / 内存 · 每 2 秒刷新'
      }
    }
    timer = setTimeout(tick, 2000)
  }
  tick()
}
`
  fs.writeFileSync(P + 'renderer/renderers.js', R, 'utf8')
  log('renderers.js: preview / monitor')
} else log('renderers.js 已有新渲染器，跳过')

/* ---------------- 4. renderer.js ---------------- */
let r = fs.readFileSync(P + 'renderer/renderer.js', 'utf8')

if (!r.includes('sc.resetOnStart')) {
  r = r.replace('  const sc = await window.app.scenario(SCENARIO_ID)\n  state.scenario = sc',
    `  const sc = await window.app.scenario(SCENARIO_ID)
  state.scenario = sc
  if (sc && sc.resetOnStart) {
    try {
      localStorage.removeItem(STORE_KEY)
      localStorage.removeItem('workbench.layouts.v3')
    } catch (err) {}
  }`)
}

if (!r.includes('buildGridWorkspace(sc)')) {
  r = r.replace('  buildSecondBar(sc)\n  buildWorkspace(sc)',
    `  buildSecondBar(sc)
  if ((sc.layout || {}).mode === 'grid') buildGridWorkspace(sc)
  else buildWorkspace(sc)`)
}

if (!r.includes("if (state.gridMode) return")) {
  r = r.replace(`function applySizes() {
  const ws = $('grid')
  if (!ws || !state.model || !state.cols.length) return`,
`function applySizes() {
  if (state.gridMode) return
  const ws = $('grid')
  if (!ws || !state.model || !state.cols.length) return`)
}

if (!r.includes('if (state.gridMode) {\n    buildWindowBar')) {
  r = r.replace('function layoutChanged() {', `function layoutChanged() {
  if (state.gridMode) {
    buildWindowBar(state.scenario)
    return
  }`)
}

if (!r.includes('gridRemove(id)')) {
  r = r.replace(`function closePanel(id) {
  const el = panelEl(id)
  if (el) el.remove()
  delete state.panels[id]
  layoutChanged()
}`,
`function closePanel(id) {
  const el = panelEl(id)
  if (el) el.remove()
  delete state.panels[id]
  if (state.gridMode) {
    gridRemove(id)
    gridRender()
    rerenderPanels()
    buildWindowBar(state.scenario)
    return
  }
  layoutChanged()
}`)
}

/* 替换 buildWindowBar */
const wi = r.indexOf('function buildWindowBar(sc) {')
let replacedBar = false
if (wi >= 0) {
  const end = r.indexOf('\n}\n', wi)
  if (end > 0) {
    const newBar = `function buildWindowBar(sc) {
  const bar = $('taskbar2')
  if (!bar) return
  bar.hidden = false
  bar.innerHTML = ''
  const left = document.createElement('div')
  left.className = 'tb-left'

  const brand = document.createElement('span')
  brand.className = 'tb-brand'
  brand.textContent = '工作站'
  left.appendChild(brand)

  const plain = (label, fn, title) => {
    const b = document.createElement('button')
    b.className = 'tb-btn'
    b.textContent = label
    if (title) b.title = title
    b.addEventListener('click', fn)
    left.appendChild(b)
    return b
  }
  plain('设置', () => toast('设置面板还空着，接口已留好，后面接工程'), '占位：设置')
  plain('外观', () => toast('外观面板还空着，接口已留好，后面接工程'), '占位：外观')

  const menW = document.createElement('div')
  menW.className = 'tb-menu-wrap'
  const winBtn = document.createElement('button')
  winBtn.className = 'tb-btn tb-menu-btn'
  winBtn.textContent = '窗口 ▾'
  winBtn.title = '添加一个窗口到界面右侧'
  const menu = document.createElement('div')
  menu.className = 'tb-menu'
  menu.hidden = true
  ;(sc.windows || []).forEach((w) => {
    const it = document.createElement('button')
    it.className = 'tb-menu-item'
    it.textContent = w.title || w.type
    it.addEventListener('click', (ev) => {
      ev.stopPropagation()
      menu.hidden = true
      addWindow(w.type)
    })
    menu.appendChild(it)
  })
  winBtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    menu.hidden = !menu.hidden
  })
  document.addEventListener('click', () => { if (menu) menu.hidden = true })
  menW.appendChild(winBtn)
  menW.appendChild(menu)
  left.appendChild(menW)

  const sep = document.createElement('span')
  sep.className = 'tb-sep'
  left.appendChild(sep)

  Object.keys(state.panels).forEach((id) => {
    const rec = state.panels[id]
    const chip = document.createElement('span')
    chip.className = 'tb-win'
    const nm = document.createElement('b')
    nm.textContent = (rec.panel && rec.panel.title) || id
    chip.appendChild(nm)
    const x = document.createElement('button')
    x.className = 'tb-x'
    x.textContent = '×'
    x.title = '关闭这个窗口'
    x.addEventListener('click', (ev) => {
      ev.stopPropagation()
      closePanel(id)
    })
    chip.appendChild(x)
    left.appendChild(chip)
  })

  bar.appendChild(left)
  const hint = document.createElement('div')
  hint.className = 'tb-right'
  hint.textContent = '「窗口 ▾」添加；× 关闭；关闭后其余窗口自动补位'
  bar.appendChild(hint)
}
`
    r = r.slice(0, wi) + newBar + r.slice(end + 3)
    replacedBar = true
  }
}
log('buildWindowBar 替换成功:', replacedBar)

if (!r.includes('function buildGridWorkspace')) {
  r += `

// ══════════ 网格布局（两行三列，可向右扩展） ══════════

function gridCells() {
  if (!state.grid) state.grid = { cells: [] }
  return state.grid.cells
}

function gridRender() {
  const ws = $('grid')
  if (!ws) return
  const cells = gridCells()
  const rows = Math.max(1, cells.length)
  const cols = Math.max(1, ...cells.map((x) => x.length))
  cells.forEach((row) => { while (row.length < cols) row.push('') })

  const letters = new Map()
  let seq = 0
  const nameFor = (id) => {
    if (!letters.has(id)) {
      seq += 1
      letters.set(id, 'w' + seq)
    }
    return letters.get(id)
  }
  const areas = []
  const empties = []
  for (let ri = 0; ri < rows; ri += 1) {
    const line = []
    for (let ci = 0; ci < cols; ci += 1) {
      const id = cells[ri][ci]
      if (!id) {
        const nm = 'z' + ri + 'x' + ci
        line.push(nm)
        empties.push({ nm: nm })
      } else line.push(nameFor(id))
    }
    areas.push(line)
  }

  ws.className = 'workspace gridmode'
  ws.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))'
  ws.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))'
  ws.style.gridTemplateAreas = areas.map((l) => '"' + l.join(' ') + '"').join(' ')
  ws.innerHTML = ''
  state.panels = {}

  const seen = new Set()
  for (let ri = 0; ri < rows; ri += 1) {
    for (let ci = 0; ci < cols; ci += 1) {
      const id = cells[ri][ci]
      if (!id || seen.has(id)) continue
      seen.add(id)
      const def = (state.scenario.panels || []).find((x) => x.id === id)
      if (!def) continue
      const box = makePanel(def)
      box.style.gridArea = nameFor(id)
      ws.appendChild(box)
    }
  }
  empties.forEach((e) => {
    const ph = document.createElement('div')
    ph.className = 'cell-empty'
    ph.style.gridArea = e.nm
    ws.appendChild(ph)
  })
}

function buildGridWorkspace(sc) {
  state.gridMode = true
  const spec = sc.layout || {}
  state.grid = { cells: (spec.cells || [['', '', ''], ['', '', '']]).map((x) => x.slice()) }
  gridRender()
  buildWindowBar(sc)
}

function rerenderPanels() {
  Object.keys(state.panels).forEach((id) => renderPanel(id))
}

function gridRemove(id) {
  const cells = gridCells()
  cells.forEach((row) => {
    row.forEach((v, i) => { if (v === id) row[i] = '' })
  })
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    if (cells[i].every((v) => !v)) cells.splice(i, 1)
  }
  const cols = Math.max(0, ...cells.map((r2) => r2.length))
  for (let c = cols - 1; c >= 0; c -= 1) {
    if (cells.every((row) => !row[c])) cells.forEach((row) => row.splice(c, 1))
  }
  if (!cells.length) cells.push(['', '', ''])
}

function addWindow(type) {
  const sc = state.scenario || {}
  const def = (sc.windows || []).find((w) => w.type === type) || { type: type, title: type }
  const id = type + '-' + Date.now().toString(36)
  const panel = { id: id, type: type, title: def.title || type }
  if (type === 'file') panel.root = 'roots'
  if (type === 'note') panel.root = (sc.notes || {}).root || 'E:/Obsidian/note'
  if (type === 'web') panel.embed = 'engine'
  if (type === 'vscode') panel.fallbackUrl = 'http://127.0.0.1:' + ((sc.vscode && sc.vscode.port) || 9123)
  sc.panels = sc.panels || []
  sc.panels.push(panel)

  if (state.gridMode) {
    const cells = gridCells()
    cells.forEach((row) => row.push(id))
    gridRender()
    rerenderPanels()
    buildWindowBar(sc)
  } else {
    addPanelByType(type)
  }
  return id
}

let toastTimer = null
function toast(msg) {
  let t = document.getElementById('wt-toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'wt-toast'
    t.className = 'wt-toast'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400)
}
`
}
fs.writeFileSync(P + 'renderer/renderer.js', r, 'utf8')
log('renderer.js 已更新')

/* ---------------- 5. styles.css ---------------- */
let C = fs.readFileSync(P + 'renderer/styles.css', 'utf8')
if (!C.includes('.workspace.gridmode')) {
  C += `
/* ── 网格模式 ── */
.workspace.gridmode {
  display: grid;
  gap: 6px;
  padding: 6px;
  padding-bottom: 30px;
  height: calc(100vh - 38px - 34px);
}
.workspace.gridmode > .panel { min-width: 0; min-height: 0; }
.cell-empty {
  border: 1px dashed rgba(255, 255, 255, .10);
  border-radius: 8px;
  background: rgba(255, 255, 255, .015);
}

/* ── 窗口下拉 ── */
.tb-menu-wrap { position: relative; display: inline-block; }
.tb-menu {
  position: absolute; z-index: 60; top: 28px; left: 0;
  min-width: 150px; padding: 4px;
  background: #171b23;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 8px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, .5);
}
.tb-menu[hidden] { display: none !important; }
.tb-menu-item {
  display: block; width: 100%;
  padding: 7px 10px;
  border: 0; border-radius: 6px;
  background: transparent; color: #dfe5ee;
  font-size: 12.5px; text-align: left; cursor: pointer;
}
.tb-menu-item:hover { background: rgba(79, 142, 247, .22); }
.tb-brand { font-size: 12px; opacity: .5; margin-right: 10px; letter-spacing: .12em; }

/* ── 提示条 ── */
.wt-toast {
  position: fixed; right: 18px; bottom: 42px; z-index: 900;
  padding: 9px 14px;
  background: #1d2430;
  border: 1px solid rgba(79, 142, 247, .45);
  border-radius: 8px;
  color: #dfe5ee; font-size: 12.5px;
  opacity: 0; transform: translateY(8px);
  transition: opacity .18s, transform .18s;
  pointer-events: none;
}
.wt-toast.on { opacity: 1; transform: translateY(0); }

/* ── 电脑监控 ── */
.mon { padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.mon-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) 150px; align-items: center; gap: 10px; }
.mon-label { font-size: 12px; opacity: .65; }
.mon-bar { position: relative; height: 10px; border-radius: 6px; background: rgba(255, 255, 255, .08); overflow: hidden; }
.mon-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; border-radius: 6px; background: #4f8ef7; transition: width .35s ease; }
.mon-bar i[data-level="warm"] { background: #e8b93c; }
.mon-bar i[data-level="hot"] { background: #f43146; }
.mon-val { font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; opacity: .85; }
.mon-sub { font-size: 11.5px; opacity: .45; }

/* ── 预览器 ── */
.pv { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.pv-bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid rgba(255, 255, 255, .07); }
.pv-btn { height: 22px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .14); background: transparent; color: inherit; font-size: 12px; cursor: pointer; }
.pv-btn:hover { background: rgba(79, 142, 247, .22); }
.pv-path { font-size: 11.5px; opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-view { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 8px; overflow: auto; }
.pv-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pv-video { max-width: 100%; max-height: 100%; }
.pv-text { width: 100%; height: 100%; margin: 0; padding: 10px; overflow: auto; font: 12px/1.6 Consolas, monospace; white-space: pre-wrap; word-break: break-word; opacity: .9; }
`
  fs.writeFileSync(P + 'renderer/styles.css', C, 'utf8')
  log('styles.css 已更新')
} else log('styles.css 已含网格样式，跳过')

/* ---------------- 6. dev.json ---------------- */
const old = JSON.parse(fs.readFileSync(P + 'scenarios/dev.json', 'utf8'))
const scen = {
  id: 'dev',
  name: '开发',
  resetOnStart: true,
  grid: { cols: 12, rows: 10, gap: 6 },
  engine: {
    cmd: 'dsh',
    args: ['web', '--no-open', '--port', '0'],
    home: 'C:\\Users\\aa\\.dsh',
    cwd: 'D:\\deepseek\\电脑',
    timeoutMs: 60000,
  },
  vscode: old.vscode,
  notes: { root: 'E:/Obsidian/note' },
  windows: [
    { type: 'monitor', title: '电脑监控' },
    { type: 'preview', title: '文件预览器' },
    { type: 'file', title: '文件浏览器' },
    { type: 'note', title: '笔记' },
    { type: 'web', title: 'DSH' },
    { type: 'vscode', title: 'VSCode' },
  ],
  panels: [
    { id: 'monitor', type: 'monitor', title: '电脑监控' },
    { id: 'preview', type: 'preview', title: '文件预览器' },
    { id: 'files', type: 'file', title: '文件浏览器', root: 'roots' },
    { id: 'dsh', type: 'web', title: 'DSH', embed: 'engine' },
    { id: 'editor', type: 'vscode', title: 'VSCode', fallbackUrl: 'http://127.0.0.1:9123' },
    { id: 'notes', type: 'note', title: '笔记', root: 'E:/Obsidian/note' },
  ],
  layout: {
    mode: 'grid',
    cells: [
      ['monitor', 'preview', 'files'],
      ['', 'dsh', 'dsh'],
    ],
  },
  launchers: old.launchers,
  taskbar: old.taskbar,
}
fs.writeFileSync(P + 'scenarios/dev.json', JSON.stringify(scen, null, 2), 'utf8')
log('dev.json 已重写')
log('done')
