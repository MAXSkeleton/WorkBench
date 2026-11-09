const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
if (s.includes('--rcprobe')) { console.log('已存在'); process.exit(0) }
const anchor = "async function rcClickMenuTest(win, log) {"
const add = `async function rcProbe(win, log) {
  const out = await win.webContents.executeJavaScript("(function(){" +
    "const bar=document.getElementById('taskbar');" +
    "const els=[...document.querySelectorAll('#taskbar .lbar-item')];" +
    "const rects=els.map(e=>{var r=e.getBoundingClientRect();return {t:(e.textContent||'').trim().slice(0,10),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}});" +
    "var m=document.querySelector('.lbar-menu');var mr=m?m.getBoundingClientRect():null;" +
    "return {barVisible:bar?(bar.style.display||getComputedStyle(bar).display):'no', items:rects, menuOpen:!!m, menuRect:mr?{x:Math.round(mr.left),y:Math.round(mr.top),w:Math.round(mr.width),h:Math.round(mr.height)}:null," +
    "bodyZ:getComputedStyle(document.body).zIndex, bodyBg:getComputedStyle(document.body).backgroundColor};" +
    "})()")
  log('rcprobe', JSON.stringify(out))
}

`
s = s.replace(anchor, add + anchor)
s = s.includes("process.argv.includes('--rctest2')")
  ? s : s.replace("if (process.argv.includes('--rctest')) scheduleRcTest(win, log)",
      "if (process.argv.includes('--rctest')) scheduleRcTest(win, log)\n  if (process.argv.includes('--rctest2')) rcClickMenuTest(win, log).catch((e) => log('rctest', 'ERR ' + e.message))\n  if (process.argv.includes('--rcprobe')) rcProbe(win, log).catch((e) => log('rcprobe', 'ERR ' + e.message))")
fs.writeFileSync(p, s, 'utf8')
console.log('ok')