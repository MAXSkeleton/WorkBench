const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
const old = `function applyMove(id, targetId, side) {
  const el = panelEl(id)
  const tEl = panelEl(targetId)
  if (!el || !tEl || el === tEl) return`
const neu = `function gridApplyMove(id, targetId, side) {
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
  if (!el || !tEl || el === tEl) return`
if (!s.includes(old)) { console.log('! applyMove 头未匹配'); process.exit(1) }
s = s.replace(old, neu)
fs.writeFileSync(p, s, 'utf8')
console.log('gridApplyMove 已插入')