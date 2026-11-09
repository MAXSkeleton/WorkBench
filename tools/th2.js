const fs = require('node:fs')
// 1) index.html 加载 theme.css（在 styles.css 之前）
let h = fs.readFileSync('E:/Work/workbench/renderer/index.html','utf8')
if (!h.includes('theme.css')) {
  h = h.replace('  <link rel="stylesheet" href="./styles.css" />', '  <link rel="stylesheet" href="./theme.css" />\n  <link rel="stylesheet" href="./styles.css" />')
  fs.writeFileSync('E:/Work/workbench/renderer/index.html', h, 'utf8')
  console.log('index.html 已加载 theme.css')
} else console.log('theme.css 已加载')