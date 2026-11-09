const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
const marker = "      const out = await win.webContents.executeJavaScript(expr)"
if (!s.includes('rctest.png')) {
  const add = [
    marker,
    '      const img = await win.webContents.capturePage()',
    '      fs.writeFileSync(path.join(LOG_DIR, "rctest.png"), img.toPNG())',
    '      const box = await win.webContents.executeJavaScript("(function(){var m=document.querySelector(\'.lbar-menu\');if(!m)return null;var r=m.getBoundingClientRect();var cs=getComputedStyle(m);return {x:r.x,y:r.y,w:r.width,h:r.height,z:cs.zIndex,op:cs.opacity,disp:cs.display,vis:cs.visibility,top:(function(){var e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e?(e.className||e.tagName):null})()}})()")',
    '      out.menuBox = box'
  ].join('\n')
  s = s.replace(marker, add)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已加截图与菜单盒子信息')
}