const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/styles.css'
let s = fs.readFileSync(p, 'utf8')
// 1) 移除 styles.css 里的 :root 变量块（改由 theme.css 提供）
const rootBlock = ":root {\n  --bg: #0b0d12;\n  --panel: #12151c;\n  --panel-2: #171b24;\n  --border: rgba(255, 255, 255, .09);\n  --text: #e6e9ef;\n  --muted: rgba(230, 233, 239, .55);\n  --accent: #4f8ef7;\n  --ok: #3ecf8e;\n  --warn: #eeba18;\n  --err: #f43146;\n  --title-h: 30px;\n  --gap: 6px;\n}\n"
if (s.includes(rootBlock)) { s = s.replace(rootBlock, "/* 主题变量（--bg/--panel/--accent/字体等）已独立到 theme.css */"); console.log(':root 已移除，改由 theme.css 提供') }
else console.log('! :root 精确块未匹配')
// 2) 顶部注释说明
s = "/* 个人工作站 · 渲染层样式\n   外观变量（颜色/字体/间距）全部在 theme.css；本文件的 :root 已移除。\n   改换肤：只改 renderer/theme.css 即可。 */\n" + s
fs.writeFileSync(p, s, 'utf8')
console.log('styles.css 已剥离 :root')