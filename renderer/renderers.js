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

  // did-fail-load-retry：服务还没起来时自动重试几次
  let tries = 0
  view.addEventListener('did-fail-load', (e) => {
    if (tries < 12) {
      tries += 1
      setTimeout(() => { try { view.reload() } catch (err) {} }, 2500)
    }
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

/* ─────────────── file：整台电脑（驱动器 + 任意目录）+ 预览 ─────────────── */

// 资源管理器式文件面板：左侧目录树（可展开） + 右侧详细列表（名称/修改日期/类型/大小）
window.RENDERERS.file = function (body, panel, api) {
  const wrap = document.createElement('div')
  wrap.className = 'fb'

  const treeEl = document.createElement('div')
  treeEl.className = 'fb-tree'

  const rightEl = document.createElement('div')
  rightEl.className = 'fb-right'

  const barEl = document.createElement('div')
  barEl.className = 'fb-bar'
  const upBtn = document.createElement('button')
  upBtn.className = 'fb-up'
  upBtn.textContent = '↑'
  upBtn.title = '上一级'
  const treeBtn = document.createElement('button')
  treeBtn.className = 'fb-up fb-toggle'
  treeBtn.textContent = '☰'
  treeBtn.title = '显示/隐藏目录树'
  const crumbEl = document.createElement('div')
  crumbEl.className = 'fb-crumb'
  crumbEl.textContent = '此电脑'
  barEl.appendChild(treeBtn)
  barEl.appendChild(upBtn)
  barEl.appendChild(crumbEl)

  const headEl = document.createElement('div')
  headEl.className = 'fb-head'
  headEl.innerHTML = '<span class="c-name">名称</span><span class="c-date">修改日期</span><span class="c-type">类型</span><span class="c-size">大小</span>'

  const listEl = document.createElement('div')
  listEl.className = 'fb-body'

  rightEl.appendChild(barEl)
  rightEl.appendChild(headEl)
  rightEl.appendChild(listEl)

  const splitEl = document.createElement('div')
  splitEl.className = 'fb-split'

  wrap.appendChild(treeEl)
  wrap.appendChild(splitEl)
  wrap.appendChild(rightEl)

  let curDir = ''
  let selPath = ''

  function fmtDate(ms) {
    if (!ms) return ''
    const d = new Date(ms)
    const pad = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  function fmtSize(n, isDir) {
    if (isDir || typeof n !== 'number') return ''
    if (n < 1024) return n + ' 字节'
    const kb = Math.round(n / 1024)
    if (kb < 1024) return kb.toLocaleString('en-US') + ' KB'
    const mb = n / 1024 / 1024
    if (mb < 1024) return mb.toFixed(1) + ' MB'
    return (mb / 1024).toFixed(2) + ' GB'
  }

  const TYPE_MAP = {
    pak: 'PAK 文件', dll: '应用程序扩展', exe: '应用程序', md: 'Markdown 源文件',
    txt: '文本文档', json: 'JSON 文件', js: 'JavaScript 文件', ts: 'TypeScript 文件',
    py: 'Python 文件', html: 'HTML 文档', css: '样式表', png: 'PNG 图片', jpg: 'JPEG 图片',
    jpeg: 'JPEG 图片', gif: 'GIF 图片', svg: 'SVG 图片', mp4: 'MP4 视频', mp3: 'MP3 音频',
    zip: 'ZIP 压缩文件', rar: 'RAR 压缩文件', '7z': '7Z 压缩文件', pdf: 'PDF 文档',
    lnk: '快捷方式', bat: '批处理文件', cmd: '命令脚本', yml: 'YAML 文件', yaml: 'YAML 文件',
    toml: 'TOML 文件', ini: '配置设置', log: '日志文件', dat: 'DAT 文件', bin: 'BIN 文件',
    so: '应用程序扩展', msi: '安装程序'
  }

  function typeOf(name, isDir) {
    if (isDir) return '文件夹'
    const i = name.lastIndexOf('.')
    if (i < 0) return '文件'
    const ext = name.slice(i + 1).toLowerCase()
    return TYPE_MAP[ext] || ext.toUpperCase() + ' 文件'
  }

  function iconOf(name, isDir) {
    if (isDir) return '📁'
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].indexOf(ext) >= 0) return '🖼️'
    if (['mp4', 'mkv', 'mov', 'avi'].indexOf(ext) >= 0) return '🎬'
    if (['mp3', 'wav', 'flac'].indexOf(ext) >= 0) return '🎵'
    if (['zip', 'rar', '7z', 'gz', 'tar'].indexOf(ext) >= 0) return '🗜️'
    if (['md', 'txt', 'log'].indexOf(ext) >= 0) return '📄'
    if (['js', 'ts', 'py', 'json', 'html', 'css', 'yml', 'yaml', 'toml'].indexOf(ext) >= 0) return '📜'
    if (['exe', 'dll', 'msi', 'bat', 'cmd'].indexOf(ext) >= 0) return '⚙️'
    return '📄'
  }

  async function listDir(p) {
    const res = await api.fsList(p)
    if (!res || !res.ok) throw new Error((res && res.error) || '读取失败')
    return res
  }

  function markActive() {
    treeEl.querySelectorAll('.fb-node.on').forEach(function (el) { el.classList.remove('on') })
    const el = treeEl.querySelector('.fb-node[data-path="' + String(selPath || curDir).replace(/"/g, '\\"') + '"]')
    if (el) el.classList.add('on')
  }

  async function openDir(p, keepSel) {
    curDir = p
    crumbEl.textContent = p
    crumbEl.title = p
    upBtn.disabled = !p || /^[A-Za-z]:\\?$/.test(p)
    if (!keepSel) selPath = p
    let res
    try {
      res = await listDir(p)
    } catch (err) {
      listEl.innerHTML = ''
      const d = document.createElement('div')
      d.className = 'fb-empty'
      d.textContent = '无法打开：' + String(err.message || err)
      listEl.appendChild(d)
      return
    }
    renderList(res.entries || [])
    markActive()
  }

  function renderList(entries) {
    listEl.innerHTML = ''
    if (!entries.length) {
      const d = document.createElement('div')
      d.className = 'fb-empty'
      d.textContent = '（空文件夹）'
      listEl.appendChild(d)
      selPath = curDir
      return
    }
    const frag = document.createDocumentFragment()
    for (const it of entries) {
      const row = document.createElement('div')
      row.className = 'fb-row' + (it.hidden ? ' dim' : '')
      row.dataset.path = it.path
      row.dataset.dir = it.isDir ? '1' : '0'

      const cName = document.createElement('span')
      cName.className = 'c-name'
      const ic = document.createElement('i')
      ic.className = 'fb-ic'
      ic.textContent = iconOf(it.name, it.isDir)
      const nm = document.createElement('b')
      nm.textContent = it.name
      cName.appendChild(ic)
      cName.appendChild(nm)

      const cDate = document.createElement('span')
      cDate.className = 'c-date'
      cDate.textContent = fmtDate(it.mtimeMs)

      const cType = document.createElement('span')
      cType.className = 'c-type'
      cType.textContent = typeOf(it.name, it.isDir)

      const cSize = document.createElement('span')
      cSize.className = 'c-size'
      cSize.textContent = fmtSize(it.size, it.isDir)

      row.appendChild(cName)
      row.appendChild(cDate)
      row.appendChild(cType)
      row.appendChild(cSize)

      row.addEventListener('click', function () {
        listEl.querySelectorAll('.fb-row.on').forEach(function (el) { el.classList.remove('on') })
        row.classList.add('on')
        selPath = it.path
        if (it.isDir) {
          crumbEl.textContent = it.path
          crumbEl.title = it.path
        }
      })
      row.addEventListener('dblclick', function () {
        if (it.isDir) { openDir(it.path); return }
        window.dispatchEvent(new CustomEvent('wt:preview', { detail: { path: it.path } }))
      })
      frag.appendChild(row)
    }
    listEl.appendChild(frag)
    selPath = curDir
  }

  function makeNode(label, p, depth) {
    const box = document.createElement('div')
    box.className = 'fb-nbox'

    const node = document.createElement('div')
    node.className = 'fb-node'
    node.dataset.path = p
    node.style.paddingLeft = (6 + depth * 13) + 'px'

    const arrow = document.createElement('i')
    arrow.className = 'fb-arrow'
    arrow.textContent = '▸'
    const ic = document.createElement('i')
    ic.className = 'fb-ic'
    ic.textContent = '📁'
    const nm = document.createElement('b')
    nm.textContent = label

    node.appendChild(arrow)
    node.appendChild(ic)
    node.appendChild(nm)

    const kids = document.createElement('div')
    kids.className = 'fb-kids'
    kids.hidden = true

    let expanded = false
    let filled = false

    async function expand() {
      expanded = !expanded
      arrow.textContent = expanded ? '▾' : '▸'
      kids.hidden = !expanded
      if (expanded && !filled) {
        filled = true
        kids.textContent = '载入中…'
        try {
          const res = await listDir(p)
          kids.innerHTML = ''
          const dirs = (res.entries || []).filter(function (e) { return e.isDir })
          if (!dirs.length) {
            const d = document.createElement('div')
            d.className = 'fb-empty sm'
            d.textContent = '（没有子文件夹）'
            kids.appendChild(d)
          } else {
            for (const d of dirs) kids.appendChild(makeNode(d.name, d.path, depth + 1))
          }
        } catch (err) {
          kids.textContent = '无法读取'
        }
      }
    }

    arrow.addEventListener('click', function (ev) {
      ev.stopPropagation()
      expand()
    })

    node.addEventListener('click', function () {
      treeEl.querySelectorAll('.fb-node.on').forEach(function (el) { el.classList.remove('on') })
      node.classList.add('on')
      openDir(p)
      if (!expanded) expand()
    })

    box.appendChild(node)
    box.appendChild(kids)
    return box
  }

  async function buildTree() {
    treeEl.innerHTML = ''
    if (!api.fsRoots) return
    let res
    try {
      res = await api.fsRoots()
    } catch (err) {
      res = null
    }
    const items = (res && res.ok && res.items) || []
    const drives = items.filter(function (i) { return i.kind === 'drive' })
    const quicks = items.filter(function (i) { return i.kind !== 'drive' })

    const title = document.createElement('div')
    title.className = 'fb-tree-title'
    title.textContent = '此电脑'
    treeEl.appendChild(title)

    if (drives.length) {
      const g = document.createElement('div')
      g.className = 'fb-group'
      g.textContent = '驱动器'
      treeEl.appendChild(g)
      for (const d of drives) treeEl.appendChild(makeNode(d.name, d.path, 0))
    }
    if (quicks.length) {
      const g2 = document.createElement('div')
      g2.className = 'fb-group'
      g2.textContent = '常用位置'
      treeEl.appendChild(g2)
      for (const d of quicks) treeEl.appendChild(makeNode(d.name, d.path, 0))
    }
  }

  let userToggled = false
  function setTree(show) {
    treeEl.hidden = !show
    splitEl.hidden = !show
  }
  treeBtn.addEventListener('click', function () {
    userToggled = true
    setTree(treeEl.hidden)
  })
  setTree(true)
  try {
    new ResizeObserver(function () {
      if (userToggled) return
      setTree(wrap.clientWidth >= 360)
    }).observe(wrap)
  } catch (err) {}

  upBtn.addEventListener('click', function () {
    if (!curDir) return
    const trimmed = curDir.replace(/[\\/]+$/, '')
    const parent = trimmed.replace(/[\\/][^\\/]+$/, '')
    if (!parent) return
    if (/^[A-Za-z]:$/.test(parent)) openDir(parent + '\\')
    else openDir(parent)
  })

  let dragging = false
  splitEl.addEventListener('pointerdown', function (e) {
    dragging = true
    try { splitEl.setPointerCapture(e.pointerId) } catch (err) {}
  })
  splitEl.addEventListener('pointermove', function (e) {
    if (!dragging) return
    const r = wrap.getBoundingClientRect()
    const w = Math.max(140, Math.min(r.width - 220, e.clientX - r.left))
    treeEl.style.flex = '0 0 ' + Math.round(w) + 'px'
  })
  splitEl.addEventListener('pointerup', function (e) {
    dragging = false
    try { splitEl.releasePointerCapture(e.pointerId) } catch (err) {}
  })
  splitEl.addEventListener('dblclick', function () {
    treeEl.style.flex = '0 0 220px'
  })

  buildTree().catch(function (err) {
    listEl.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'fb-empty'
    d.textContent = '初始化失败：' + String((err && err.message) || err)
    listEl.appendChild(d)
    console.warn('fb init', err)
  }).then(function () {
    const start = panel.root && panel.root !== 'roots' ? panel.root : ''
    if (start) {
      openDir(start)
    } else {
      listEl.innerHTML = ''
      const d = document.createElement('div')
      d.className = 'fb-empty'
      d.textContent = '在左侧选择一个驱动器或文件夹'
      listEl.appendChild(d)
      crumbEl.textContent = '此电脑'
      upBtn.disabled = true
    }
  })

  body.innerHTML = ''
  body.appendChild(wrap)
}


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


/* ---------- note：仿 Obsidian 的三栏笔记（文件树 / 编辑 / 预览） ---------- */

function mdEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function mdToHtml(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false
  let list = null
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null } }
  for (const raw of lines) {
    const line = raw
    if (/^```/.test(line.trim())) {
      closeList()
      out.push(inCode ? '</code></pre>' : '<pre><code>')
      inCode = !inCode
      continue
    }
    if (inCode) { out.push(mdEscape(line)); continue }
    const inline = (t) => mdEscape(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    if (!line.trim()) { closeList(); out.push(''); continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { closeList(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); continue }
    if (/^\s*[-*+]\s+/.test(line)) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul' }
      out.push('<li>' + inline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>')
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol' }
      out.push('<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>')
      continue
    }
    if (/^>\s?/.test(line)) { closeList(); out.push('<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>'); continue }
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); continue }
    closeList()
    out.push('<p>' + inline(line) + '</p>')
  }
  closeList()
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}

window.RENDERERS.note = function (body, panel, api) {
  const root = (api.notesRoot && api.notesRoot()) || panel.root || 'E:/Obsidian'
  body.innerHTML = ''
  const app = el('div', 'note-app')
  const tree = el('div', 'note-tree')
  const s1 = el('div', 'note-split')
  const mid = el('div', 'note-mid')
  const s2 = el('div', 'note-split')
  const right = el('div', 'note-right')
  app.appendChild(tree); app.appendChild(s1); app.appendChild(mid); app.appendChild(s2); app.appendChild(right)
  body.appendChild(app)

  const bar = el('div', 'note-bar')
  const pathEl = el('span', 'note-path', root)
  const btnNew = el('button', null, '新建')
  const btnSave = el('button', null, '保存')
  bar.appendChild(pathEl); bar.appendChild(btnNew); bar.appendChild(btnSave)
  const ta = document.createElement('textarea')
  ta.className = 'note-input'
  ta.spellcheck = false
  ta.placeholder = '在这里写 markdown…'
  mid.appendChild(bar); mid.appendChild(ta)

  const prev = el('div', 'note-md')
  right.appendChild(prev)

  let curPath = ''

  const render = () => { prev.innerHTML = mdToHtml(ta.value) }
  ta.addEventListener('input', render)

  async function openFile(p) {
    const res = await api.fsRead(p)
    if (!res || !res.ok) { pathEl.textContent = '读取失败：' + ((res && res.error) || ''); return }
    curPath = p
    pathEl.textContent = p
    ta.value = res.text || ''
    render()
  }

  async function fillTree(dir, host, depth) {
    const res = await api.fsList(dir)
    if (!res || !res.ok) { host.appendChild(el('div', 'note-err', (res && res.error) || '列目录失败')); return }
    const items = (res.entries || res.items || []).filter((it) => !it.hidden && (it.isDir || it.dir || /\.md$/i.test(it.name)))
    items.sort((x, y) => {
      const dx = x.isDir || x.dir
      const dy = y.isDir || y.dir
      return dx === dy ? x.name.localeCompare(y.name) : dx ? -1 : 1
    })
    for (const it of items) {
      const isDir = !!(it.isDir || it.dir)
      const row = el('div', 'note-row' + (isDir ? ' dir' : ''), (isDir ? '▸ ' : '📄 ') + it.name)
      row.title = it.path
      host.appendChild(row)
      if (isDir) {
        const sub = el('div', 'note-sub')
        sub.hidden = true
        host.appendChild(sub)
        row.addEventListener('click', async () => {
          if (sub.hidden) { row.textContent = '▾ ' + it.name; sub.hidden = false; if (!sub.dataset.filled) { sub.dataset.filled = '1'; await fillTree(it.path, sub, depth + 1) } }
          else { row.textContent = '▸ ' + it.name; sub.hidden = true }
        })
      } else {
        row.addEventListener('click', () => openFile(it.path))
      }
    }
    if (!items.length) host.appendChild(el('div', 'note-err', '（这里没有 .md）'))
  }

  fillTree(root, tree, 0)

  btnSave.addEventListener('click', async () => {
    if (!curPath) {
      const name = prompt === undefined ? '' : ''
      return
    }
    const res = await api.noteSave(curPath, ta.value)
    pathEl.textContent = res && res.ok ? curPath + ' · 已保存' : '保存失败：' + ((res && res.error) || '')
  })

  btnNew.addEventListener('click', async () => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const name = '新笔记-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.md'
    const target = root.replace(/[\\/]$/, '') + '/' + name
    const res = await api.noteSave(target, '# ' + name.replace(/\.md$/i, '') + '\n\n')
    if (res && res.ok) {
      ta.value = '# ' + name.replace(/\.md$/i, '') + '\n\n'
      curPath = target
      pathEl.textContent = target
      render()
      tree.innerHTML = ''
      fillTree(root, tree, 0)
    } else {
      pathEl.textContent = '新建失败：' + ((res && res.error) || '')
    }
  })

  // 两个内部分隔条
  const bindLocal = (h, which) => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      h.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const startW = which === 'left' ? tree.getBoundingClientRect().width : right.getBoundingClientRect().width
      const move = (ev) => {
        const dx = ev.clientX - startX
        const w = Math.max(120, which === 'left' ? startW + dx : startW - dx)
        if (which === 'left') tree.style.flex = '0 0 ' + w + 'px'
        else right.style.flex = '0 0 ' + w + 'px'
      }
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up) }
      h.addEventListener('pointermove', move)
      h.addEventListener('pointerup', up)
    })
  }
  bindLocal(s1, 'left')
  bindLocal(s2, 'right')

  // 面板窄的时候自动收起侧栏：先收预览，再收文件树
  const fit = () => {
    const w = body.clientWidth
    right.hidden = w < 620
    tree.hidden = w < 400
  }
  try { new ResizeObserver(fit).observe(body) } catch (e) {}
  fit()
}


/* ───────────── 文件预览器 ───────────── */
function pvSize(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return n + ' 字节'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

window.RENDERERS.preview = function (body, panel, api) {
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

/* ───────────── 电脑监控 ───────────── */
window.RENDERERS.monitor = function (body, panel, api) {
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
