'use strict'
/**
 * 渲染层壳：读场景 json → 建分栏工作区 → 逐面板调渲染器 → 驱动启动进度。
 *
 * 布局模型（v2）：
 *   · 默认三等分：场景里给 layout.columns，每列宽 1 份，列内面板平分高度
 *   · 列之间、列内面板之间都有可拖拽分隔条（左右 / 上下都能拉）
 *   · 拖完记住比例（localStorage），下次开还是你拉过的样子
 *   · 分隔条双击 = 该维度恢复均分
 *   · 场景没写 layout 时，按老的面板 col/row/w/h 推一个等价的分栏结构
 */

const SCENARIO_ID = 'dev'
const GAP = 6          // 工作区四周留白
const SPLITTER = 6     // 分隔条厚度
const MIN_W = 140      // 单列最小宽度
const MIN_H = 90       // 单面板最小高度
const STORE_KEY = 'workbench.layouts.v4'

const state = {
  scenario: null,
  engineUrl: '',
  vscode: null,
  panels: {},
  model: null,   // [{ ratio, ids: [{ id, ratio }] }]
  ratios: null,  // { cols: number[], rows: number[][] }
  cols: [],
}

function $(id) { return document.getElementById(id) }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function byScope(root, sel) { return Array.from(root.querySelectorAll(sel)) }

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveStore(v) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)) } catch {}
}

function onBoot(s) {
  const pct = typeof s.pct === 'number' ? s.pct : 0
  $('bootfill').style.width = pct + '%'
  $('boottext').textContent = s.text || ''
  $('bootdetail').textContent = s.detail || ''
}

// ───────────────────────────── 布局模型 ─────────────────────────────

/** 场景 → 分栏模型：列（宽度比例）+ 列内面板（高度比例） */
function layoutModel(sc) {
  const byId = new Map((sc.panels || []).map((p) => [p.id, p]))

  if (sc.layout && Array.isArray(sc.layout.columns) && sc.layout.columns.length) {
    return sc.layout.columns.map((c) => ({
      ratio: Number(c.width) || 1,
      ids: (c.panels || []).filter((id) => byId.has(id)).map((id) => ({
        id,
        ratio: Number(byId.get(id).height) || 1,
      })),
    }))
  }

  // 兜底：按 col 起点分列，列宽取该列每格宽度，行高取 h
  const cols = new Map()
  for (const p of sc.panels || []) {
    const key = p.col || 0
    if (!cols.has(key)) cols.set(key, { ratio: 0, ids: [] })
    const c = cols.get(key)
    c.ratio = Math.max(c.ratio, p.w || 1)
    c.ids.push({ id: p.id, ratio: p.h || 1 })
  }
  return [...cols.keys()].sort((a, b) => a - b).map((k) => cols.get(k))
}

function makePanel(p) {
  const box = document.createElement('div')
  box.className = 'panel'
  box.dataset.panelId = p.id

  const head = document.createElement('div')
  head.className = 'panel-head'
  const dot = document.createElement('i')
  dot.className = 'dot'
  const title = document.createElement('span')
  title.className = 'title'
  title.textContent = p.title || p.id
  const actions = document.createElement('div')
  actions.className = 'actions'
  head.appendChild(dot)
  head.appendChild(title)
  head.appendChild(actions)

  const body = document.createElement('div')
  body.className = 'panel-body'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'panel-x'
  closeBtn.textContent = '×'
  closeBtn.title = '关闭这个窗口'
  closeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); closePanel(p.id) })
  actions.appendChild(closeBtn)
  head.addEventListener('pointerdown', (ev) => beginPanelDrag(ev, p.id))

  box.appendChild(head)
  box.appendChild(body)

  state.panels[p.id] = { box, body, head, dot, actions, panel: { ...p, scenarioId: SCENARIO_ID } }
  return box
}

// ───────────────────────────── 尺寸计算 ─────────────────────────────

/** 把比例换算成像素写到 DOM；ratio 是唯一真值，resize 时按比例重算 */
// 补两次布局：首帧 clientHeight 可能为 0
function applySizesSoon() {
  requestAnimationFrame(() => { applySizes(); setTimeout(() => applySizes(), 80) })
}

function applySizes() {
  if (state.gridMode) return
  const ws = $('grid')
  if (!ws || !state.model || !state.cols.length) return
  const W = ws.clientWidth - GAP * 2
  const H = (state.cols[0] && state.cols[0].clientHeight) || (ws.clientHeight - GAP * 2)
  if (W <= 0 || H <= 0) return

  const n = state.cols.length
  const availW = Math.max(1, W - SPLITTER * (n - 1))
  const cols = normalize(state.ratios.cols, n)
  state.cols.forEach((col, i) => {
    col.style.flex = `0 0 ${Math.max(MIN_W, Math.round(availW * cols[i]))}px`
  })

  state.model.forEach((c, ci) => {
    const panelEls = byScope(state.cols[ci], ':scope > .panel')
    if (!panelEls.length) return
    const m = panelEls.length
    const availH = Math.max(1, H - SPLITTER * (m - 1))
    const rows = normalize(state.ratios.rows[ci], m)
    panelEls.forEach((el, ri) => {
      el.style.flex = `0 0 ${Math.max(MIN_H, Math.round(availH * rows[ri]))}px`
    })
  })
}

function normalize(arr, len) {
  const a = Array.from({ length: len }, (_, i) => Math.max(0.02, Number(arr && arr[i]) || (1 / len)))
  const sum = a.reduce((x, y) => x + y, 0)
  return a.map((v) => v / sum)
}

/** 把当前 DOM 的 px 反算成比例存起来 */
function captureRatios() {
  const ws = $('grid')
  const W = ws.clientWidth - GAP * 2
  const H = (state.cols[0] && state.cols[0].clientHeight) || (ws.clientHeight - GAP * 2)
  const n = state.cols.length
  const availW = Math.max(1, W - SPLITTER * (n - 1))
  state.ratios.cols = state.cols.map((c) => c.getBoundingClientRect().width / availW)
  state.ratios.rows = state.cols.map((col) => {
    const ps = byScope(col, ':scope > .panel')
    const m = ps.length
    const availH = Math.max(1, H - SPLITTER * (m - 1))
    return ps.map((p) => p.getBoundingClientRect().height / availH)
  })
}

function persist() {
  if (!state.layoutTouched) return
  const store = loadStore()
  store[SCENARIO_ID] = { cols: state.ratios.cols, rows: state.ratios.rows }
  saveStore(store)
}

// ───────────────────────────── 分隔条拖拽 ─────────────────────────────

function bindSplitter(el, dir, idx, ci) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    try { el.setPointerCapture(e.pointerId) } catch {}
    el.classList.add('dragging')

    const startX = e.clientX
    const startY = e.clientY
    const pair = () => {
      if (dir === 'v') {
        return [state.cols[idx], state.cols[idx + 1]]
      }
      const ps = byScope(state.cols[ci], ':scope > .panel')
      return [ps[idx], ps[idx + 1]]
    }
    const [a0, b0] = pair()
    if (!a0 || !b0) return
    const min = dir === 'v' ? MIN_W : MIN_H
    const startA = (dir === 'v' ? a0.getBoundingClientRect().width : a0.getBoundingClientRect().height)
    const total = startA + (dir === 'v' ? b0.getBoundingClientRect().width : b0.getBoundingClientRect().height)

    const move = (ev) => {
      const d = dir === 'v' ? ev.clientX - startX : ev.clientY - startY
      const a = clamp(startA + d, min, total - min)
      const [ea, eb] = pair()
      const pa = Math.round(a)
      const pb = Math.round(total - a)
      if (dir === 'v') {
        ea.style.flex = `0 0 ${pa}px`
        eb.style.flex = `0 0 ${pb}px`
      } else {
        ea.style.flex = `0 0 ${pa}px`
        eb.style.flex = `0 0 ${pb}px`
      }
    }
    const up = () => {
      el.classList.remove('dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      captureRatios()
      persist()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })

  // 双击：这一维恢复均分
  el.addEventListener('dblclick', () => {
    if (dir === 'v') {
      const n = state.cols.length
      state.ratios.cols = new Array(n).fill(1 / n)
    } else {
      const ps = byScope(state.cols[ci], ':scope > .panel')
      state.ratios.rows[ci] = new Array(ps.length).fill(1 / (ps.length || 1))
    }
    applySizesSoon()
    persist()
  })
}

// ───────────────────────────── 建工作区 ─────────────────────────────

function restoreExtras() {
  const list = extrasList()
  if (!list.length) return
  const done = new Set((state.scenario.panels || []).map((p) => p.id))
  for (const it of list) {
    if (!it || done.has(it.id)) continue
    addPanelByType(it.type, it.id)
  }
}

function buildWorkspace(sc) {
  const ws = $('grid')
  ws.className = 'workspace'
  ws.innerHTML = ''
  ws.hidden = false

  const model = layoutModel(sc)
  state.model = model

  const saved = loadStore()[SCENARIO_ID]
  const sameCols = saved && Array.isArray(saved.cols) && saved.cols.length === model.length
  state.ratios = {
    cols: sameCols ? saved.cols.slice() : model.map((c) => c.ratio),
    rows: model.map((c, i) => {
      const s = sameCols && Array.isArray(saved.rows && saved.rows[i]) ? saved.rows[i] : null
      return s && s.length === c.ids.length ? s.slice() : c.ids.map((x) => x.ratio)
    }),
  }

  state.cols = []
  model.forEach((c, ci) => {
    if (ci > 0) {
      const sv = document.createElement('div')
      sv.className = 'splitter splitter-v'
      sv.dataset.split = 'v' + (ci - 1)
      sv.title = '拖动调整左右宽度 · 双击均分'
      bindSplitter(sv, 'v', ci - 1, ci)
      ws.appendChild(sv)
    }
    const col = document.createElement('div')
    col.className = 'col'
    col.dataset.col = String(ci)
    state.cols.push(col)

    c.ids.forEach((entry, ri) => {
      if (ri > 0) {
        const sh = document.createElement('div')
        sh.className = 'splitter splitter-h'
        sh.dataset.split = 'h' + ci + '-' + (ri - 1)
        sh.title = '拖动调整上下高度 · 双击均分'
        bindSplitter(sh, 'h', ri - 1, ci)
        col.appendChild(sh)
      }
      const p = (sc.panels || []).find((x) => x.id === entry.id)
      if (p) col.appendChild(makePanel(p))
    })
    ws.appendChild(col)
  })

  // 场景里写了但 layout 没引用的面板，兜底塞进最后一列，别让它们凭空消失
  const used = new Set(model.flatMap((c) => c.ids.map((x) => x.id)))
  const orphans = (sc.panels || []).filter((p) => !used.has(p.id))
  if (orphans.length && state.cols.length) {
    const last = state.cols[state.cols.length - 1]
    for (const p of orphans) last.appendChild(makePanel(p))
    state.ratios.rows[state.ratios.rows.length - 1] = new Array(orphans.length + 1).fill(1)
  }

  applySizesSoon()
  window.addEventListener('resize', () => applySizes())
  restoreExtras()
  if (typeof applySavedSpec === 'function') applySavedSpec()
  if (typeof buildWindowBar === 'function') buildWindowBar(sc)
}


// ───────────────────────────── 任务栏：把本地 exe 停靠进面板 ─────────────────────────────

const dockState = { key: null, label: '', panelId: 'editor', timer: 0 }

function currentRect() {
  const rec = state.panels[dockState.panelId]
  if (!rec) return null
  const b = rec.body.getBoundingClientRect()
  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
}

function syncDock() {
  if (!dockState.key) return
  const rect = currentRect()
  if (!rect || rect.w < 40 || rect.h < 40) return
  clearTimeout(dockState.timer)
  dockState.timer = setTimeout(() => { window.app.moveDock(dockState.key, rect) }, 140)
}

function renderDockChip() {
  const right = $('tb-right')
  if (!right) return
  right.innerHTML = ''
  byScope(document, '.tb-btn').forEach((b) => b.classList.toggle('on', b.dataset.key === dockState.key))
  if (!dockState.key) return
  const chip = document.createElement('span')
  chip.className = 'tb-chip'
  chip.appendChild(document.createTextNode('面板内：' + dockState.label))
  const x = document.createElement('button')
  x.className = 'tb-x'
  x.textContent = '×'
  x.title = '结束接管，把窗口放回桌面'
  x.addEventListener('click', () => undockApp())
  chip.appendChild(x)
  right.appendChild(chip)
}

function showTakeover(label, note) {
  const rec = state.panels[dockState.panelId]
  if (!rec) return
  for (const ch of Array.from(rec.body.children)) {
    if (ch.classList && ch.classList.contains('takeover')) continue
    ch.dataset.tkHidden = '1'
    ch.style.display = 'none'
  }
  const ttl = rec.head && rec.head.querySelector('.title')
  if (ttl) {
    if (!ttl.dataset.orig) ttl.dataset.orig = ttl.textContent
    ttl.textContent = label
  }
  if (rec.head) rec.head.classList.add('taken')
  let ov = rec.body.querySelector('.takeover')
  if (!ov) {
    rec.body.classList.add('has-takeover')
    ov = document.createElement('div')
    ov.className = 'takeover'
    rec.body.appendChild(ov)
  }
  ov.innerHTML = ''
  const t = document.createElement('div')
  t.className = 'tk-title'
  t.textContent = label
  ov.appendChild(t)
  if (note) {
    const d = document.createElement('div')
    d.className = 'tk-desc'
    d.textContent = note
    ov.appendChild(d)
  }
  if (dockState.key) {
    const b = document.createElement('button')
    b.className = 'tk-btn'
    b.textContent = '结束接管，回到 VSCode'
    b.addEventListener('click', () => undockApp())
    ov.appendChild(b)
  }
}

function hideTakeover() {
  const rec = state.panels[dockState.panelId]
  if (!rec) return
  for (const ch of Array.from(rec.body.children)) {
    if (ch.dataset && ch.dataset.tkHidden) { ch.style.display = ''; delete ch.dataset.tkHidden }
  }
  const ttl2 = rec.head && rec.head.querySelector('.title')
  if (ttl2 && ttl2.dataset.orig) { ttl2.textContent = ttl2.dataset.orig; delete ttl2.dataset.orig }
  if (rec.head) rec.head.classList.remove('taken')
  rec.body.classList.remove('has-takeover')
  const ov = rec.body.querySelector('.takeover')
  if (ov) ov.remove()
  const view = rec.body.querySelector('webview')
  if (view) view.style.display = ''
}

async function undockApp() {
  const key = dockState.key
  dockState.key = null
  hideTakeover()
  renderDockChip()
  if (key) { try { await window.app.undock(key) } catch (e) {} }
  syncDock()
}

async function toggleDock(item) {
  // 已回退：不再把外部程序塞进面板，只当作启动器
  window.app.launch(item.key, SCENARIO_ID)
}

function buildTaskbar(sc) {
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

// ───────────────────────────── 第二行任务栏：可添加的窗口 ─────────────────────────────

let extraSeq = 0

function persistExtras(list) {
  const store = loadStore()
  const rec = store[SCENARIO_ID] || {}
  rec.extras = list
  store[SCENARIO_ID] = rec
  saveStore(store)
}

function extrasList() {
  const store = loadStore()
  const rec = store[SCENARIO_ID] || {}
  return Array.isArray(rec.extras) ? rec.extras : []
}

/** 在布局右侧新增一列，放一个新面板 */
function addPanelByType(type, forcedId) {
  const id = forcedId || (type + '-' + Date.now().toString(36) + (++extraSeq))
  const p = {
    id,
    title: type === 'note' ? '笔记' : type === 'file' ? '文件' : type,
    type,
    root: type === 'note' ? ((state.scenario.notes || {}).root || 'E:/Obsidian') : 'roots',
  }
  if (!state.scenario.panels) state.scenario.panels = []
  state.scenario.panels.push(p)

  const ws = $('grid')
  const ci = state.cols.length
  const sv = document.createElement('div')
  sv.className = 'splitter splitter-v'
  sv.dataset.split = 'v' + (ci - 1)
  sv.title = '拖动调整左右宽度 · 双击均分'
  bindSplitter(sv, 'v', ci - 1, ci)
  ws.appendChild(sv)

  const col = document.createElement('div')
  col.className = 'col'
  col.dataset.col = String(ci)
  col.appendChild(makePanel(p))
  ws.appendChild(col)

  state.cols.push(col)
  state.model.push({ ratio: 1, ids: [{ id, ratio: 1 }] })
  state.ratios.cols.push(1)
  state.ratios.rows.push([1])
  applySizesSoon()

  if (!forcedId) {
    const list = extrasList()
    list.push({ id, type })
    persistExtras(list)
  }
  return id
}

function buildSecondBar(sc) {
  if (typeof buildWindowBar === 'function') buildWindowBar(sc)
}

function renderPanel(id) {
  const rec = state.panels[id]
  if (!rec) return
  const api = {
    engineUrl: () => state.engineUrl,
    vscodeStatus: () => state.vscode,
    launchers: () => state.scenario.launchers || [],
    setDot: (kind) => { rec.dot.className = 'dot' + (kind ? ' ' + kind : '') },
    fsList: (dir) => window.app.fsList(dir),
    fsRead: (p) => window.app.fsRead(p),
    fsRoots: () => window.app.fsRoots(),
    openPath: (p) => window.app.openPath(p),
    noteSave: (p, text) => window.app.noteSave(p, text),
    pickFile: () => window.app.pickFile(),
    preview: (p) => window.app.preview(p),
    sysStats: () => window.app.sysStats(),
    notesRoot: () => ((state.scenario && state.scenario.notes) || {}).root || '',
    reload: null,
  }
  const fn = window.RENDERERS[rec.panel.type]
  if (!fn) {
    rec.body.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'empty'
    d.textContent = '未知面板类型：' + rec.panel.type
    rec.body.appendChild(d)
    api.setDot('err')
    return
  }
  try {
    fn(rec.body, rec.panel, api)
  } catch (err) {
    rec.body.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'empty'
    d.textContent = '渲染失败：' + (err && err.message)
    rec.body.appendChild(d)
    api.setDot('err')
    console.error(err)
  }
}

function renderStatus() {
  const bar = $('status')
  bar.innerHTML = ''
  let host = ''
  try { host = new URL(state.engineUrl).host } catch {}
  bar.textContent = [
    'DSH 引擎：' + (state.engineUrl ? host : '未就绪'),
    'VSCode：' + (state.vscode ? state.vscode.status : '未知'),
    '面板：' + Object.keys(state.panels).length,
    '布局：拖分隔条可调 / 双击均分',
  ].join('   ·   ')
  bar.hidden = false
}

async function main() {
  window.app.onBoot(onBoot)
  window.app.onReflow(() => syncDock())
  window.__wtDock = (key) => { const it = (state.taskbar || []).find((x) => x.key === key); if (!it) return 'no-item'; toggleDock(it); return 'ok' }
  window.__wtState = () => ({ key: dockState.key, label: dockState.label, chip: (document.querySelector('.tb-chip') || {}).innerText || '', panelId: dockState.panelId, buttons: document.querySelectorAll('.tb-btn').length, items: (state.taskbar || []).map((x) => x.key) })

  window.addEventListener('wt:preview', (ev) => {
    const p = (ev.detail && ev.detail.path) || ''
    if (!p) return
    const hasPv = Object.keys(state.panels).some((id) => state.panels[id].panel.type === 'preview')
    if (!hasPv) addWindow('preview')
    const go = () => { if (window.__wtPreview) window.__wtPreview(p); else setTimeout(go, 120) }
    setTimeout(go, hasPv ? 0 : 420)
  })

  const sc = await window.app.scenario(SCENARIO_ID)
  state.scenario = sc
  if (sc && sc.resetOnStart) {
    try {
      localStorage.removeItem(STORE_KEY)
      localStorage.removeItem(UI_KEY)
      localStorage.removeItem('workbench.layouts.v3')
    } catch (err) {}
  }
  buildTaskbar(sc)
  buildSecondBar(sc)
  if ((sc.layout || {}).mode === 'grid') {
    buildGridWorkspace(sc)
    restoreUi()
  }
  else buildWorkspace(sc)

  // 先渲染不依赖启动结果的面板，让界面尽快有内容
  Object.keys(state.panels).forEach((id) => {
    const t = state.panels[id].panel.type
    if (t !== 'web' && t !== 'vscode') renderPanel(id)
  })

  // 启动遮罩立刻撤掉：外壳先露出来，引擎 / VSCode 在后台慢慢起
  $('boot').hidden = true
  renderStatus()

  const res = await window.app.start(SCENARIO_ID, engineOverrides())
  state.engineUrl = res.url || ''
  state.vscode = res.vscode || null

  // 引擎相关的面板延后渲染
  Object.keys(state.panels).forEach((id) => {
    const t = state.panels[id].panel.type
    if (t === 'web' || t === 'vscode') renderPanel(id)
  })
  renderStatus()
}

main().catch((err) => {
  onBoot({ pct: 100, text: '启动失败', detail: String(err && err.message || err) })
  console.error(err)
})

// ══════════ 窗口管理：删除 / 拖拽重排 / 任务栏列表 ══════════

function gridCols() {
  const ws = $('grid')
  return ws ? [...ws.children].filter((el) => el.classList && el.classList.contains('col')) : []
}

function panelEl(id) {
  return document.querySelector('.panel[data-panel-id="' + id + '"]')
}

function pxOf(el) {
  const v = parseFloat((el.style.flex || '').split(' ')[2])
  return isFinite(v) && v > 0 ? v : 1
}

function syncStateFromDom() {
  state.cols = gridCols()
  state.model = state.cols.map((col) => ({
    ratio: 1,
    ids: [...col.querySelectorAll(':scope > .panel')].map((p) => ({ id: p.dataset.panelId, ratio: 1 })),
  }))
  state.ratios = {
    cols: state.cols.map((c) => pxOf(c)),
    rows: state.cols.map((col) => [...col.querySelectorAll(':scope > .panel')].map((p) => pxOf(p))),
  }
}

// 重建分隔条（列间竖条 + 列内横条），并同步 state
function ensureStructure() {
  const ws = $('grid')
  if (!ws) return
  gridCols().forEach((col) => {
    if (!col.querySelector(':scope > .panel')) col.remove()
  })
  ;[...ws.querySelectorAll(':scope > .splitter')].forEach((el) => el.remove())
  const cols = gridCols()
  cols.forEach((col, ci) => {
    const ps = [...col.querySelectorAll(':scope > .panel')]
    ps.forEach((p, ri) => {
      if (ri > 0) {
        const sh = document.createElement('div')
        sh.className = 'splitter splitter-h'
        bindSplitter(sh, 'h', ri - 1, ci)
        col.insertBefore(sh, p)
      }
    })
    if (ci > 0) {
      const sv = document.createElement('div')
      sv.className = 'splitter splitter-v'
      bindSplitter(sv, 'v', ci - 1, ci)
      ws.insertBefore(sv, col)
    }
  })
  syncStateFromDom()
}

function persistSpec() {
  try {
    const store = loadStore()
    const rec = store[SCENARIO_ID] || {}
    rec.spec = gridCols().map((col) => ({
      w: pxOf(col),
      ids: [...col.querySelectorAll(':scope > .panel')].map((p) => p.dataset.panelId),
    }))
    rec.touched = true
    store[SCENARIO_ID] = rec
    saveStore(store)
  } catch (err) {}
}

function layoutChanged() {
  if (state.gridMode) {
    buildWindowBar(state.scenario)
    return
  }
  ensureStructure()
  applySizesSoon()
  persistSpec()
  buildWindowBar(state.scenario)
}

function closePanel(id) {
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
}

function gridApplyMove(id, targetId, side) {
  // 网格模式：把 id 对应的面板移到 targetId 旁边（左/右/上/下），改变 cells 后按需扩列
  const cells = gridCells()
  const rows = Math.max(1, cells.length)
  const cols = Math.max(1, ...cells.map((r) => r.length))
  cells.forEach((r) => { while (r.length < cols) r.push('') })
  let tr = -1, tc = -1
  for (let ri = 0; ri < rows; ri += 1) {
    const c = cells[ri].indexOf(targetId)
    if (c >= 0) { tr = ri; tc = c; break }
  }
  if (tr < 0) return
  // 先清掉 id 占的所有格子
  cells.forEach((r) => { r.forEach((v, i) => { if (v === id) r[i] = '' }) })
  // 目标位置
  if (side === 'left' || side === 'right') {
    const ci = side === 'left' ? tc : tc + 1
    cells.forEach((r) => { while (r.length <= ci) r.push('') })
    for (let ri = 0; ri < cells.length; ri += 1) if (cells[ri][ci] === '') { cells[ri][ci] = id }
  } else {
    const ri2 = side === 'top' ? tr : tr + 1
    while (cells.length <= ri2) cells.push(new Array(Math.max(1, ...cells.map((r) => r.length))).fill(''))
    const wid = Math.max(1, ...cells.map((r) => r.length))
    cells.forEach((r) => { while (r.length < wid) r.push('') })
    for (let ci = 0; ci < wid; ci += 1) if (cells[ri2] && cells[ri2][ci] === '') { cells[ri2][ci] = id }
  }
  // 清理尾部空列 / 空行（保留至少一行一列占位）
  const prune = () => {
    let removed
    do {
      removed = false
      const wid = Math.max(1, ...cells.map((r) => r.length))
      for (let c = wid - 1; c >= 0; c -= 1) {
        if (cells.length > 1 && cells.every((r) => !r[c])) { cells.forEach((r) => r.splice(c, 1)); removed = true }
      }
      if (cells.length > 1 && cells[cells.length - 1].every((v) => !v)) { cells.pop(); removed = true }
    } while (removed)
  }
  prune()
  if (!cells.length) cells.push(['', '', ''])
  state.grid.cells = cells
  panelDefFor(id)
  gridRender()
  rerenderPanels()
  buildWindowBar(state.scenario)
  saveUi()
}

function applyMove(id, targetId, side) {
  if (state.gridMode) { gridApplyMove(id, targetId, side); return }
  const el = panelEl(id)
  const tEl = panelEl(targetId)
  if (!el || !tEl || el === tEl) return
  const ws = $('grid')
  const tCol = tEl.parentElement
  const w = el.parentElement ? pxOf(el.parentElement) : 300
  el.remove()
  if (side === 'left' || side === 'right') {
    const col = document.createElement('div')
    col.className = 'col'
    col.style.flex = '0 0 ' + Math.round(w || 320) + 'px'
    col.appendChild(el)
    if (side === 'left') ws.insertBefore(col, tCol)
    else ws.insertBefore(col, tCol.nextSibling)
  } else {
    const ref = side === 'top' ? tEl : tEl.nextSibling
    tCol.insertBefore(el, ref)
  }
  if (!tCol.querySelector(':scope > .panel')) tCol.remove()
  layoutChanged()
}

// ── 拖拽：按住面板标题拖动，落在别的窗口上按方向切成列或行 ──
let dragState = null
let hintEl = null

function dropHint(rect, side) {
  if (!hintEl) {
    hintEl = document.createElement('div')
    hintEl.className = 'drag-hint'
    document.body.appendChild(hintEl)
  }
  const half = side === 'left' || side === 'right'
  hintEl.style.left = (side === 'right' ? rect.left + rect.width / 2 : rect.left) + 'px'
  hintEl.style.top = (side === 'bottom' ? rect.top + rect.height / 2 : rect.top) + 'px'
  hintEl.style.width = (half ? rect.width / 2 : rect.width) + 'px'
  hintEl.style.height = (half ? rect.height : rect.height / 2) + 'px'
  hintEl.hidden = false
}

function clearHint() {
  if (hintEl) hintEl.hidden = true
}

function beginPanelDrag(ev, id) {
  if (ev.button !== 0) return
  if (ev.target.closest('button')) return
  if (ev.target.closest('.panel-body')) return
  const el = panelEl(id)
  if (!el) return
  dragState = { id, el, x0: ev.clientX, y0: ev.clientY, active: false, target: null, side: null }
  window.addEventListener('pointermove', onPanelDragMove)
  window.addEventListener('pointerup', onPanelDragUp, { once: true })
}

function onPanelDragMove(ev) {
  if (!dragState) return
  if (!dragState.active) {
    if (Math.abs(ev.clientX - dragState.x0) < 6 && Math.abs(ev.clientY - dragState.y0) < 6) return
    dragState.active = true
    dragState.el.classList.add('dragging')
  }
  const under = document.elementFromPoint(ev.clientX, ev.clientY)
  const target = under && under.closest ? under.closest('.panel') : null
  if (!target || target === dragState.el) {
    dragState.target = null
    dragState.side = null
    clearHint()
    return
  }
  const r = target.getBoundingClientRect()
  const dx = (ev.clientX - r.left) / r.width
  const dy = (ev.clientY - r.top) / r.height
  let side
  if (dx < 0.25) side = 'left'
  else if (dx > 0.75) side = 'right'
  else side = dy < 0.5 ? 'top' : 'bottom'
  dragState.target = target.dataset.panelId
  dragState.side = side
  dropHint(r, side)
}

window.__wtDebug = {
  drag: () => dragState,
  move: (a, b, c) => applyMove(a, b, c),
  handlers: () => ({ panel: typeof beginPanelDrag }),
}

function onPanelDragUp() {
  window.removeEventListener('pointermove', onPanelDragMove)
  if (!dragState) return
  const d = dragState
  dragState = null
  clearHint()
  d.el.classList.remove('dragging')
  if (d.active && d.target && d.side) applyMove(d.id, d.target, d.side)
}

// ── 启动时按记住的结构还原 ──
function applySavedSpec() {
  let spec = null
  try {
    const rec = loadStore()[SCENARIO_ID] || {}
    if (!rec.touched) return
    spec = rec.spec
  } catch (err) {}
  if (!Array.isArray(spec) || !spec.length) return
  const have = new Map([...document.querySelectorAll('.panel')].map((p) => [p.dataset.panelId, p]))
  const ws = $('grid')
  const cols = []
  for (const c of spec) {
    const col = document.createElement('div')
    col.className = 'col'
    for (const id of c.ids || []) {
      const p = have.get(id)
      if (!p) continue
      have.delete(id)
      col.appendChild(p)
    }
    if (col.querySelector(':scope > .panel')) cols.push({ col, w: Number(c.w) || 1 })
  }
  if (have.size) {
    const col = document.createElement('div')
    col.className = 'col'
    for (const [, p] of have) col.appendChild(p)
    cols.push({ col, w: 1 })
  }
  if (!cols.length) return
  ws.innerHTML = ''
  cols.forEach(({ col, w }, i) => {
    if (i > 0) {
      const sv = document.createElement('div')
      sv.className = 'splitter splitter-v'
      bindSplitter(sv, 'v', i - 1, i)
      ws.appendChild(sv)
    }
    col.style.flex = '0 0 ' + Math.round(w * 100) + 'px'
    ws.appendChild(col)
  })
  ensureStructure()
  state.ratios.cols = cols.map((c) => c.w)
  state.ratios.rows = state.cols.map((col) => [...col.querySelectorAll(':scope > .panel')].map(() => 1))
  applySizesSoon()
  persistSpec()
  // 重新挂载后 webview 可能白屏，重载一次
  setTimeout(() => {
    document.querySelectorAll('webview').forEach((w) => {
      try { w.reload() } catch (err) {}
    })
  }, 400)
}

// ── 第二行任务栏：列出所有窗口，可关闭 ──
function presetStore() {
  try {
    const raw = localStorage.getItem('workbench.presets.v1')
    return raw ? JSON.parse(raw) : []
  } catch (err) { return [] }
}

function presetSave(list) {
  try { localStorage.setItem('workbench.presets.v1', JSON.stringify(list)) } catch (err) {}
}

function builtinPresets() {
  const base = (state.scenario && state.scenario.layout && state.scenario.layout.cells) || [['', '', ''], ['', '', '']]
  return [
    { name: '基础', builtin: true, cells: base.map((x) => x.slice()) },
    { name: '开发', builtin: true, cells: [['notes', 'editor', 'files'], ['monitor', 'dsh', 'dsh']] },
  ]
}

function allPresets() {
  return builtinPresets().concat(presetStore())
}

function panelDefFor(id) {
  const sc = state.scenario || {}
  const found = (sc.panels || []).find((x) => x.id === id)
  if (found) return found
  const map = {
    monitor: { id: id, type: 'monitor', title: '电脑监控' },
    preview: { id: id, type: 'preview', title: '文件预览器' },
    files: { id: id, type: 'file', title: '文件浏览器', root: 'roots' },
    dsh: { id: id, type: 'web', title: 'DSH', embed: 'engine' },
    editor: { id: id, type: 'vscode', title: 'VSCode', fallbackUrl: 'http://127.0.0.1:' + ((sc.vscode && sc.vscode.port) || 9123) },
    notes: { id: id, type: 'note', title: '笔记', root: (sc.notes || {}).root || 'E:/Obsidian/note' },
  }
  const def = map[id] || { id: id, type: id.replace(/-.*$/, ''), title: id }
  sc.panels = sc.panels || []
  sc.panels.push(def)
  return def
}

function applyPreset(p) {
  if (!p || !p.cells) return
  const cells = p.cells.map((x) => x.slice())
  cells.forEach((row) => row.forEach((id) => { if (id) panelDefFor(id) }))
  state.grid.cells = cells
  state.grid.colFr = null
  state.grid.rowFr = null
  state.currentPreset = p.name
  gridRender()
  rerenderPanels()
  buildWindowBar(state.scenario)
  saveUi()
}

const UI_KEY = 'workbench.ui.v2'

function saveUi() {
  try {
    const g = state.grid || {}
    localStorage.setItem(UI_KEY, JSON.stringify({
      preset: state.currentPreset || '基础',
      cells: (g.cells || []).map((row) => row.slice()),
      colFr: g.colFr || null,
      rowFr: g.rowFr || null,
    }))
  } catch (err) {}
}

function loadUi() {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || !Array.isArray(v.cells) || !v.cells.length) return null
    return v
  } catch (err) {
    return null
  }
}

function restoreUi() {
  const v = loadUi()
  if (!v) return
  const cells = v.cells.map((row) => row.slice())
  cells.forEach((row) => row.forEach((id) => { if (id) panelDefFor(id) }))
  state.grid.cells = cells
  state.grid.colFr = v.colFr || null
  state.grid.rowFr = v.rowFr || null
  state.currentPreset = v.preset || '基础'
  gridRender()
  rerenderPanels()
  buildWindowBar(state.scenario)
}

function resetCurrentPreset() {
  const p = allPresets().find((x) => x.name === currentPresetName()) || allPresets()[0]
  if (!p) return
  applyPreset(p)
  saveUi()
  toast('已重置当前预设：' + p.name)
}

function resetAllUi() {
  try {
    localStorage.removeItem(UI_KEY)
    localStorage.removeItem(STORE_KEY)
  } catch (err) {}
  const base = allPresets()[0]
  if (base) applyPreset(base)
  saveUi()
  toast('已重置全部界面')
}

function currentPresetName() {
  return state.currentPreset || '基础'
}


const SETTINGS_KEY = 'workbench.settings.v1'

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return (v && typeof v === 'object') ? v : null
  } catch (err) { return null }
}

function saveSettings(o) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o || {})) } catch (err) {}
}

function engineOverrides() {
  const s2 = loadSettings() || {}
  const out = {}
  if (s2.dshCmd) out.dshCmd = s2.dshCmd
  if (s2.dshHome) out.dshHome = s2.dshHome
  return out
}

function openSettings(sc) {
  const ov = loadSettings() || {}
  const pop = document.createElement('div')
  pop.className = 'set-pop'
  const box = document.createElement('div')
  box.className = 'set-pop-box'
  const H = (t) => { const x = document.createElement('b'); x.textContent = t; box.appendChild(x) }
  const field = (label, key, ph, rows) => {
    const lab = document.createElement('label'); lab.textContent = label
    const inp = document.createElement('input')
    inp.className = 'set-inp'
    inp.value = ov[key] || ''
    inp.placeholder = ph || ''
    inp.dataset.key = key
    lab.appendChild(inp)
    box.appendChild(lab)
    return inp
  }
  H('连接 DSH（换用户/换机器时改这里）')
  const cmdInp = field('DSH 命令或可执行文件路径', 'dshCmd', '例如 dsh 或 D:\\DeepSeek\\resources\\runtime\\cli\\bin\\dsh.cmd')
  const homeInp = field('DSH_HOME 目录（会话数据所在）', 'dshHome', '例如 C:\\Users\\你\\.dsh', 2)
  const note = document.createElement('p')
  note.className = 'set-note'
  note.textContent = '路径留空则用场景默认。DSH_HOME 指到你已装的 .dsh 目录，就能看到你本来的对话。'
  box.appendChild(note)
  const btns = document.createElement('div')
  btns.className = 'set-btns'
  const ok = document.createElement('button'); ok.className = 'tb-btn'; ok.textContent = '保存并重启引擎'
  const close = document.createElement('button'); close.className = 'tb-btn'; close.textContent = '取消'
  btns.appendChild(ok); btns.appendChild(close); box.appendChild(btns)
  const rm = () => { pop.remove(); document.removeEventListener('keydown', esc) }
  const esc = (ev) => { if (ev.key === 'Escape') rm() }
  close.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); rm() })
  ok.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    const dshCmd = String(cmdInp.value || '').trim()
    const dshHome = String(homeInp.value || '').trim()
    const next = {}
    if (dshCmd) next.dshCmd = dshCmd
    if (dshHome) next.dshHome = dshHome
    saveSettings(next)
    if (window.app.setEngineOpts) window.app.setEngineOpts(next).then(() => {
      setBootOnly(null)
    })
    rm()
    toast(dshCmd ? '已保存 DSH 位置：' + dshCmd : '已清空自定义 DSH，用场景默认')
    // 保存后立刻重载，用新设置重启引擎/工作区
    setTimeout(() => window.location.reload(), 600)
  })
  pop.addEventListener('pointerdown', (ev) => { if (ev.target === pop) rm() })
  pop.appendChild(box)
  document.body.appendChild(pop)
}

function setBootOnly() {}

function buildWindowBar(sc) {
  const bar = $('taskbar2')
  if (!bar) return
  bar.hidden = false
  bar.innerHTML = ''
  const left = document.createElement('div')
  left.className = 'tb-left'

  const plain = (label, fn, title) => {
    const b = document.createElement('button')
    b.className = 'tb-btn'
    b.textContent = label
    if (title) b.title = title
    b.addEventListener('click', fn)
    left.appendChild(b)
    return b
  }
  plain('设置', () => openSettings(sc), 'DSH 位置 / 工作区等设置')
  plain('外观', () => toast('外观面板还空着，接口已留好，后面接工程。颜色字体在 renderer/theme.css'), '占位：外观')

  // 窗口下拉：往界面右侧加一个窗口
  const ww = document.createElement('div')
  ww.className = 'tb-menu-wrap'
  const wbtn = document.createElement('button')
  wbtn.className = 'tb-btn tb-menu-btn'
  wbtn.textContent = '界面 ▾'
  wbtn.title = '添加窗口 / 重置界面'
  const wmenu = document.createElement('div')
  wmenu.className = 'tb-menu'
  wmenu.hidden = true
  const pool = (sc && sc.windows && sc.windows.length) ? sc.windows : [
    { type: 'monitor', title: '电脑监控' },
    { type: 'preview', title: '文件预览器' },
    { type: 'file', title: '文件浏览器' },
    { type: 'note', title: '笔记' },
    { type: 'web', title: 'DSH' },
    { type: 'vscode', title: 'VSCode' },
  ]
  pool.forEach((w) => {
    const it = document.createElement('button')
    it.className = 'tb-menu-item'
    it.textContent = w.title || w.type
    it.addEventListener('click', (ev) => {
      ev.stopPropagation()
      wmenu.hidden = true
      addWindow(w.type)
      toast('已加到界面右侧：' + (w.title || w.type))
    })
    wmenu.appendChild(it)
  })
  const line = document.createElement('div')
  line.className = 'tb-menu-sep'
  wmenu.appendChild(line)
  const resetOne = document.createElement('button')
  resetOne.className = 'tb-menu-item'
  resetOne.textContent = '重置当前预设'
  resetOne.addEventListener('click', (ev) => {
    ev.stopPropagation()
    wmenu.hidden = true
    resetCurrentPreset()
  })
  wmenu.appendChild(resetOne)
  const resetAll = document.createElement('button')
  resetAll.className = 'tb-menu-item'
  resetAll.textContent = '重置全部'
  resetAll.addEventListener('click', (ev) => {
    ev.stopPropagation()
    wmenu.hidden = true
    resetAllUi()
  })
  wmenu.appendChild(resetAll)
  wbtn.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    ev.preventDefault()
    wmenu.hidden = !wmenu.hidden
  })
  if (!window.__wtMenuCloser) {
    window.__wtMenuCloser = true
    document.addEventListener('pointerdown', (ev) => {
      const t = ev.target
      if (t && t.closest && t.closest('.tb-menu-wrap')) return
      document.querySelectorAll('.tb-menu').forEach((m) => { m.hidden = true })
    })
  }
  ww.appendChild(wbtn)
  ww.appendChild(wmenu)
  left.appendChild(ww)

  const sep = document.createElement('span')
  sep.className = 'tb-sep'
  left.appendChild(sep)

  // 预设下拉
  const presetBox = document.createElement('div')
  presetBox.className = 'tb-presets'
  allPresets().forEach((p) => {
    const chip = document.createElement('button')
    chip.className = 'tb-btn tb-preset' + (p.name === currentPresetName() ? ' on' : '')
    chip.textContent = p.name
    chip.title = '切换到预设：' + p.name
    chip.addEventListener('click', () => {
      applyPreset(p)
      toast('已切到预设：' + p.name)
    })
    presetBox.appendChild(chip)
  })
  left.appendChild(presetBox)

  // ＋ 新建预设
  const addBtn = document.createElement('button')
  addBtn.className = 'tb-btn tb-plus'
  addBtn.textContent = '＋'
  addBtn.title = '把当前布局保存成新的预设'
  const box = document.createElement('div')
  box.className = 'tb-save'
  box.hidden = true
  const input = document.createElement('input')
  input.className = 'tb-save-input'
  input.placeholder = '预设名字，回车保存'
  const ok = document.createElement('button')
  ok.className = 'tb-btn'
  ok.textContent = '保存'
  box.appendChild(input)
  box.appendChild(ok)
  addBtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    box.hidden = !box.hidden
    if (!box.hidden) input.focus()
  })
  const save = () => {
    const name = String(input.value || '').trim()
    if (!name) { toast('先起个名字'); return }
    const list = presetStore().filter((p) => p.name !== name)
    list.push({ name: name, cells: state.grid.cells.map((x) => x.slice()) })
    presetSave(list)
    state.currentPreset = name
    input.value = ''
    box.hidden = true
    buildWindowBar(sc)
    toast('已保存预设：' + name)
  }
  ok.addEventListener('click', (ev) => { ev.stopPropagation(); save() })
  input.addEventListener('click', (ev) => ev.stopPropagation())
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') save()
    if (ev.key === 'Escape') { box.hidden = true }
  })
  left.appendChild(addBtn)
  left.appendChild(box)

  bar.appendChild(left)
}



// ══════════ 网格布局（两行三列，可向右扩展） ══════════

function gridCells() {
  if (!state.grid) state.grid = { cells: [] }
  return state.grid.cells
}

function gridAddColumn(panel, id) {
  const ws = document.getElementById('grid')
  if (!ws) return
  const cells = gridCells()
  cells.forEach((row) => row.push(id))
  const cols = Math.max(1, ...cells.map((r2) => r2.length))
  const rows = Math.max(1, cells.length)
  cells.forEach((row) => { while (row.length < cols) row.push('') })

  // 区域名：新面板统一一个新的 w 字母
  const used = new Set()
  ws.style.gridTemplateAreas.split(/[ "]+/).forEach((tk) => { if (tk && /^w|^z/.test(tk)) used.add(tk) })
  let n = 1
  while (used.has('w' + n)) n += 1
  const name = 'w' + n
  const areas = cells.map((row) => row.map((cid) => (cid === id ? name : (cid || 'z' + cells.indexOf(row) + 'x' + row.indexOf(cid)))).join(' '))
  ws.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))'
  ws.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))'
  ws.style.gridTemplateAreas = areas.map((l) => '"' + l + '"').join(' ')

  const box = makePanel({ id: id, type: panel.type, title: panel.title || panel.type,
    root: panel.root, embed: panel.embed, fallbackUrl: panel.fallbackUrl })
  box.style.gridArea = name
  ws.appendChild(box)
  gridHandles(rows, cols)
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
    ph.textContent = '空'
    ws.appendChild(ph)
  })
  gridHandles(rows, cols)
}

function gridApplyFr() {
  const ws = $('grid')
  if (!ws) return
  const c = state.grid.colFr
  const rw = state.grid.rowFr
  if (c && c.length) ws.style.gridTemplateColumns = c.map((v) => v + 'fr').join(' ')
  if (rw && rw.length) ws.style.gridTemplateRows = rw.map((v) => v + 'fr').join(' ')
}

function gridHandles(rows, cols) {
  const ws = $('grid')
  if (!ws) return
  ws.querySelectorAll('.g-handle').forEach((h) => h.remove())
  if (!state.grid.colFr || state.grid.colFr.length !== cols) state.grid.colFr = new Array(cols).fill(1)
  if (!state.grid.rowFr || state.grid.rowFr.length !== rows) state.grid.rowFr = new Array(rows).fill(1)
  gridApplyFr()

  const makeHandle = (cls, index, dir) => {
    const h = document.createElement('div')
    h.className = 'g-handle ' + cls
    h.dataset.index = String(index)
    h.addEventListener('pointerdown', (ev) => beginSplitDrag(ev, dir, index))
    h.addEventListener('dblclick', () => {
      if (dir === 'col') state.grid.colFr = new Array(cols).fill(1)
      else state.grid.rowFr = new Array(rows).fill(1)
      gridApplyFr()
    })
    ws.appendChild(h)
    return h
  }
  const vh = []
  const hh = []
  for (let i = 1; i < cols; i += 1) vh.push(makeHandle('g-v', i, 'col'))
  for (let i = 1; i < rows; i += 1) hh.push(makeHandle('g-h', i, 'row'))

  const cluster = (arr, tol) => {
    const sorted = arr.slice().sort((a, b) => a - b)
    const out = []
    let cur = []
    sorted.forEach((v) => {
      if (!cur.length || v - cur[cur.length - 1] <= tol) cur.push(v)
      else { out.push(cur); cur = [v] }
    })
    if (cur.length) out.push(cur)
    return out.map((g) => (g[0] + g[g.length - 1]) / 2)
  }

  const place = () => {
    const wr = ws.getBoundingClientRect()
    const panels = [...ws.querySelectorAll(':scope > .panel')]
    const rects = panels.map((p2) => p2.getBoundingClientRect())
    const xsRaw = []
    const ysRaw = []
    rects.forEach((b) => {
      xsRaw.push(b.left, b.right)
      ysRaw.push(b.top, b.bottom)
    })
    const xs = cluster(xsRaw, 14)
    const ys = cluster(ysRaw, 14)
    vh.forEach((h) => {
      const i = Number(h.dataset.index)
      const t = xs[i]
      if (t == null) return
      h.style.left = (t - wr.left - 3) + 'px'
      h.style.top = '0px'
      h.style.height = '100%'
    })
    hh.forEach((h) => {
      const i = Number(h.dataset.index)
      const t = ys[i]
      if (t == null) return
      h.style.top = (t - wr.top - 3) + 'px'
      h.style.left = '0px'
      h.style.width = '100%'
    })
  }
  setTimeout(place, 400)
  state.__gridPlace = place
}

function beginSplitDrag(ev, dir, index) {
  if (ev.button !== 0) return
  ev.preventDefault()
  const ws = $('grid')
  if (!ws) return
  const start = dir === 'col' ? ev.clientX : ev.clientY
  const fr = (dir === 'col' ? state.grid.colFr : state.grid.rowFr).slice()
  const a = index - 1
  const b = index
  const panels = [...ws.querySelectorAll(':scope > .panel')]
  const rects = panels.map((p) => p.getBoundingClientRect())
  let spanPx = 0
  if (dir === 'col') {
    const lefts = [...new Set(rects.map((r2) => Math.round(r2.left)))].sort((x, y) => x - y)
    if (lefts.length > b) spanPx = lefts[b] - lefts[a]
  } else {
    const tops = [...new Set(rects.map((r2) => Math.round(r2.top)))].sort((x, y) => x - y)
    if (tops.length > b) spanPx = tops[b] - tops[a]
  }
  if (!spanPx) spanPx = 400
  const perFr = spanPx / Math.max(0.001, fr[a] + fr[b])

  const move = (e) => {
    const delta = (dir === 'col' ? e.clientX : e.clientY) - start
    const next = fr.slice()
    const shift = delta / perFr
    next[a] = Math.max(0.2, fr[a] + shift)
    next[b] = Math.max(0.2, fr[b] - shift)
    if (dir === 'col') state.grid.colFr = next
    else state.grid.rowFr = next
    gridApplyFr()
    if (state.__gridPlace) state.__gridPlace()
  }
  const up = () => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', up)
    document.body.classList.remove('splitting')
  }
  document.body.classList.add('splitting')
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', up)
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
    // 注意：gridAddColumn 内部会 push 一次新列，这里不要再 push，否则每个格子塞两份 id 导致布局错乱
    saveUi()
    gridAddColumn(panel, id)
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
