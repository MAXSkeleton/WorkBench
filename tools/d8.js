const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
const oldRow = [
"              row2.addEventListener('click', () => {",
"                if (e.isDir) {",
"                  state2.dir = e.path",
"                  pathEl.textContent = e.path",
"                  listDir(e.path, box, inputRef)",
"                } else if (/\\.(exe|bat|cmd|lnk)$/i.test(e.name)) {",
"                  state2.path = e.path",
"                  if (inputRef) inputRef.value = e.path",
"                } else {",
"                  toastSafe('只能选 exe / bat / cmd / lnk')",
"                }",
"              })",
"              box.appendChild(row2)"
].join('\n')
const newRow = [
"              row2.addEventListener('click', () => {",
"                if (e.isDir) {",
"                  state2.dir = e.path",
"                  pathEl.textContent = e.path",
"                  listDir(e.path, box, inputRef)",
"                } else if (/\\.(exe|bat|cmd|lnk)$/i.test(e.name)) {",
"                  state2.path = e.path",
"                  if (inputRef) inputRef.value = e.path",
"                } else {",
"                  toastSafe('只能选 exe / bat / cmd / lnk')",
"                }",
"              })",
"              if (/\\.(exe|bat|cmd|lnk)$/i.test(e.name)) {",
"                row2.addEventListener('dblclick', () => {",
"                  state2.path = e.path",
"                  if (inputRef) inputRef.value = e.path",
"                  if (!state2.label) state2.label = e.name.replace(/\\.[^.]+$/, '')",
"                  if (window.__wtDialogLabel) window.__wtDialogLabel(state2.label)",
"                  if (commit) commit()",
"                })",
"              }",
"              box.appendChild(row2)"
].join('\n')
if (s.includes(oldRow)) { s = s.replace(oldRow, newRow); console.log('dblclick ok') }
else { console.log('row no match'); process.exit(1) }
fs.writeFileSync(p, s, 'utf8')
console.log('done')