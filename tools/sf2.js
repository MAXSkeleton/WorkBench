const fs = require('node:fs')
const p = 'E:/Work/workbench/renderer/renderer.js'
let s = fs.readFileSync(p, 'utf8')
const SETTINGS_KEY = `const SETTINGS_KEY = 'workbench.settings.v1'`
if (!s.includes(SETTINGS_KEY)) {
  const anchor = `function buildWindowBar(sc) {`
  const block = `
${SETTINGS_KEY}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return (v && typeof v === 'object') ? v : null
  } catch (err) { return null }
}

function saveSettings(o) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o || {})) } catch (err) {}
}

function engineOverrides() {
  const s2 = loadSettings() || {}
  const out = {}
  if (s2.dshCmd) out.dshCmd = s2.dshCmd
  if (s2.dshHome) out.dshHome = s2.dshHome
  return out
}

function openSettings(sc) {
  const ov = loadSettings() || {}
  const pop = document.createElement('div')
  pop.className = 'set-pop'
  const box = document.createElement('div')
  box.className = 'set-pop-box'
  const H = (t) => { const x = document.createElement('b'); x.textContent = t; box.appendChild(x) }
  const field = (label, key, ph, rows) => {
    const lab = document.createElement('label'); lab.textContent = label
    const inp = document.createElement('input')
    inp.className = 'set-inp'
    inp.value = ov[key] || ''
    inp.placeholder = ph || ''
    inp.dataset.key = key
    lab.appendChild(inp)
    box.appendChild(lab)
    return inp
  }
  H('连接 DSH（换用户/换机器时改这里）')
  const cmdInp = field('DSH 命令或可执行文件路径', 'dshCmd', '例如 dsh 或 D:\\\\DeepSeek\\\\resources\\\\runtime\\\\cli\\\\bin\\\\dsh.cmd')
  const homeInp = field('DSH_HOME 目录（会话数据所在）', 'dshHome', '例如 C:\\\\Users\\\\你\\\\.dsh', 2)
  const note = document.createElement('p')
  note.className = 'set-note'
  note.textContent = '路径留空则用场景默认。DSH_HOME 指到你已装的 .dsh 目录，就能看到你本来的对话。'
  box.appendChild(note)
  const btns = document.createElement('div')
  btns.className = 'set-btns'
  const ok = document.createElement('button'); ok.className = 'tb-btn'; ok.textContent = '保存并重启引擎'
  const close = document.createElement('button'); close.className = 'tb-btn'; close.textContent = '取消'
  btns.appendChild(ok); btns.appendChild(close); box.appendChild(btns)
  const rm = () => { pop.remove(); document.removeEventListener('keydown', esc) }
  const esc = (ev) => { if (ev.key === 'Escape') rm() }
  close.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); rm() })
  ok.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    const dshCmd = String(cmdInp.value || '').trim()
    const dshHome = String(homeInp.value || '').trim()
    const next = {}
    if (dshCmd) next.dshCmd = dshCmd
    if (dshHome) next.dshHome = dshHome
    saveSettings(next)
    if (window.app.setEngineOpts) window.app.setEngineOpts(next).then(() => {
      setBootOnly(null)
    })
    rm()
    toast(dshCmd ? '已保存 DSH 位置：' + dshCmd : '已清空自定义 DSH，用场景默认')
    // 提示重启生效
    setTimeout(() => { if (!state.started) window.location.reload() }, 600)
  })
  pop.addEventListener('pointerdown', (ev) => { if (ev.target === pop) rm() })
  pop.appendChild(box)
  document.body.appendChild(pop)
}

function setBootOnly() {}

${anchor}`
  s = s.replace(anchor, block)
  fs.writeFileSync(p, s, 'utf8')
  console.log('openSettings 已插入')
} else console.log('已存在，跳过')