const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
// 第二行任务栏开头的 工作站 brand 块
const oldBrand = "  const brand = document.createElement('span')\n  brand.className = 'tb-brand'\n  brand.textContent = '工作站'\n  left.appendChild(brand)\n\n"
if (s.includes(oldBrand)) { s = s.replace(oldBrand, ""); console.log('第二行 工作站 brand 已删') }
else { console.log('! 第二行brand未匹配') }
fs.writeFileSync(p, s, 'utf8')
node --check renderer/renderer.js