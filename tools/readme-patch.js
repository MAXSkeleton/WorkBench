const fs = require('node:fs')
const p = 'E:/Work/workbench/README.md'
let t = fs.readFileSync(p, 'utf8')
if (t.indexOf('## 两行任务栏') >= 0) { console.log('README 已有该章节'); process.exit(0) }
const section = [
  '',
  '## 两行任务栏',
  '',
  '**第一行：启动器** —— PyCharm / DevEco Studio / VSCode（桌面版）/ Obsidian / VMware / 资源管理器，全部显示成各程序自己的 exe 图标（从 exe 提取的 32×32 PNG，放在 renderer/icons/），悬停看名字，点一下启动。',
  '',
  '**第二行：工作站 | 设置 | 外观 | 界面 ▾ | 预设按钮 | ＋**',
  '',
  '- **界面 ▾**：上面是「加窗口」列表（电脑监控 / 文件预览器 / 文件浏览器 / 笔记 / DSH / VSCode，点一下在右侧新开一列），分段线下面是 **重置当前预设** 与 **重置全部**。',
  '- **预设按钮**：「基础」「开发」点一下切换，高亮的那个是当前预设；＋ 把当前布局存成新预设。',
  '',
  '### 布局会记住',
  '',
  '退出软件不会重置界面：当前预设、每一格放了哪个窗口、列宽行高都存在 localStorage 的 workbench.ui.v2 里，下次打开照原样恢复。',
  '',
  '- **重置当前预设**：只把当前预设恢复成它定义时的样子（手动加的窗口会被移除）。',
  '- **重置全部**：清掉所有存档，回到「基础」预设。',
  '',
].join('\n')
fs.writeFileSync(p, t + section, 'utf8')
console.log('README 已更新')