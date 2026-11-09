const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')

// 1) 加全局 engineOverrides，startEngine 用它覆盖 ec.cmd / ec.home
const needle1 = "let engineUrl = ''"
const rep1 = "let engineUrl = ''\n// 用户设置（渲染层保存）：覆盖场景里的 engine.cmd / engine.home，用于「换用户 / 换机器时手动指定 DSH」\nlet engineOverrides = {}\nfunction setEngineOverrides(o) {\n  engineOverrides = (o && typeof o === 'object') ? o : {}\n  if (engineOverrides.dshCmd) log('engine', '用户指定 dsh 命令：' + engineOverrides.dshCmd)\n  if (engineOverrides.dshHome) log('engine', '用户指定 DSH_HOME：' + engineOverrides.dshHome)\n}"
if (!s.includes('let engineOverrides')) s = s.replace(needle1, rep1)

// 2) startEngine 里 dshCmd 来源优先用用户覆盖
const oldCmd = "  const ec = cfg.engine || {}\n  const dshCmd = ec.cmd || process.env.DSH_CMD || 'dsh'"
const newCmd = "  const ec = cfg.engine || {}\n  const dshCmd = (engineOverrides && engineOverrides.dshCmd) || ec.cmd || process.env.DSH_CMD || 'dsh'"
if (s.includes(oldCmd)) s = s.replace(oldCmd, newCmd)

// 3) home 处理：用户覆盖进入 else-if 分支（shared 逻辑）。把 home 变量先取 override
const oldHome = "  if (ec.home === false) delete env.DSH_HOME"
const newHome = "  if ((engineOverrides && engineOverrides.dshHome)) { env.DSH_HOME = engineOverrides.dshHome; log('engine','DSH_HOME(用户)= '+env.DSH_HOME) }\n  else if (ec.home === false) delete env.DSH_HOME"
if (s.includes(oldHome)) s = s.replace(oldHome, newHome)

// 4) app:start 读第二个参数 override
const oldStart = "ipcMain.handle('app:start', async (_e, scenarioId) => {"
const newStart = "ipcMain.handle('app:start', async (_e, scenarioId, overrides) => {\n  if (overrides) setEngineOverrides(overrides)"
if (s.includes(oldStart)) s = s.replace(oldStart, newStart)

// 5) 新增 IPC 让渲染层提前保存设置
const mark = "ipcMain.handle('app:engine-url', () => engineUrl)"
const addIpc = "ipcMain.handle('app:set-engine-opts', (_e, o) => { setEngineOverrides(o); return { ok: true } })\n" + mark
if (s.includes(mark) && !s.includes("app:set-engine-opts")) s = s.replace(mark, addIpc)

fs.writeFileSync(p, s, 'utf8')
console.log('main.js 引擎覆盖已加')