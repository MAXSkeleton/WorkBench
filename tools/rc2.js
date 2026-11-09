const fs = require('node:fs')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
const start = s.indexOf('function scheduleRcTest(win) {')
const end = s.indexOf('function scheduleDiag(', start)
if (start < 0 || end < 0) throw new Error('定位失败')
const body = [
  'function scheduleRcTest(win) {',
  '  setTimeout(async () => {',
  '    try {',
  '      let waited = 0',
  '      while (waited < 120000) {',
  '        const hidden = await win.webContents.executeJavaScript("document.getElementById(\'boot\').hidden")',
  '        if (hidden) break',
  '        await new Promise((r) => setTimeout(r, 1000))',
  '        waited += 1000',
  '      }',
  '      const y = 18',
  '      for (const x of [200, 320]) {',
  '        win.webContents.sendInputEvent({ type: "mouseMove", x, y })',
  '        win.webContents.sendInputEvent({ type: "mouseDown", button: "right", x, y, clickCount: 1 })',
  '        win.webContents.sendInputEvent({ type: "mouseUp", button: "right", x, y, clickCount: 1 })',
  '        await new Promise((r) => setTimeout(r, 500))',
  '      }',
  '      await new Promise((r) => setTimeout(r, 800))',
  '      const expr = [',
  '        "(function(){",',
  '        "  var m = document.querySelector(\'.lbar-menu\');",',
  '        "  var hitEl = document.elementFromPoint(320, 18);",',
  '        "  var boot = document.getElementById(\'boot\');",',
  '        "  return { menu: !!m, items: m ? [].slice.call(m.children).map(function(e){return e.textContent}) : [],",',
  '        "    ctx: window.__wtCtx || null, bootHidden: boot.hidden,",',
  '        "    hit: hitEl ? (hitEl.className || hitEl.tagName) : null };",',
  '        "})()"',
  '      ].join("\\n")',
  '      const out = await win.webContents.executeJavaScript(expr)',
  '      out.bootWaitMs = waited',
  '      fs.writeFileSync(path.join(LOG_DIR, "rctest.json"), JSON.stringify(out, null, 2), "utf8")',
  '    } catch (e) {',
  '      log("rctest", "ERR " + e.message)',
  '    }',
  '  }, 6000)',
  '}',
  '',
  ''
].join('\n')
s = s.slice(0, start) + body + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('rctest 已改为等 boot 隐藏后再点')