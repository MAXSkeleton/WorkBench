const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
const junk = "  ws.style.gridTemplateAreas.split(/\\n?/).join('').match(/\042[^\042]*\042/g) || []\n"
if (s.includes(junk)) { s = s.replace(junk, ""); console.log('残留行已清') }
else { console.log('! 残留行未精确匹配') }
fs.writeFileSync(p, s, 'utf8')