const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
const anchor = "})()\n} catch (e) { window.__wtErrCatch(e) }"
if (!s.includes(anchor)) throw new Error('锚点没找到')
if (!s.includes('__wtCtxFallback')) {
  const block = [
    "  // 兜底：任何落在第一行里的右键都归我们处理（防止某个子节点没挂监听时「点了没反应」）",
    "  document.addEventListener('contextmenu', function (ev) {",
    "    var hostEl = document.getElementById('taskbar')",
    "    if (!hostEl || !hostEl.contains(ev.target)) return",
    "    ev.preventDefault()",
    "    if (document.querySelector('.lbar-menu')) return",
    "    var chipEl = ev.target.closest ? ev.target.closest('.lbar-item') : null",
    "    if (chipEl) {",
    "      var kk = chipEl.dataset.kind",
    "      var arr2 = kk === 'local' ? bar.local : bar.web",
    "      var it2 = arr2[Number(chipEl.dataset.idx)]",
    "      if (it2) itemMenu(kk, it2, ev.clientX, ev.clientY)",
    "    } else {",
    "      barMenu(ev.clientX, ev.clientY)",
    "    }",
    "  }, true)",
    "  window.__wtCtxFallback = true",
    anchor
  ].join('\n')
  s = s.replace(anchor, block)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已加文档级右键兜底')
}