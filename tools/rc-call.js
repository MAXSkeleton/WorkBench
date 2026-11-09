const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
const line = "  if (process.argv.includes('--diag')) scheduleDiag()"
if (!s.includes("--rctest")) {
  const t = s.replace(line, line + "\n  if (process.argv.includes('--rctest')) scheduleRcTest(mainWindow)")
  if (t === s) throw new Error('调用行没匹配到')
  fs.writeFileSync(p, t, 'utf8')
  console.log('已插入 --rctest 调用')
}