const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
s = s.replace('  await sleep: 0\n', '')
s = s.replace("if (process.argv.includes('--rctest')) scheduleRcTest(win)",
  "if (process.argv.includes('--rctest')) scheduleRcTest(win, log)\n  if (process.argv.includes('--rctest2')) rcClickMenuTest(win, log).catch((e) => log('rctest', 'ERR ' + e.message))")
fs.writeFileSync(p, s, 'utf8')
console.log('修好 rcClickMenuTest 并挂上 --rctest2')