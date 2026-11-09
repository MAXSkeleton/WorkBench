const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
s = s.replace("scheduleRcTest(mainWindow)", "scheduleRcTest(win)")
fs.writeFileSync(p, s, 'utf8')
console.log('已改为 scheduleRcTest(win):', s.includes('scheduleRcTest(win)'))