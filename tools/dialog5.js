const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')

// 1) listDir 支持根视图：dir === 'This PC' 时用 fsRoots 列出盘符/常用位置
const oldList = `        function listDir(dir, box, inputRef) {
          box.innerHTML = '<div class="lbar-empty">读取中…</div>'
          window.app.fsList(dir).then((res) => {`
const newList = `        function listDir(dir, box, inputRef) {
          box.innerHTML = '<div class="lbar-empty">读取中…</div>'
          if (dir === 'This PC') {
            window.app.fsRoots().then((rr) => {
              box.innerHTML = ''
              if (!rr || !rr.items) { box.appendChild(el('div','lbar-empty','读不到盘符')); return }
              const driveRows = rr.items.filter((it) => it.kind === 'drive')
              const quickRows = rr.items.filter((it) => it.kind === 'quick')
              const renderGroup = (cap, list) => {
                if (!list.length) return
                box.appendChild(el('div', 'lbar-fgroup', cap))
                list.forEach((it) => {
                  const row2 = el('div', 'lbar-frow')
                  row2.appendChild(el('span', 'lbar-ficon', it.kind === 'drive' ? '💽' : '📌'))
                  row2.appendChild(el('span', 'lbar-fname', it.name + (it.kind === 'drive' ? ' (盘)' : '')))
                  row2.addEventListener('click', () => {
                    state2.dir = it.path
                    pathEl.textContent = it.path
                    listDir(it.path, box, inputRef)
                  })
                  box.appendChild(row2)
                })
              }
              renderGroup('驱动器', driveRows)
              renderGroup('常用位置', quickRows)
              if (!driveRows.length && !quickRows.length) box.appendChild(el('div','lbar-empty','（无盘符）'))
            }).catch(() => { box.appendChild(el('div','lbar-empty','读取盘符失败')) })
            return
          }
          window.app.fsList(dir).then((res) => {`
if (s.includes(oldList)) { s = s.replace(oldList, newList); console.log('根视图分支已加') }
else { console.log('! listDir 起始未匹配'); process.exit(1) }

fs.writeFileSync(p, s, 'utf8')
console.log('根视图完成')