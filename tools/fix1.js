const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
const old = `  if (state.gridMode) {
    const cells = gridCells()
    cells.forEach((row) => row.push(id))
    saveUi()
    gridAddColumn(panel, id)
    buildWindowBar(sc)
  } else {`
const neu = `  if (state.gridMode) {
    // 注意：gridAddColumn 内部会 push 一次新列，这里不要再 push，否则每个格子塞两份 id 导致布局错乱
    saveUi()
    gridAddColumn(panel, id)
    buildWindowBar(sc)
  } else {`
if (s.includes(old)) { s = s.replace(old, neu); fs.writeFileSync(p, s, 'utf8'); console.log('已去掉冗余 push，修复双 push') }
else { console.log('! 未匹配'); process.exit(1) }