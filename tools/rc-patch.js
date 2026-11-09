const fs = require('node:fs')
const path = require('node:path')
const p = 'E:/Work/workbench/main.js'
let s = fs.readFileSync(p, 'utf8')
if (!s.includes('scheduleRcTest')) {
  const body = [
    'function scheduleRcTest(win) {',
    '  setTimeout(async () => {',
    '    try {',
    '      const y = 18',
    '      for (const x of [200, 320]) {',
    '        win.webContents.sendInputEvent({ type: "mouseMove", x, y })',
    '        win.webContents.sendInputEvent({ type: "mouseDown", button: "right", x, y, clickCount: 1 })',
    '        win.webContents.sendInputEvent({ type: "mouseUp", button: "right", x, y, clickCount: 1 })',
    '        await new Promise((r) => setTimeout(r, 400))',
    '      }',
    '      await new Promise((r) => setTimeout(r, 800))',
    '      const expr = [',
    '        "(function(){",',
    '        "  const m = document.querySelector(\'.lbar-menu\');",',
    '        "  const b = document.getElementById(\'taskbar\');",',
    '        "  const r = b.getBoundingClientRect();",',
    '        "  const hitEl = document.elementFromPoint(320, 18);",',
    '        "  return { menu: !!m, items: m ? [...m.children].map(e => e.textContent) : [],",',
    '        "    ctx: window.__wtCtx || null,",',
    '        "    bar: { x: r.x, y: r.y, w: r.width, h: r.height, hidden: b.hidden },",',
    '        "    hit: hitEl ? (hitEl.className || hitEl.tagName) : null };",',
    '        "})()"',
    '      ].join("\\n")',
    '      const out = await win.webContents.executeJavaScript(expr)',
    '      fs.writeFileSync(path.join(LOG_DIR, "rctest.json"), JSON.stringify(out, null, 2), "utf8")',
    '      log("rctest", JSON.stringify(out))',
    '    } catch (e) {',
    '      log("rctest", "ERR " + e.message)',
    '    }',
    '  }, 22000)',
    '}',
    '',
    'function scheduleDiag('
  ].join('\n')
  s = s.replace('function scheduleDiag(', body)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已插入 scheduleRcTest')
}
const hasCall = /scheduleRcTest\(win\)/.test(s)
console.log('调用点存在:', hasCall)