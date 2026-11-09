const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
const oldUp = "        up.addEventListener('click', () => {\n          const p = state2.dir.replace(/[\\\\/][^\\\\/]+[\\\\/]?$/, '')\n          state2.dir = p && p.length > 2 ? p : state2.dir.slice(0, 2)\n          pathEl.textContent = state2.dir\n          listDir(state2.dir, listEl)\n        })"
const newUp = "        up.addEventListener('click', () => {\n          if (state2.dir === 'This PC') return\n          if (/^[A-Za-z]:[\\\\/]?$/.test(state2.dir)) { state2.dir = 'This PC'; pathEl.textContent = 'This PC'; listDir('This PC', listEl, inp); return }\n          const p = state2.dir.replace(/[\\\\/][^\\\\/]+[\\\\/]?$/, '')\n          state2.dir = p && p.length > 2 ? p : state2.dir.slice(0, 2)\n          pathEl.textContent = state2.dir\n          listDir(state2.dir, listEl, inp)\n        })"
if (s.includes(oldUp)) { s = s.replace(oldUp, newUp); console.log('up ok') } else console.log('up no')
fs.writeFileSync(p, s, 'utf8')