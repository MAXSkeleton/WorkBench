const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
const old = [
  "    barEl.hidden = false",
  "    barEl.addEventListener('contextmenu', (ev) => {",
  "      if (ev.target.closest && ev.target.closest('.lbar-item')) return",
  "      ev.preventDefault()",
  "      barMenu(ev.clientX, ev.clientY)",
  "    })",
  "    document.addEventListener('pointerdown', (ev) => {",
  "      if (pop && !pop.contains(ev.target)) closeDialog()",
  "    })"
].join('\n')
const neu = [
  "    barEl.hidden = false",
  "    if (!barEl.dataset.wtBound) {",
  "      barEl.dataset.wtBound = '1'",
  "      barEl.addEventListener('contextmenu', (ev) => {",
  "        if (ev.target.closest && ev.target.closest('.lbar-item')) return",
  "        ev.preventDefault()",
  "        barMenu(ev.clientX, ev.clientY)",
  "      })",
  "      document.addEventListener('pointerdown', (ev) => {",
  "        if (pop && !pop.contains(ev.target)) closeDialog()",
  "      })",
  "    }"
].join('\n')
if (!s.includes(old)) throw new Error('监听段没找到')
s = s.replace(old, neu)
fs.writeFileSync(p, s, 'utf8')
console.log('已避免重复绑定')