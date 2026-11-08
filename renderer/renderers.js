'use strict'
/**
 * 面板渲染器注册表。
 * 约定：RENDERERS[type](bodyEl, panel, api) —— 只返回 DOM，不碰全局状态。
 * 新增一种面板 = 在这里加一个函数 + 在场景 json 里写 type。
 */
window.RENDERERS = {}

function el(tag, cls, text) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

function emptyState(body, title, desc, buttons) {
  body.innerHTML = ''
  const wrap = el('div', 'empty')
  wrap.appendChild(el('strong', null, title))
  if (desc) wrap.appendChild(el('div', null, desc))
  ;(buttons || []).forEach((b) => {
    const btn = el('button', null, b.label)
    btn.addEventListener('click', b.onClick)
    wrap.appendChild(btn)
  })
  body.appendChild(wrap)
}

/* ─────────────── web：通用 webview（DSH / 任意站点） ─────────────── */

window.RENDERERS.web = function (body, panel, api) {
  const src = panel.url || (panel.embed === 'engine' ? api.engineUrl() : '')
  if (!src) {
    emptyState(body, '等待地址', panel.embed === 'engine' ? '引擎就绪后会自动载入' : '场景里没有配置 url')
    return
  }
  const view = document.createElement('webview')
  view.setAttribute('src', src)
  view.setAttribute('partition', 'persist:' + panel.id)
  view.setAttribute('allowpopups', 'true')
  body.appendChild(view)

  view.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return // 主动 abort，忽略
    api.setDot('err')
    emptyState(body, '页面加载失败', e.errorDescription || ('code ' + e.errorCode), [
      { label: '重试', onClick: () => api.reload(view) },
      { label: '在浏览器打开', onClick: () => window.app.openExternal(src) },
    ])
  })
  view.addEventListener('did-finish-load', () => api.setDot('ok'))
  api.reload = () => { body.innerHTML = ''; window.RENDERERS.web(body, panel, api) }
}

/* ─────────────── vscode：三种来源，逐级降级 ─────────────── */

window.RENDERERS.vscode = function (body, panel, api) {
  const st = api.vscodeStatus()
  if (st && st.status === 'ready' && st.url) {
    return window.RENDERERS.web(body, { ...panel, url: st.url }, api)
  }
  const reason = st && st.error ? st.error : 'serve-web 尚未就绪'
  emptyState(body, 'VSCode 面板待接入', reason, [
    {
      label: '用桌面版 VSCode 打开',
      onClick: () => window.app.launch('vscode-desktop', panel.scenarioId),
    },
    {
      label: '在浏览器打开（若已有服务）',
      onClick: () => window.app.openExternal(panel.fallbackUrl || 'http://127.0.0.1:8899'),
    },
  ])
  api.setDot('warn')
}

/* ─────────────── file：目录树 + 预览 ─────────────── */

window.RENDERERS.file = function (body, panel, api) {
  const wrap = el('div', 'file-split')
  const tree = el('div', 'file-tree')
  const preview = el('div', 'file-preview')
  wrap.appendChild(tree)
  wrap.appendChild(preview)
  body.appendChild(wrap)

  const root = panel.root || '.'
  let current = root

  async function openDir(dir) {
    const res = await window.app.fsList(dir)
    tree.innerHTML = ''
    if (!res.ok) {
      tree.appendChild(el('div', 'row', '读不到目录：' + res.error))
      return
    }
    current = res.path
    if (panel.showUp !== false && res.path !== root) {
      const up = el('div', 'row dir')
      up.appendChild(el('span', 'ico', '↑'))
      up.appendChild(el('span', null, '..'))
      up.addEventListener('click', () => openDir(current.replace(/[\\/][^\\/]+$/, '')))
      tree.appendChild(up)
    }
    res.entries.forEach((e) => {
      const row = el('div', 'row' + (e.isDir ? ' dir' : ''))
      row.appendChild(el('span', 'ico', e.isDir ? '📁' : '📄'))
      row.appendChild(el('span', null, e.name))
      row.title = e.path
      row.addEventListener('click', () => (e.isDir ? openDir(e.path) : openFile(e.path)))
      tree.appendChild(row)
    })
  }

  async function openFile(p) {
    const res = await window.app.fsRead(p)
    preview.innerHTML = ''
    if (!res.ok) { preview.appendChild(el('div', 'empty', '读不到：' + res.error)); return }
    if (res.kind === 'image') {
      const img = document.createElement('img')
      img.src = 'data:' + res.mime + ';base64,' + res.data
      preview.appendChild(img)
      return
    }
    const pre = el('pre', null, res.text)
    preview.appendChild(pre)
  }

  openDir(root)
}

/* ─────────────── launch：本地 app 启动器 ─────────────── */

window.RENDERERS.launch = function (body, panel, api) {
  const list = api.launchers()
  if (!list.length) { emptyState(body, '没有配置启动项', '在 scenarios/*.json 的 launchers 里加'); return }
  const grid = el('div', 'launcher')
  list.forEach((item) => {
    const btn = document.createElement('button')
    btn.appendChild(el('b', null, item.label))
    if (item.note) btn.appendChild(el('span', null, item.note))
    btn.addEventListener('click', async () => {
      const r = await window.app.launch(item.key, panel.scenarioId)
      if (!r.ok) api.setDot('err')
    })
    grid.appendChild(btn)
  })
  body.appendChild(grid)
}

/* ─────────────── term：终端（第一版占位） ─────────────── */

window.RENDERERS.term = function (body, panel, api) {
  emptyState(body, '终端面板 · 待实现', '需要 node-pty + xterm.js（第二版接入）', [
    { label: '先记住这个位置', onClick: () => api.setDot('warn') },
  ])
  api.setDot('warn')
}

/* ─────────────── view：单文件预览（可被 file 派发） ─────────────── */

window.RENDERERS.view = function (body, panel, api) {
  emptyState(body, '预览区', '从左侧文件面板点一个文件')
}
