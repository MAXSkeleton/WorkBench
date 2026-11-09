const fs = require('node:fs')
const p = 'E:/Work/workbench/README.md'
let s = fs.readFileSync(p, 'utf8')
const anchor = '## 做成 exe'
if (s.includes(anchor) && !s.includes('单一 dist')) {
  const insert = `
## 目录结构与「只改 dist」约定

- 单一安装目录：dist\\Workbench-win32-x64\\ （含 Workbench.exe 与 resources\\app\\）。**以后所有代码调整都直接改 dist\\Workbench-win32-x64\\resources\\app\\ 里的文件**，不再新建 distNN 或散落的临时目录。
- 工程根目录的 renderer\\ / main.js / preload.js 是**打包源**；tools\\build-exe.js 会把它们打进 resources\\app。改了 dist 里的文件后，若需要重新打包请用源码覆盖或同步到源码目录再跑打包脚本。
- 主题/外观：全部 CSS 变量集中在 renderer\\theme.css 的 :root（背景色 --bg、面板 --panel、边框 --border、文字 --text、强调 --accent、字体 --font-ui/--font-mono/--font-size 等），改外观只动这一个文件，不动逻辑。
- 启动 dist\\Workbench-win32-x64\\Workbench.exe，或双击 重启工作站.cmd（固定启动单一 dist，不再自动找最新 distNN）。

`
  s = s.replace(anchor, insert + anchor)
  fs.writeFileSync(p, s, 'utf8')
  console.log('README 已更新')
} else { console.log('无需更新或已存在：singleDist=' + s.includes('单一 dist')) }