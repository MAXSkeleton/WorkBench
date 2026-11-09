const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')

// 1) ↑ 按钮：根视图无操作；盘符根再上回 This PC
const oldUp = `        up.addEventListener('click', () => {
          const p = state2.dir.replace(/[\\/][^\\/]+[\\/]?$/, '')
          state2.dir = p && p.length > 2 ? p : state2.dir.slice(0, 2)
          pathEl.textContent = state2.dir
          listDir(state2.dir, listEl)
        })`
const newUp = `        up.addEventListener('click', () => {
          if (state2.dir === 'This PC') return
          const isDriveRoot = /^[A-Za-z]:[\\\\/]?$/.test(state2.dir)
          if (isDriveRoot) { state2.dir = 'This PC'; pathEl.textContent = 'This PC'; listDir('This PC', listEl, inp); return }
          const p = state2.dir.replace(/[\\/][^\\/]+[\\/]?$/, '')
          state2.dir = p && p.length > 2 ? p : state2.dir.slice(0, 2)
          pathEl.textContent = state2.dir
          listDir(state2.dir, listEl, inp)
        })`
if (s.includes(oldUp)) { s = s.replace(oldUp, newUp); console.log('↑ 已支持回 This PC') }
else { console.log('! ↑ not matched'); }

// 2) exe 行加 dblclick 直接保存（至少回填 nameInp 命名后 commit）
const oldRow = `                } else if (/\.(exe|bat|cmd|lnk)$/i.test(e.name)) {
                  state2.path = e.path
                  if (inputRef) inputRef.value = e.path
                } else {
                  toastSafe('只能选 exe / bat / cmd / lnk')
                }
              })`
const newRow = `                } else if (/\.(exe|bat|cmd|lnk)$/i.test(e.name)) {
                  state2.path = e.path
                  if (inputRef) inputRef.value = e.path
                } else {
                  toastSafe('只能选 exe / bat / cmd / lnk')
                }
              })
              if (/\.(exe|bat|cmd|lnk)$/i.test(e.name)) {
                row2.addEventListener('dblclick', () => {
                  state2.path = e.path
                  if (inputRef) inputRef.value = e.path
                  if (!state2.label) state2.label = e.name.replace(/\.[^.]+$/, '')
                  if (window.__wtDialogLabel) window.__wtDialogLabel(state2.label)
                  if (commit) commit()
                })
              }`
if (s.includes(oldRow)) { s = s.replace(oldRow, newRow); console.log('exe 双击直存已加') }
else { console.log('! row not matched'); process.exit(1) }

fs.writeFileSync(p, s, 'utf8')
console.log('dblclick patch 完成')