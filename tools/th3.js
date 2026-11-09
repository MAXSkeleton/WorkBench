const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/styles.css'
let s = fs.readFileSync(p, 'utf8')
const old = '  font: 13px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;'
const neu = '  font: var(--font-size, 13px)/var(--line-height, 1.55) var(--font-ui, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif);'
if (s.includes(old)) { s = s.replace(old, neu); fs.writeFileSync(p, s, 'utf8'); console.log('body 字体已改用主题变量') }
else { console.log('! body 字体未匹配') }