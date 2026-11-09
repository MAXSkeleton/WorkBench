const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/bar.js'
let s = fs.readFileSync(p, 'utf8')

// 修复 commit 里的重复声明，并补一个健壮的文件头
const dup = `    const commit = () => {
      const arr = state2.kind === 'local' ? bar.local : bar.web
      let target = item

      const arr = state2.kind === 'local' ? bar.local : bar.web
      let target = item
      if (target && item) {`
const clean = `    let commit = null
    const doSave = () => {
      const arr = state2.kind === 'local' ? bar.local : bar.web
      let target = item
      if (target && item) {`
if (s.includes(dup)) {
  s = s.replace(dup, clean)
  console.log('重复声明已清')
} else { console.log('! 重复块未匹配'); process.exit(1) }

// 在 commit 结尾( toastSafe('已保存') + }) 处换掉，改为 doSave 闭包结束 + 暴露 commit
const tail = `      save()
      closeDialog()
      render()
      toastSafe('已保存')
    })`
const tailNew = `      save()
      closeDialog()
      render()
      toastSafe('已保存')
    }
    commit = doSave`
if (s.includes(tail)) {
  s = s.replace(tail, tailNew)
  console.log('doSave 收尾完成')
} else { console.log('! 收尾块未匹配'); process.exit(1) }

fs.writeFileSync(p, s, 'utf8')
console.log('阶段2 完成')