const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
const oldBrand = "  const brand = document.createElement('span')\n  brand.className = 'tb-brand'\n  brand.textContent = '工作站'\n  left.appendChild(brand)\n\n"
if (s.includes(oldBrand)) {
  s = s.replace(oldBrand, "")
  fs.writeFileSync(p, s, 'utf8')
  console.log('第二行 工作站 brand 已删除')
} else {
  console.log('! 精确块未匹配，尝试宽松')
  const re = /  const brand = document\.createElement\('span'\)\n  brand\.className = 'tb-brand'\n  brand\.textContent = '工作站'\n  left\.appendChild\(brand\)\n\n/
  if (re.test(s)) { s = s.replace(re, ""); fs.writeFileSync(p, s, 'utf8'); console.log('宽松删除成功') }
  else { console.log('!! 仍未匹配') }
}