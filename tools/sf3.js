const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
const old = `  const res = await window.app.start(SCENARIO_ID)`
const neu = `  const res = await window.app.start(SCENARIO_ID, engineOverrides())`
if (s.includes(old) && !s.includes('engineOverrides()')) {
  s = s.replace(old, neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已传 engineOverrides 给 start')
} else console.log('! 未匹配或已存在')