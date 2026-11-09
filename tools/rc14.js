const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
const before = (s.match(/x: 150, y: 18/g) || []).length
s = s.split('x: 143, y: 57').join('x: 150, y: 18')
fs.writeFileSync(p, s, 'utf8')
const after = (s.match(/x: 150, y: 18/g) || []).length
console.log('before=', before, 'after=', after)