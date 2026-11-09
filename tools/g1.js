const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')

// 新增 gridAddColumn：增量在每行末尾加一列 + 挂载新面板，不破坏已有 webview
const newFn = `function gridAddColumn(panel, id) {
  const ws = document.getElementById('grid')
  if (!ws) return
  const cells = gridCells()
  cells.forEach((row) => row.push(id))
  const cols = Math.max(1, ...cells.map((r2) => r2.length))
  const rows = Math.max(1, cells.length)
  cells.forEach((row) => { while (row.length < cols) row.push('') })

  // 区域名：新面板统一一个新的 w 字母
  const used = new Set()
  ws.style.gridTemplateAreas.split(/\\n?/).join('').match(/"[^"]*"/g) || []
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
`
// 插到 gridRender 之前
anchor = "function gridRender() {"
s = s.replace(anchor, newFn + "\n" + anchor)

// addWindow 网格分支：改用增量
const oldBranch = `  if (state.gridMode) {
    const cells = gridCells()
    cells.forEach((row) => row.push(id))
    gridRender()
    rerenderPanels()
    buildWindowBar(sc)
  } else {`
const newBranch = `  if (state.gridMode) {
    const cells = gridCells()
    cells.forEach((row) => row.push(id))
    saveUi()
    gridAddColumn(panel, id)
    buildWindowBar(sc)
  } else {`
if (s.includes(oldBranch)) { s = s.replace(oldBranch, newBranch); console.log('addWindow 已走增量') }
else { console.log('! addWindow 分支未匹配') }

fs.writeFileSync(p, s, 'utf8')
console.log('gridAddColumn 已加入')