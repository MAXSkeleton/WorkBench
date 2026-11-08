'use strict'
/* 第二轮改造：文件→预览联动 / 外部拖拽 / 行列可拖拽 / 任务栏预设 */
const fs = require('node:fs')
const P = 'E:/Work/workbench/'
const log = (...a) => console.log('[patch2]', ...a)

/* ---------- 1. preload：取拖入文件的真实路径 ---------- */
let pre = fs.readFileSync(P + 'preload.js', 'utf8')
if (!pre.includes('pathForFile')) {
  pre = pre.replace(/const \{([^}]+)\} = require\('electron'\)/, (all, inner) => {
    const parts = inner.split(',').map((s) => s.trim())
    if (!parts.includes('webUtils')) parts.push('webUtils')
    return 'const { ' + parts.join(', ') + " } = require('electron')"
  })
  pre = pre.replace(/(\n\s*)pickFile:/, `$1pathForFile: (file) => { try { return webUtils.getPathForFile(file) } catch (e) { return (file && file.path) || '' } },$1pickFile:`)
  fs.writeFileSync(P + 'preload.js', pre, 'utf8')
  log('preload.js: pathForFile')
} else log('preload 已有 pathForFile')

/* ---------- 2. renderers.js：双击文件送预览器 + 预览器接受拖拽 ---------- */
let R = fs.readFileSync(P + 'renderer/renderers.js', 'utf8')
if (!R.includes("wt:preview")) {
  R = R.replace(`      row.addEventListener('dblclick', function () {
        if (it.isDir) openDir(it.path)
        else if (api.openPath) api.openPath(it.path)
      })`,
`      row.addEventListener('dblclick', function () {
        if (it.isDir) { openDir(it.path); return }
        window.dispatchEvent(new CustomEvent('wt:preview', { detail: { path: it.path } }))
      })`)
  log('文件浏览器双击 -> 预览事件')
}

if (!R.includes('window.__wtPreview')) {
  R = R.replace(`  pick.addEventListener('click', async () => {
    const p = await api.pickFile()
    if (p) show(p)
  })`,
`  window.__wtPreview = show

  pick.addEventListener('click', async () => {
    const p = await api.pickFile()
    if (p) show(p)
  })`)

  R = R.replace(`  wrap.addEventListener('drop', (ev) => {
    ev.preventDefault()
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]
    if (f && f.path) show(f.path)
  })`,
`  wrap.addEventListener('drop', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]
    if (!f) return
    const p = (api.pathForFile && api.pathForFile(f)) || f.path || ''
    if (p) show(p)
    else showMsg('拿不到这个文件的路径：' + f.name)
  })`)
  log('预览器：注册 __wtPreview + 外部拖拽')
}

/* 拖拽时给整块面板加高亮，方便看出能放进去 */
if (!R.includes("pv-drop-hint")) {
  R = R.replace(`  wrap.addEventListener('dragover', (ev) => ev.preventDefault())`,
`  wrap.addEventListener('dragover', (ev) => {
    ev.preventDefault()
    wrap.classList.add('pv-drag')
  })
  wrap.addEventListener('dragleave', () => wrap.classList.remove('pv-drag'))
  wrap.addEventListener('drop', () => wrap.classList.remove('pv-drag'))`)
}
fs.writeFileSync(P + 'renderer/renderers.js', R, 'utf8')

/* ---------- 3. renderer.js ---------- */
let r = fs.readFileSync(P + 'renderer/renderer.js', 'utf8')

/* 3.1 预览联动 */
if (!r.includes("wt:preview")) {
  r = r.replace(`  const sc = await window.app.scenario(SCENARIO_ID)`,
`  window.addEventListener('wt:preview', (ev) => {
    const p = (ev.detail && ev.detail.path) || ''
    if (!p) return
    const hasPv = Object.keys(state.panels).some((id) => state.panels[id].panel.type === 'preview')
    if (!hasPv) addWindow('preview')
    const go = () => { if (window.__wtPreview) window.__wtPreview(p); else setTimeout(go, 120) }
    setTimeout(go, hasPv ? 0 : 420)
  })

  const sc = await window.app.scenario(SCENARIO_ID)`)
  log('renderer.js: wt:preview 监听')
}

/* 3.2 用预设栏替换整个 buildWindowBar */
const wi = r.indexOf('function buildWindowBar(sc) {')
if (wi >= 0) {
  const end = r.indexOf('\n}\n', wi)
  if (end > 0) {
    const bar = `function presetStore() {
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
}

function currentPresetName() {
  return state.currentPreset || '基础'
}

function buildWindowBar(sc) {
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

  const sep = document.createElement('span')
  sep.className = 'tb-sep'
  left.appendChild(sep)

  // 预设下拉
  const pw = document.createElement('div')
  pw.className = 'tb-menu-wrap'
  const pbtn = document.createElement('button')
  pbtn.className = 'tb-btn tb-menu-btn'
  pbtn.textContent = currentPresetName() + ' ▾'
  pbtn.title = '切换界面预设'
  const menu = document.createElement('div')
  menu.className = 'tb-menu'
  menu.hidden = true
  allPresets().forEach((p) => {
    const it = document.createElement('button')
    it.className = 'tb-menu-item' + (p.name === currentPresetName() ? ' on' : '')
    it.textContent = p.name
    it.addEventListener('click', (ev) => {
      ev.stopPropagation()
      menu.hidden = true
      applyPreset(p)
      toast('已切到预设：' + p.name)
    })
    menu.appendChild(it)
  })
  pbtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    menu.hidden = !menu.hidden
  })
  document.addEventListener('click', () => { if (menu) menu.hidden = true })
  pw.appendChild(pbtn)
  pw.appendChild(menu)
  left.appendChild(pw)

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
  const hint = document.createElement('div')
  hint.className = 'tb-right'
  hint.textContent = '拖动分格边界可改大小；双击边界恢复均分'
  bar.appendChild(hint)
}
`
    r = r.slice(0, wi) + bar + r.slice(end + 3)
    log('buildWindowBar -> 预设栏')
  }
}

/* 3.3 网格可拖拽：fr 分配 + 边界手柄 */
if (!r.includes('function gridHandles')) {
  r = r.replace(`  empties.forEach((e) => {
    const ph = document.createElement('div')
    ph.className = 'cell-empty'
    ph.style.gridArea = e.nm
    ph.textContent = '空 · 用「窗口 ▾」放一个窗口进来'
    ws.appendChild(ph)
  })
}`,
`  empties.forEach((e) => {
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

  const place = () => {
    const wr = ws.getBoundingClientRect()
    const panels = [...ws.querySelectorAll(':scope > .panel')]
    vh.forEach((h) => {
      const i = Number(h.dataset.index)
      const right = panels.find((p) => Math.abs(p.getBoundingClientRect().left - wr.left) > 2 && true)
      const xs = panels.map((p) => p.getBoundingClientRect())
      const sortedX = xs.map((b) => b.left).sort((a, b) => a - b)
      const boundaries = []
      const seenX = new Set()
      xs.forEach((b) => {
        const k1 = Math.round(b.left)
        const k2 = Math.round(b.right)
        if (!seenX.has(k1)) { seenX.add(k1); boundaries.push(b.left) }
        if (!seenX.has(k2)) { seenX.add(k2); boundaries.push(b.right) }
      })
      const uniq = [...new Set(boundaries.map((v) => Math.round(v)))].sort((a, b) => a - b)
      const target = uniq[i]
      if (target == null) return
      h.style.left = (target - wr.left - 3) + 'px'
      h.style.top = '0px'
      h.style.height = '100%'
    })
    hh.forEach((h) => {
      const i = Number(h.dataset.index)
      const ys = panels.map((p) => p.getBoundingClientRect())
      const boundaries = []
      const seenY = new Set()
      ys.forEach((b) => {
        ;[b.top, b.bottom].forEach((v) => {
          const k = Math.round(v)
          if (!seenY.has(k)) { seenY.add(k); boundaries.push(v) }
        })
      })
      const uniq = [...new Set(boundaries.map((v) => Math.round(v)))].sort((a, b) => a - b)
      const target = uniq[i]
      if (target == null) return
      h.style.top = (target - wr.top - 3) + 'px'
      h.style.left = '0px'
      h.style.width = '100%'
    })
  }
  setTimeout(place, 60)
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
}`)
  log('网格拖拽已加')
}

fs.writeFileSync(P + 'renderer/renderer.js', r, 'utf8')

/* ---------- 4. 样式 ---------- */
let C = fs.readFileSync(P + 'renderer/styles.css', 'utf8')
if (!C.includes('.g-handle')) {
  C += `
/* ── 网格边界拖拽 ── */
.workspace.gridmode { position: relative; }
.g-handle { position: absolute; z-index: 40; }
.g-handle.g-v { width: 6px; cursor: col-resize; }
.g-handle.g-h { height: 6px; cursor: row-resize; }
.g-handle:hover, body.splitting .g-handle { background: rgba(79, 142, 247, .55); border-radius: 3px; }
body.splitting { user-select: none; cursor: col-resize; }

/* ── 预设栏 ── */
.taskbar2 { overflow: visible; position: relative; z-index: 50; }
.tb-menu-item.on { color: #9ecbff; }
.tb-plus { font-size: 14px; line-height: 1; padding: 0 8px; }
.tb-save { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; }
.tb-save[hidden] { display: none !important; }
.tb-save-input {
  height: 22px; width: 150px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, .16);
  background: rgba(0, 0, 0, .25);
  color: inherit; font-size: 12px; outline: none;
}
.tb-save-input:focus { border-color: rgba(79, 142, 247, .7); }

/* 预览器拖拽高亮 */
.pv.pv-drag { outline: 1px dashed rgba(79, 142, 247, .8); outline-offset: -3px; }
`
  fs.writeFileSync(P + 'renderer/styles.css', C, 'utf8')
  log('styles.css 已补')
}

log('done')
