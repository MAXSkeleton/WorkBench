const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')

// 1) ok 按钮回调改为只调 commit()
const olds = "    ok.addEventListener('click', () => {\n      const arr = state2.kind === 'local' ? bar.local : bar.web\n      let target = item\n"
// 现在 ok 回调后面跟的是 commit 之后的孤本（如果有残留）。改为：ok 回调直接 commit()
if (s.includes(olds)) {
  s = s.replace("    ok.addEventListener('click', () => {\n      const arr = state2.kind === 'local' ? bar.local : bar.web\n      let target = item\n      if (target && item) {\n        // 类型可能被改过：先从原分组移除",
    "    ok.addEventListener('click', () => { if (commit) commit() })\n    // 保留原逻辑，仅兜底\n    let x;")
  console.log('(ok回调处理，若有残留将在下方单独校验)')
}

fs.writeFileSync(p, s, 'utf8')
console.log('完成，剩余 ok 回调数: ' + (s.match(/ok\.addEventListener\(.click./g)||[]).length)