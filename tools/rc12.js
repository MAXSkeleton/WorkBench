const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
const old = "  if (process.argv.includes('--rctest2')) rcClickMenuTest(win, log).catch((e) => log('rctest', 'ERR ' + e.message))"
const neu = old + "\n  if (process.argv.includes('--rcprobe')) rcProbe(win, log).catch((e) => log('rcprobe', 'ERR ' + e.message))"
if (!s.includes("process.argv.includes('--rcprobe')")) s = s.replace(old, neu)
fs.writeFileSync(p, s, 'utf8')
console.log('wired --rcprobe')