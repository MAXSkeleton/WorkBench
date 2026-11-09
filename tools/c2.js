const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
// 去掉第二行任务栏右侧的提示文本（整块 tb-right）
const oldHint = `  const hint = document.createElement('div')
  hint.className = 'tb-right'
  hint.textContent = '拖动分格边界可改大小；双击边界恢复均分'
  bar.appendChild(hint)
`
if (s.includes(oldHint)) { s = s.replace(oldHint, ""); console.log('第二行提示已删') }
else { console.log('! 第二行提示未匹配') }
fs.writeFileSync(p, s, 'utf8')