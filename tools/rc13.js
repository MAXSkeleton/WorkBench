const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
s = s.replace("x: 143, y: 57", "x: 150, y: 18")
s = s.replace("x: 143, y: 57", "x: 150, y: 18")
fs.writeFileSync(p, s, 'utf8')
const hits = (s.match(/x: 150, y: 18/g) || []).length
console.log('坐标改到 (150,18) 共', hits, '处')
node --check main.js; if ($LASTEXITCODE -eq 0) { "语法 OK" }