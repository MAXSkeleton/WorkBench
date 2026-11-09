const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/styles.css'
let s = fs.readFileSync(p, 'utf8')

// 按钮不压缩、不换行，输入框负责收缩
s = s.replace(`.pv-btn { height: 22px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .14); background: transparent; color: inherit; font-size: 12px; cursor: pointer; }`,
`.pv-btn { flex: 0 0 auto; height: 22px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .14); background: transparent; color: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; line-height: 20px; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }`)

if (!s.includes('.pv-input')) {
  // 若没有单独 .pv-input 定义，追加让输入框可收缩
  s += `
.pv-input { flex: 1 1 auto; min-width: 40px; height: 22px; padding: 0 8px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .04); color: inherit; font-size: 12px; }
`
} else {
  s = s.replace(/\.pv-input\s*\{([^}]*)\}/, (m, inner) => {
    if (!/flex/.test(inner)) return '.pv-input { flex: 1 1 auto; min-width: 40px; ' + inner.trim().replace(/;$/, '') + '; }'
    return m
  })
}
fs.writeFileSync(p, s, 'utf8')
console.log('pv 按钮防溢出已加')