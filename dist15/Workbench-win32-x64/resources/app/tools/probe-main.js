// 探针：确认 electron GUI 模式能不能走完启动关键节点，每一步都落盘
const fs = require('fs')
const path = require('path')
const LOG = path.join(__dirname, '..', 'logs', 'probe.log')
try { fs.mkdirSync(path.dirname(LOG), { recursive: true }) } catch {}
fs.writeFileSync(LOG, '')
function w(msg) {
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}
w('start execPath=' + process.execPath)
w('RUN_AS_NODE=' + process.env.ELECTRON_RUN_AS_NODE)
w('argv=' + JSON.stringify(process.argv))
process.on('uncaughtException', (e) => { w('uncaughtException ' + (e && e.stack)) })
process.on('exit', (c) => { w('exit code=' + c) })

let electron
try {
  electron = require('electron')
  w('require(electron) type=' + typeof electron + ' keys=' + JSON.stringify(Object.keys(electron || {}).slice(0, 10)))
} catch (e) {
  w('require(electron) threw ' + e.message)
  process.exit(2)
}
const { app, BrowserWindow } = electron
if (!app || typeof app.whenReady !== 'function') { w('app 不可用，退出'); process.exit(3) }

app.whenReady().then(() => {
  w('app ready')
  const win = new BrowserWindow({ width: 600, height: 400, show: true })
  win.loadURL('data:text/html,<h1>probe ok</h1>')
  win.webContents.on('did-finish-load', () => w('did-finish-load'))
  setTimeout(() => { w('still alive at 5s'); app.quit() }, 5000)
}).catch((e) => w('whenReady rejected ' + e.message))
