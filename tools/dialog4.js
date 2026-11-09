const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')
// 清掉 dialog3 遗留的无关行
s = s.split('\n').filter((l) => l.trim() !== 'let x;').join('\n')
// 给 ok 绑定点击 -> commit
const needle = "    commit = doSave\n    foot.appendChild(cancel)"
const neu = "    commit = doSave\n    ok.addEventListener('click', () => { if (commit) commit() })\n    foot.appendChild(cancel)"
if (s.includes(needle)) { s = s.replace(needle, neu); console.log('ok 已绑定 commit') }
else console.log('! 定位失败')
fs.writeFileSync(p, s, 'utf8')