const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
const old = [
  "      var k = chip.dataset.kind",
  "      var it = findItem(k, chip.dataset.idx)",
  "      if (it) itemMenu(k, it, ev.clientX, ev.clientY)"
].join('\n')
const neu = [
  "      var k = chip.dataset.kind",
  "      var arr = k === 'local' ? bar.local : bar.web",
  "      var it = arr[Number(chip.dataset.idx)]",
  "      if (it) itemMenu(k, it, ev.clientX, ev.clientY)"
].join('\n')
if (!s.includes(old)) throw new Error('兜底片段没找到')
s = s.replace(old, neu)
fs.writeFileSync(p, s, 'utf8')
console.log('兜底已改用 bar.local/bar.web')