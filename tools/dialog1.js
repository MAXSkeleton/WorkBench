const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')

// 1) 初始 dir 改为根视图哨兵
const oldInit = "state2 = { kind: kind, path: (item && item.path) || '', url: (item && item.url) || '', label: (item && item.label) || '', dir: 'C:\\\\' }"
const newInit = "state2 = { kind: kind, path: (item && item.path) || '', url: (item && item.url) || '', label: (item && item.label) || '', dir: 'This PC' }"
if (s.includes(oldInit)) { s = s.replace(oldInit, newInit); console.log('初始 dir 已改') }
else { console.log('! 初始 dir 未匹配到，尝试宽松匹配'); const m = s.match(/dir: 'C:\\\\'/); if (m){ s = s.replace("dir: 'C:\\\\'", "dir: 'This PC'"); console.log('宽松替换完成') } }

// 2) 把保存逻辑抽成 commit(ref)
const commitNeedle = "    ok.addEventListener('click', () => {"
const commit = `    const commit = () => {
      const arr = state2.kind === 'local' ? bar.local : bar.web
      let target = item
`
if (s.includes(commitNeedle)) {
  s = s.replace(commitNeedle, commit)
  console.log('插入 commit 开头')
} else console.log('! ok 按钮监听未找到')

fs.writeFileSync(p, s, 'utf8')
console.log('阶段1 完成')