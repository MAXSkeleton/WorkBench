const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
const old = "    setTimeout(() => document.addEventListener('pointerdown', closeMenu, { once: true }), 0)"
if (!s.includes(old)) throw new Error('关闭器代码没找到')
const neu = [
  "    const onDown = (ev) => {",
  "      const m2 = document.querySelector('.lbar-menu')",
  "      if (m2 && m2.contains(ev.target)) return",
  "      closeMenu()",
  "      document.removeEventListener('pointerdown', onDown, true)",
  "    }",
  "    setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0)"
].join('\n')
s = s.replace(old, neu)
fs.writeFileSync(p, s, 'utf8')
console.log('已修：点菜单内部不再直接关掉菜单')