const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
if (s.includes('async function rcClickMenuTest')) { console.log('已存在'); process.exit(0) }
const anchor = "function scheduleRcTest(win) {"
const add = `async function rcClickMenuTest(win, log) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 60; i += 1) {
    const hidden = await win.webContents.executeJavaScript("!!document.getElementById('boot') && document.getElementById('boot').hidden")
    if (hidden) break
    await sleep(1000)
  }
  await sleep(800)
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 143, y: 57 })
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 143, y: 57, button: 'right', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 143, y: 57, button: 'right', clickCount: 1 })
  await sleep: 0
  await sleep(500)
  const info = await win.webContents.executeJavaScript("(function(){var it=document.querySelector('.lbar-menu-item');var r=it?it.getBoundingClientRect():null;return {count:document.querySelectorAll('.lbar-menu-item').length,label:it?it.textContent:null,x:r?Math.round(r.left+r.width/2):0,y:r?Math.round(r.top+r.height/2):0}})()")
  log('rctest', 'menu ' + JSON.stringify(info))
  if (info.count > 0) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: info.x, y: info.y })
    await sleep(120)
    win.webContents.sendInputEvent({ type: 'mouseDown', x: info.x, y: info.y, button: 'left', clickCount: 1 })
    await sleep(60)
    win.webContents.sendInputEvent({ type: 'mouseUp', x: info.x, y: info.y, button: 'left', clickCount: 1 })
    await sleep(700)
  }
  const after = await win.webContents.executeJavaScript("(function(){return {pop:!!document.querySelector('.lbar-pop'), menu:document.querySelectorAll('.lbar-menu').length}})()")
  log('rctest', 'after ' + JSON.stringify(after))
  try { fs.writeFileSync(path.join(LOG_DIR, 'rc-menu.json'), JSON.stringify({ info, after }), 'utf8') } catch (err) {}
}

`
s = s.replace(anchor, add + anchor)
s = s.replace("function scheduleRcTest(win) {", "function scheduleRcTest(win, log) {")
fs.writeFileSync(p, s, 'utf8')
console.log('已插入 rcClickMenuTest')