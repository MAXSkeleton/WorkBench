'use strict'
/* 第三轮：任务栏「窗口」下拉 + 监控改环形 */
const fs = require('node:fs')
const P = 'E:/Work/workbench/'
const log = (...a) => console.log('[patch3]', ...a)

/* ---------- 1. 任务栏：加「窗口 ▾」下拉 ---------- */
let r = fs.readFileSync(P + 'renderer/renderer.js', 'utf8')
const anchor = `  plain('外观', () => toast('外观面板还空着，接口已留好，后面接工程'), '占位：外观')`
if (!r.includes("textContent = '窗口 ▾'")) {
  const insert = `${anchor}

  // 窗口下拉：往界面右侧加一个窗口
  const ww = document.createElement('div')
  ww.className = 'tb-menu-wrap'
  const wbtn = document.createElement('button')
  wbtn.className = 'tb-btn tb-menu-btn'
  wbtn.textContent = '窗口 ▾'
  wbtn.title = '添加窗口'
  const wmenu = document.createElement('div')
  wmenu.className = 'tb-menu'
  wmenu.hidden = true
  const pool = (sc && sc.windows && sc.windows.length) ? sc.windows : [
    { type: 'monitor', title: '电脑监控' },
    { type: 'preview', title: '文件预览器' },
    { type: 'file', title: '文件浏览器' },
    { type: 'note', title: '笔记' },
    { type: 'web', title: 'DSH' },
    { type: 'vscode', title: 'VSCode' },
  ]
  pool.forEach((w) => {
    const it = document.createElement('button')
    it.className = 'tb-menu-item'
    it.textContent = w.title || w.type
    it.addEventListener('click', (ev) => {
      ev.stopPropagation()
      wmenu.hidden = true
      addWindow(w.type)
      toast('已加到界面右侧：' + (w.title || w.type))
    })
    wmenu.appendChild(it)
  })
  wbtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    wmenu.hidden = !wmenu.hidden
  })
  document.addEventListener('click', () => { if (wmenu) wmenu.hidden = true })
  ww.appendChild(wbtn)
  ww.appendChild(wmenu)
  left.appendChild(ww)`
  r = r.replace(anchor, insert)
  fs.writeFileSync(P + 'renderer/renderer.js', r, 'utf8')
  log('任务栏已加「窗口 ▾」')
} else log('任务栏已有窗口下拉')

/* ---------- 2. 监控面板：CPU / GPU 环形 ---------- */
let R = fs.readFileSync(P + 'renderer/renderers.js', 'utf8')
const mStart = R.indexOf('window.RENDERERS.monitor = function (body, panel, api) {')
if (mStart >= 0) {
  const tail = `window.RENDERERS.monitor = function (body, panel, api) {
  const wrap = el('div', 'mon')

  function ring(label) {
    const box = el('div', 'mon-ring')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 36 36')
    svg.setAttribute('class', 'ring-svg')
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    bg.setAttribute('cx', '18')
    bg.setAttribute('cy', '18')
    bg.setAttribute('r', '15.5')
    bg.setAttribute('class', 'ring-bg')
    const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    fg.setAttribute('cx', '18')
    fg.setAttribute('cy', '18')
    fg.setAttribute('r', '15.5')
    fg.setAttribute('pathLength', '100')
    fg.setAttribute('stroke-dasharray', '0 100')
    fg.setAttribute('class', 'ring-fg')
    svg.appendChild(bg)
    svg.appendChild(fg)
    const num = el('b', 'ring-num', '—')
    const cap = el('span', 'ring-cap', label)
    box.appendChild(svg)
    box.appendChild(num)
    box.appendChild(cap)
    return { box: box, fg: fg, num: num, cap: cap }
  }

  const rings = el('div', 'mon-rings')
  const cpu = ring('CPU')
  const gpu = ring('GPU')
  rings.appendChild(cpu.box)
  rings.appendChild(gpu.box)
  wrap.appendChild(rings)

  const memBox = el('div', 'mon-mem')
  const memTop = el('div', 'mon-mem-top')
  const memLabel = el('span', 'mon-label', '内存')
  const memVal = el('span', 'mon-val', '—')
  memTop.appendChild(memLabel)
  memTop.appendChild(memVal)
  const memBar = el('div', 'mon-bar')
  const memFill = document.createElement('i')
  memBar.appendChild(memFill)
  memBox.appendChild(memTop)
  memBox.appendChild(memBar)
  wrap.appendChild(memBox)

  const sub = el('div', 'mon-sub', '采样中…')
  wrap.appendChild(sub)

  body.innerHTML = ''
  body.appendChild(wrap)

  function setRing(item, pct, text) {
    const p = Math.max(0, Math.min(100, pct || 0))
    item.fg.setAttribute('stroke-dasharray', p.toFixed(1) + ' 100')
    item.fg.dataset.level = p > 85 ? 'hot' : p > 60 ? 'warm' : 'cool'
    item.num.textContent = text
  }

  let alive = true
  let timer = null
  async function tick() {
    if (!alive) return
    const s = await api.sysStats()
    if (!alive) return
    if (!s || !s.ok) {
      sub.textContent = '读取失败：' + ((s && s.error) || '未知错误')
    } else {
      setRing(cpu, s.cpu, (s.cpu != null ? s.cpu : '—') + '%')
      const usedGb = s.mem.used / 1024 / 1024 / 1024
      const totalGb = s.mem.total / 1024 / 1024 / 1024
      const mp = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0
      memFill.style.width = Math.max(0, Math.min(100, mp)) + '%'
      memFill.dataset.level = mp > 85 ? 'hot' : mp > 60 ? 'warm' : 'cool'
      memVal.textContent = usedGb.toFixed(1) + ' / ' + totalGb.toFixed(1) + ' GB'
      if (s.gpu) {
        setRing(gpu, s.gpu.util, s.gpu.util + '%')
        sub.textContent = (s.gpu.name || 'GPU') + ' · 显存 ' + s.gpu.usedMB + ' / ' + s.gpu.totalMB + ' MB · 每 2 秒刷新'
      } else {
        setRing(gpu, 0, '—')
        sub.textContent = '没检测到 nvidia-smi，GPU 环为空 · 每 2 秒刷新'
      }
    }
    timer = setTimeout(tick, 2000)
  }
  tick()

  return function cleanup() {
    alive = false
    clearTimeout(timer)
  }
}
`
  R = R.slice(0, mStart) + tail
  fs.writeFileSync(P + 'renderer/renderers.js', R, 'utf8')
  log('监控面板改为环形')
} else log('未找到 monitor 渲染器')

/* ---------- 3. 样式 ---------- */
let C = fs.readFileSync(P + 'renderer/styles.css', 'utf8')
if (!C.includes('.mon-ring')) {
  C += `
/* ── 监控：环形 ── */
.mon-rings { display: flex; gap: 18px; padding: 14px 16px 6px; }
.mon-ring { position: relative; width: 104px; height: 104px; }
.ring-svg { width: 104px; height: 104px; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: rgba(255, 255, 255, .09); stroke-width: 3.4; }
.ring-fg {
  fill: none; stroke: #4f8ef7; stroke-width: 3.4; stroke-linecap: round;
  transition: stroke-dasharray .35s ease, stroke .3s ease;
}
.ring-fg[data-level="warm"] { stroke: #f0b429; }
.ring-fg[data-level="hot"] { stroke: #f4506a; }
.ring-num {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 600; letter-spacing: .5px;
}
.ring-cap {
  position: absolute; left: 0; right: 0; bottom: -4px;
  text-align: center; font-size: 11px; opacity: .55;
}
.mon-mem { padding: 10px 16px 0; }
.mon-mem-top { display: flex; justify-content: space-between; font-size: 12px; opacity: .8; margin-bottom: 5px; }
.mon-bar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, .09); overflow: hidden; }
.mon-bar i { display: block; height: 100%; width: 0; border-radius: 3px; background: #4f8ef7; transition: width .35s ease, background .3s ease; }
.mon-bar i[data-level="warm"] { background: #f0b429; }
.mon-bar i[data-level="hot"] { background: #f4506a; }
`
  fs.writeFileSync(P + 'renderer/styles.css', C, 'utf8')
  log('环形样式已加')
}
log('done')
