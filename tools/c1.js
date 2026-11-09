const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')

// 1) 去掉最左 "工作站" brand
const brandOld = "    const brand = el('span', 'lbar-brand', '工作站')\n    wrap.appendChild(brand)\n\n"
if (s.includes(brandOld)) { s = s.replace(brandOld, "") ; console.log('工作站 brand 已删') }
else { console.log('! brand 未匹配') }

// 2) 去掉最右提示文本（tb-right）
const rightOld = "    const right = el('div', 'tb-right')\n    right.id = 'tb-right'\n    right.textContent = '右键：新增本地 / 网站 · 右键图标：地址修改 / 删除 · 按住可拖动排序'\n    host.appendChild(right)\n"
if (s.includes(rightOld)) { s = s.replace(rightOld, "") ; console.log('右侧提示已删') }
else { console.log('! right 未匹配') }

fs.writeFileSync(p, s, 'utf8')
console.log('bar.js 清理完成')