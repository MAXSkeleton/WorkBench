const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
if (!s.includes('__wtCtxFallback')) {
  const anchor = "  window.__wtBarReset = reset"
  const add = [
    "  // 兜底：任何落在第一行里的右键都归我们处理（避免某个子节点没挂监听时「点了没反应」）",
    "  document.addEventListener('contextmenu', function (ev) {",
    "    var host = document.getElementById('taskbar')",
    "    if (!host || !host.contains(ev.target)) return",
    "    ev.preventDefault()",
    "    if (document.querySelector('.lbar-menu')) return",
    "    var chip = ev.target.closest ? ev.target.closest('.lbar-item') : null",
    "    if (chip) {",
    "      var k = chip.dataset.kind",
    "      var it = findItem(k, chip.dataset.idx)",
    "      if (it) itemMenu(k, it, ev.clientX, ev.clientY)",
    "    } else {",
    "      barMenu(ev.clientX, ev.clientY)",
    "    }",
    "  }, true)",
    "  window.__wtCtxFallback = true",
    "",
    anchor
  ].join('\n')
  s = s.replace(anchor, add)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已加右键兜底')
}