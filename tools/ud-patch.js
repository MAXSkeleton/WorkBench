const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
const old = "const userData = path.join(HOME_DIR, 'userdata')"
if (!s.includes('WT_UD')) {
  const neu = "const userData = process.env.WT_UD ? path.join(HOME_DIR, process.env.WT_UD) : path.join(HOME_DIR, 'userdata')"
  if (!s.includes(old)) throw new Error('没找到 userData 行')
  s = s.replace(old, neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已支持 WT_UD 隔离 userData')
}