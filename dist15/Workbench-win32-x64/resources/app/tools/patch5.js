'use strict'
/* 第五轮：第一栏改图标 / 窗口→界面 + 重置项 / 退出保留布局 */
const fs = require('node:fs')
const P = 'E:/Work/workbench/'
const log = (...a) => console.log('[patch5]', ...a)

let r = fs.readFileSync(P + 'renderer/renderer.js', 'utf8')

/* ---------- 1) 第一栏：文字 → exe 图标 ---------- */
const dotBlock = `    const dot = document.createElement('i')
    dot.className = 'tb-dot'
    btn.appendChild(dot)
    btn.appendChild(document.createTextNode(it.label || it.key))`
if (r.includes(dotBlock)) {
  r = r.replace(dotBlock, `    btn.classList.add('tb-icon')
    const ico = document.createElement('img')
    ico.className = 'tb-ico'
    ico.alt = ''
    ico.src = 'icons/' + it.key + '.png'
    ico.addEventListener('error', () => {
      ico.remove()
      const t = document.createElement('span')
      t.textContent = (it.label || it.key).slice(0, 2)
      btn.appendChild(t)
    })
    btn.appendChild(ico)`)
  log('第一栏改成图标')
}

/* ---------- 2) 窗口 → 界面 ---------- */
r = r.replace(`  wbtn.textContent = '窗口 ▾'
  wbtn.title = '添加窗口'`, `  wbtn.textContent = '界面 ▾'
  wbtn.title = '添加窗口 / 重置界面'`)

/* 菜单末尾追加分段线 + 两个重置项 */
const poolEnd = `    wmenu.appendChild(it)
  })`
if (!r.includes('重置当前预设')) {
  r = r.replace(poolEnd, `    wmenu.appendChild(it)
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
  wmenu.appendChild(resetAll)`)
  log('界面下拉加了重置项')
}

/* ---------- 3) 布局持久化 ---------- */
if (!r.includes('function saveUi()')) {
  const anchor = 'function currentPresetName() {'
  r = r.replace(anchor, `const UI_KEY = 'workbench.ui.v2'

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

function currentPresetName() {`)

  /* applyPreset / addWindow / gridRemove 之后保存 */
  r = r.replace(`  state.currentPreset = p.name
  gridRender()
  rerenderPanels()
  buildWindowBar(state.scenario)`, `  state.currentPreset = p.name
  gridRender()
  rerenderPanels()
  buildWindowBar(state.scenario)
  saveUi()`)

  const addWinIdx = r.indexOf('function addWindow(')
  if (addWinIdx > 0) {
    const seg = r.slice(addWinIdx)
    const rel = seg.indexOf('buildWindowBar(state.scenario)')
    if (rel > 0) {
      const cut = addWinIdx + rel + 'buildWindowBar(state.scenario)'.length
      r = r.slice(0, cut) + '\n  saveUi()' + r.slice(cut)
    }
  }

  const rmIdx = r.indexOf('function gridRemove(')
  if (rmIdx > 0) {
    const seg = r.slice(rmIdx)
    const rel = seg.indexOf('buildWindowBar(state.scenario)')
    if (rel > 0) {
      const cut = rmIdx + rel + 'buildWindowBar(state.scenario)'.length
      r = r.slice(0, cut) + '\n  saveUi()' + r.slice(cut)
    }
  }

  /* 启动时恢复上次界面 */
  r = r.replace(`  if ((sc.layout || {}).mode === 'grid') buildGridWorkspace(sc)`, `  if ((sc.layout || {}).mode === 'grid') {
    buildGridWorkspace(sc)
    restoreUi()
  }`)

  /* resetOnStart 时顺带清掉界面存档 */
  r = r.replace(`      localStorage.removeItem(STORE_KEY)
      localStorage.removeItem('workbench.layouts.v3')`, `      localStorage.removeItem(STORE_KEY)
      localStorage.removeItem(UI_KEY)
      localStorage.removeItem('workbench.layouts.v3')`)

  log('持久化与重置已接入')
}

fs.writeFileSync(P + 'renderer/renderer.js', r, 'utf8')

/* ---------- 4) 样式 ---------- */
let C = fs.readFileSync(P + 'renderer/styles.css', 'utf8')
if (!C.includes('.tb-ico')) {
  C += `
/* ── 第一栏：exe 图标按钮 ── */
.tb-btn.tb-icon { padding: 0 7px; min-width: 34px; justify-content: center; }
.tb-ico { width: 18px; height: 18px; display: block; object-fit: contain; }
.tb-btn.tb-icon span { font-size: 11px; opacity: .8; }

/* ── 下拉分段线 ── */
.tb-menu-sep {
  height: 1px; margin: 5px 4px;
  background: rgba(255, 255, 255, .12);
}
`
  fs.writeFileSync(P + 'renderer/styles.css', C, 'utf8')
  log('样式已补')
}

/* ---------- 5) 场景：不再每次启动重置 ---------- */
const scPath = P + 'scenarios/dev.json'
const sc = JSON.parse(fs.readFileSync(scPath, 'utf8'))
sc.resetOnStart = false
fs.writeFileSync(scPath, JSON.stringify(sc, null, 2), 'utf8')
log('resetOnStart = false')

log('done')
