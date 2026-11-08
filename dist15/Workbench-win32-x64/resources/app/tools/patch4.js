'use strict'
/* 第四轮：预设改横排按钮 / 修下拉被裁 / 监控文字下移 / 预览器缩放平移 */
const fs = require('node:fs')
const P = 'E:/Work/workbench/'
const log = (...a) => console.log('[patch4]', ...a)

/* ---------- 1. renderer.js：预设不再是下拉，改成横排按钮 ---------- */
let r = fs.readFileSync(P + 'renderer/renderer.js', 'utf8')
const pStart = r.indexOf("  const pw = document.createElement('div')")
const pEnd = r.indexOf('  left.appendChild(pw)', pStart)
if (pStart > 0 && pEnd > pStart) {
  const chips = `  const presetBox = document.createElement('div')
  presetBox.className = 'tb-presets'
  allPresets().forEach((p) => {
    const chip = document.createElement('button')
    chip.className = 'tb-btn tb-preset' + (p.name === currentPresetName() ? ' on' : '')
    chip.textContent = p.name
    chip.title = '切换到预设：' + p.name
    chip.addEventListener('click', () => {
      applyPreset(p)
      toast('已切到预设：' + p.name)
    })
    presetBox.appendChild(chip)
  })
  left.appendChild(presetBox)
`
  r = r.slice(0, pStart) + chips + r.slice(pEnd + '  left.appendChild(pw)\n'.length)
  log('预设改成横排按钮')
}

/* 窗口下拉的开关改用 pointerdown + 全局只注册一次关闭器 */
if (!r.includes('__wtMenuCloser')) {
  r = r.replace(`  wbtn.addEventListener('click', (ev) => {
    ev.stopPropagation()
    wmenu.hidden = !wmenu.hidden
  })
  document.addEventListener('click', () => { if (wmenu) wmenu.hidden = true })`,
`  wbtn.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    ev.preventDefault()
    wmenu.hidden = !wmenu.hidden
  })
  if (!window.__wtMenuCloser) {
    window.__wtMenuCloser = true
    document.addEventListener('pointerdown', (ev) => {
      const t = ev.target
      if (t && t.closest && t.closest('.tb-menu-wrap')) return
      document.querySelectorAll('.tb-menu').forEach((m) => { m.hidden = true })
    })
  }`)
  log('窗口下拉开关已改 pointerdown')
}
fs.writeFileSync(P + 'renderer/renderer.js', r, 'utf8')

/* ---------- 2. renderers.js：预览器（输入框 + 滚轮缩放 + 中键平移） ---------- */
let R = fs.readFileSync(P + 'renderer/renderers.js', 'utf8')
const a = R.indexOf('window.RENDERERS.preview = function (body, panel, api) {')
const b = R.indexOf('/* ───────────── 电脑监控', a)
if (a > 0 && b > a) {
  const pv = `window.RENDERERS.preview = function (body, panel, api) {
  const wrap = el('div', 'pv')
  const bar = el('div', 'pv-bar')
  const pick = el('button', 'pv-btn', '选择文件…')
  const input = document.createElement('input')
  input.className = 'pv-input'
  input.placeholder = '或粘贴完整路径，回车打开'
  const openBtn = el('button', 'pv-btn', '打开')
  const zoomEl = el('span', 'pv-zoom', '')
  const pathEl = el('div', 'pv-path', '还没有选择文件')
  bar.appendChild(pick)
  bar.appendChild(input)
  bar.appendChild(openBtn)
  bar.appendChild(zoomEl)
  bar.appendChild(pathEl)

  const view = el('div', 'pv-view')
  view.appendChild(el('div', 'empty', '选一个图片 / 视频 / 文本，这里原地显示'))
  wrap.appendChild(bar)
  wrap.appendChild(view)
  body.innerHTML = ''
  body.appendChild(wrap)

  let kind = 'none'
  let zoom = 1
  let tx = 0
  let ty = 0

  function applyView() {
    const img = view.querySelector('.pv-img')
    if (img) {
      img.style.transformOrigin = '0 0'
      img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + zoom + ')'
    }
    const pre = view.querySelector('.pv-text')
    if (pre) pre.style.fontSize = (12 * zoom).toFixed(1) + 'px'
    zoomEl.textContent = kind === 'none' ? '' : Math.round(zoom * 100) + '%'
  }

  function resetView() {
    zoom = 1
    tx = 0
    ty = 0
    applyView()
  }

  function showMsg(text) {
    kind = 'none'
    view.innerHTML = ''
    view.appendChild(el('div', 'empty', text))
    resetView()
  }

  async function show(p) {
    if (!p) return
    pathEl.textContent = '读取中…'
    let res = null
    try {
      res = await api.preview(p)
    } catch (err) {
      showMsg('读取失败：' + (err && err.message))
      return
    }
    if (!res || !res.ok) {
      pathEl.textContent = p
      showMsg((res && res.error) || '读取失败')
      return
    }
    pathEl.textContent = res.path + '   ·   ' + res.name + '   ·   ' + pvSize(res.size)
    view.innerHTML = ''
    kind = res.kind
    if (res.kind === 'image') {
      const img = el('img', 'pv-img')
      img.src = res.dataUrl
      img.alt = res.name
      view.appendChild(img)
    } else if (res.kind === 'video') {
      const v = document.createElement('video')
      v.className = 'pv-video'
      v.src = res.url
      v.controls = true
      view.appendChild(v)
    } else if (res.kind === 'audio') {
      const av = document.createElement('audio')
      av.src = res.url
      av.controls = true
      av.className = 'pv-audio'
      view.appendChild(av)
    } else if (res.kind === 'text') {
      view.appendChild(el('pre', 'pv-text', res.text))
    } else {
      showMsg('这个类型只能显示文件信息：' + res.name + '（' + pvSize(res.size) + '）')
    }
    resetView()
  }

  window.__wtPreview = show

  pick.addEventListener('click', async () => {
    try {
      const p = await api.pickFile()
      if (p) show(p)
      else pathEl.textContent = pathEl.textContent === '还没有选择文件' ? '没有选中文件' : pathEl.textContent
    } catch (err) {
      showMsg('打开文件对话框失败：' + (err && err.message))
    }
  })

  const openPath = () => {
    const p = String(input.value || '').trim().replace(/^"|"$/g, '')
    if (p) show(p)
  }
  openBtn.addEventListener('click', openPath)
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openPath() })

  // 滚轮缩放（图片/文本）
  view.addEventListener('wheel', (ev) => {
    if (kind === 'none') return
    ev.preventDefault()
    const r2 = view.getBoundingClientRect()
    const mx = ev.clientX - r2.left
    const my = ev.clientY - r2.top
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12
    const next = Math.min(8, Math.max(0.2, zoom * factor))
    tx = mx - (mx - tx) * (next / zoom)
    ty = my - (my - ty) * (next / zoom)
    zoom = next
    applyView()
  }, { passive: false })

  // 中键拖动平移
  view.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 1) return
    ev.preventDefault()
    const sx = ev.clientX
    const sy = ev.clientY
    const ox = tx
    const oy = ty
    view.classList.add('pv-pan')
    const move = (e) => {
      tx = ox + (e.clientX - sx)
      ty = oy + (e.clientY - sy)
      applyView()
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      view.classList.remove('pv-pan')
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  })

  // 双击复位
  view.addEventListener('dblclick', () => resetView())

  wrap.addEventListener('dragover', (ev) => {
    ev.preventDefault()
    wrap.classList.add('pv-drag')
  })
  wrap.addEventListener('dragleave', () => wrap.classList.remove('pv-drag'))
  wrap.addEventListener('drop', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    wrap.classList.remove('pv-drag')
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]
    if (!f) return
    const p = (api.pathForFile && api.pathForFile(f)) || f.path || ''
    if (p) show(p)
    else showMsg('拿不到这个文件的路径：' + f.name)
  })
}

`
  R = R.slice(0, a) + pv + R.slice(b)
  log('预览器已重写')
}
fs.writeFileSync(P + 'renderer/renderers.js', R, 'utf8')

/* ---------- 3. 样式 ---------- */
let C = fs.readFileSync(P + 'renderer/styles.css', 'utf8')
if (!C.includes('.tb-preset')) {
  C += `
/* ── 任务栏：下拉不再被裁 ── */
.tb-left { overflow: visible !important; }
.tb-menu-wrap { z-index: 70; }
.taskbar2 { position: relative; z-index: 60; }

/* ── 预设横排按钮 ── */
.tb-presets { display: inline-flex; align-items: center; gap: 6px; }
.tb-preset.on {
  border-color: rgba(79, 142, 247, .85);
  box-shadow: inset 0 0 0 1px rgba(79, 142, 247, .35);
}

/* ── 监控：文字放到环下面 ── */
.mon-ring { display: flex; flex-direction: column; align-items: center; width: 104px; }
.ring-svg { width: 88px; height: 88px; }
.ring-cap { order: 2; margin-top: 6px; font-size: 11px; opacity: .55; }
.ring-num { order: 3; margin-top: 2px; font-size: 15px; font-weight: 600; }
.ring-num, .ring-cap { position: static; inset: auto; display: block; }

/* ── 预览器：输入框 / 缩放 / 平移 ── */
.pv-input {
  flex: 0 1 260px; min-width: 120px; height: 24px;
  padding: 0 8px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, .14);
  background: rgba(0, 0, 0, .22); color: inherit; font-size: 12px; outline: none;
}
.pv-input:focus { border-color: rgba(79, 142, 247, .7); }
.pv-zoom { font-size: 11px; opacity: .6; margin-left: 4px; min-width: 34px; }
.pv-view { position: relative; overflow: hidden; }
.pv-view .pv-img { will-change: transform; user-select: none; }
.pv-view .pv-text { transform-origin: 0 0; }
.pv-view.pv-pan { cursor: grabbing; }
`
  fs.writeFileSync(P + 'renderer/styles.css', C, 'utf8')
  log('样式已补')
}
log('done')
