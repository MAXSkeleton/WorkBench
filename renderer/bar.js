'use strict'
window.__wtErrCatch = function (e) {
  window.__wtErr = (e && e.message ? e.message : String(e)) + ' @ ' + ((e && e.filename) || '') + ':' + ((e && e.lineno) || '')
}
window.addEventListener('error', window.__wtErrCatch)
/* 第一行任务栏（书签式）：本地 exe + 网站，支持右键新增/修改/删除、同类拖拽排序 */
try {
(function () {
  const BAR_KEY = 'workbench.bar.v1'
  let bar = { local: [], web: [] }
  let host = null
  let pop = null

  const el = (tag, cls, text) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  function defaults(sc) {
    const items = (sc.taskbar && sc.taskbar.length) ? sc.taskbar : (sc.launchers || [])
    const byKey = {}
    ;(sc.launchers || []).forEach((l) => { byKey[l.key] = l })
    return {
      local: items.map((it) => ({
        id: it.key,
        label: it.label || it.key,
        path: it.path || (byKey[it.key] && byKey[it.key].path) || '',
        icon: '',
      })),
      web: [],
    }
  }

  function load(sc) {
    try {
      const raw = localStorage.getItem(BAR_KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v && Array.isArray(v.local) && Array.isArray(v.web)) return v
      }
    } catch (err) {}
    return defaults(sc)
  }

  function save() {
    try { localStorage.setItem(BAR_KEY, JSON.stringify(bar)) } catch (err) {}
  }

  function ensureIcon(kind, item) {
    if (item.icon) return item.icon
    const done = (d) => {
      if (d && d.ok && d.dataUrl) {
        item.icon = d.dataUrl
        save()
        render()
      }
    }
    try {
      if (kind === 'web' && item.url) window.app.fetchIcon(item.url).then(done)
      else if (item.path) window.app.exeIcon(item.path).then(done)
    } catch (err) {}
    return ''
  }

  function normalizeUrl(u) {
    const s = String(u || '').trim()
    if (!s) return ''
    if (/^[a-z]+:\/\//i.test(s)) return s
    return 'https://' + s
  }

  function launch(kind, item) {
    if (kind === 'web') {
      const url = normalizeUrl(item.url)
      if (!url) return
      if (window.__wtAddWeb) window.__wtAddWeb(url, item.label || url)
      else window.app.openExternal(url)
      return
    }
    if (!item.path) { toastSafe('这条没有设置路径'); return }
    window.app.launchPath(item.path).then((r) => {
      if (!r || !r.ok) toastSafe('启动失败：' + ((r && r.error) || '未知原因'))
    })
  }

  function toastSafe(msg) {
    try { window.__wtToast ? window.__wtToast(msg) : null } catch (err) {}
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!host) return
    host.innerHTML = ''
    const wrap = el('div', 'lbar')

    wrap.appendChild(group('本地', bar.local))
    const sep = el('span', 'lbar-sep')
    wrap.appendChild(sep)
    wrap.appendChild(group('网站', bar.web))

    host.appendChild(wrap)
  }

  function group(cap, items) {
    const box = el('div', 'lbar-group')
    box.appendChild(el('span', 'lbar-cap', cap))
    const list = el('div', 'lbar-list')
    list.dataset.kind = cap === '本地' ? 'local' : 'web'
    items.forEach((it, idx) => list.appendChild(chip(cap === '本地' ? 'local' : 'web', it, idx)))
    if (!items.length) {
      const hint = el('span', 'lbar-empty', cap === '本地' ? '（空）' : '（空，右键新增）')
      list.appendChild(hint)
    }
    box.appendChild(list)
    return box
  }

  function chip(kind, item, idx) {
    const btn = el('button', 'lbar-item')
    btn.dataset.kind = kind
    btn.dataset.idx = String(idx)
    btn.title = (kind === 'web' ? (item.label + '  ' + item.url) : (item.label + '  ' + item.path))
    btn.draggable = true

    const icon = ensureIcon(kind, item)
    if (icon) {
      const img = el('img', 'lbar-ico')
      img.src = icon
      img.alt = ''
      btn.appendChild(img)
    } else {
      const ph = el('span', 'lbar-ph', (item.label || '?').slice(0, 1).toUpperCase())
      btn.appendChild(ph)
    }

    btn.addEventListener('click', () => launch(kind, item))
    btn.addEventListener('contextmenu', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      itemMenu(kind, item, ev.clientX, ev.clientY)
    })

    // 同类拖拽排序
    btn.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', kind + ':' + item.id)
      ev.dataTransfer.effectAllowed = 'move'
      btn.classList.add('dragging')
    })
    btn.addEventListener('dragend', () => btn.classList.remove('dragging'))
    btn.addEventListener('dragover', (ev) => {
      ev.preventDefault()
      ev.dataTransfer.dropEffect = 'move'
      btn.classList.add('drop-target')
    })
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-target'))
    btn.addEventListener('drop', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      btn.classList.remove('drop-target')
      const raw = ev.dataTransfer.getData('text/plain') || ''
      const [srcKind, srcId] = raw.split(':')
      if (srcKind !== kind || !srcId) return
      const arr = kind === 'local' ? bar.local : bar.web
      const from = arr.findIndex((x) => x.id === srcId)
      const to = arr.findIndex((x) => x.id === item.id)
      if (from < 0 || to < 0 || from === to) return
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      save()
      render()
    })
    return btn
  }

  /* ---------------- 菜单 ---------------- */
  function menuAt(x, y, entries) {
    closeMenu()
    const m = el('div', 'lbar-menu')
    m.style.left = x + 'px'
    m.style.top = y + 'px'
    entries.forEach((e) => {
      if (e.type === 'sep') { m.appendChild(el('div', 'lbar-menu-sep')); return }
      const b = el('button', 'lbar-menu-item' + (e.danger ? ' danger' : ''), e.label)
      b.addEventListener('click', () => { closeMenu(); e.run() })
      m.appendChild(b)
    })
    document.body.appendChild(m)
    const r = m.getBoundingClientRect()
    if (r.right > window.innerWidth - 8) m.style.left = Math.max(8, window.innerWidth - r.width - 8) + 'px'
    if (r.bottom > window.innerHeight - 8) m.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px'
    const onDown = (ev) => {
      const m2 = document.querySelector('.lbar-menu')
      if (m2 && m2.contains(ev.target)) return
      closeMenu()
      document.removeEventListener('pointerdown', onDown, true)
    }
    setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0)
  }

  function closeMenu() {
    document.querySelectorAll('.lbar-menu').forEach((m) => m.remove())
  }

  function itemMenu(kind, item, x, y) {
    menuAt(x, y, [
      { label: '地址修改', run: () => openDialog(kind, item) },
      { type: 'sep' },
      {
        label: '删除',
        danger: true,
        run: () => {
          const arr = kind === 'local' ? bar.local : bar.web
          const i = arr.findIndex((v) => v.id === item.id)
          if (i >= 0) arr.splice(i, 1)
          save()
          render()
        },
      },
    ])
  }

  function barMenu(x, y) {
    menuAt(x, y, [
      { label: '新增本地', run: () => openDialog('local', null) },
      { label: '新增网站', run: () => openDialog('web', null) },
    ])
  }

  /* ---------------- 弹窗 ---------------- */
  function closeDialog() {
    if (pop) { pop.remove(); pop = null }
  }

  function openDialog(kind, item) {
    closeMenu()
    closeDialog()
    const creating = !item
    const state2 = { kind: kind, path: (item && item.path) || '', url: (item && item.url) || '', label: (item && item.label) || '', dir: 'This PC' }

    pop = el('div', 'lbar-pop')
    pop.addEventListener('pointerdown', (ev) => ev.stopPropagation())

    const head = el('div', 'lbar-pop-head', creating ? '新增' : '地址修改')
    pop.appendChild(head)

    // 类型切换
    const seg = el('div', 'lbar-seg')
    const mkSeg = (k, text) => {
      const b = el('button', 'lbar-seg-btn' + (state2.kind === k ? ' on' : ''), text)
      b.addEventListener('click', () => {
        state2.kind = k
        ;[...seg.children].forEach((c) => c.classList.remove('on'))
        b.classList.add('on')
        bodySwap()
      })
      return b
    }
    seg.appendChild(mkSeg('local', '本地'))
    seg.appendChild(mkSeg('web', '网站'))
    pop.appendChild(seg)

    const body = el('div', 'lbar-pop-body')
    pop.appendChild(body)

    function bodySwap() {
      body.innerHTML = ''
      if (state2.kind === 'local') {
        const row = el('div', 'lbar-row')
        const inp = el('input', 'lbar-input')
        inp.placeholder = 'exe 的完整路径，例如 D:\\Linux\\vmware.exe'
        inp.value = state2.path
        inp.addEventListener('input', () => { state2.path = inp.value })
        const pick = el('button', 'lbar-btn', '选择 exe…')
        pick.addEventListener('click', async () => {
          const p = await window.app.pickFile()
          if (p) { state2.path = p; inp.value = p }
        })
        row.appendChild(inp)
        row.appendChild(pick)
        body.appendChild(row)

        const browse = el('div', 'lbar-browse')
        const bar2 = el('div', 'lbar-browse-bar')
        const up = el('button', 'lbar-btn small', '↑')
        const pathEl = el('span', 'lbar-browse-path', state2.dir)
        up.addEventListener('click', () => {
          if (state2.dir === 'This PC') return
          if (/^[A-Za-z]:[\\/]?$/.test(state2.dir)) { state2.dir = 'This PC'; pathEl.textContent = 'This PC'; listDir('This PC', listEl, inp); return }
          const p = state2.dir.replace(/[\\/][^\\/]+[\\/]?$/, '')
          state2.dir = p && p.length > 2 ? p : state2.dir.slice(0, 2)
          pathEl.textContent = state2.dir
          listDir(state2.dir, listEl, inp)
        })
        bar2.appendChild(up)
        bar2.appendChild(pathEl)
        browse.appendChild(bar2)
        const listEl = el('div', 'lbar-browse-list')
        browse.appendChild(listEl)
        body.appendChild(browse)
        listDir(state2.dir, listEl, inp)

        // 让迷你浏览器能更新输入框
        function listDir(dir, box, inputRef) {
          box.innerHTML = '<div class="lbar-empty">读取中…</div>'
          if (dir === 'This PC') {
            window.app.fsRoots().then((rr) => {
              box.innerHTML = ''
              if (!rr || !rr.items) { box.appendChild(el('div','lbar-empty','读不到盘符')); return }
              const driveRows = rr.items.filter((it) => it.kind === 'drive')
              const quickRows = rr.items.filter((it) => it.kind === 'quick')
              const renderGroup = (cap, list) => {
                if (!list.length) return
                box.appendChild(el('div', 'lbar-fgroup', cap))
                list.forEach((it) => {
                  const row2 = el('div', 'lbar-frow')
                  row2.appendChild(el('span', 'lbar-ficon', it.kind === 'drive' ? '💽' : '📌'))
                  row2.appendChild(el('span', 'lbar-fname', it.name + (it.kind === 'drive' ? ' (盘)' : '')))
                  row2.addEventListener('click', () => {
                    state2.dir = it.path
                    pathEl.textContent = it.path
                    listDir(it.path, box, inputRef)
                  })
                  box.appendChild(row2)
                })
              }
              renderGroup('驱动器', driveRows)
              renderGroup('常用位置', quickRows)
              if (!driveRows.length && !quickRows.length) box.appendChild(el('div','lbar-empty','（无盘符）'))
            }).catch(() => { box.appendChild(el('div','lbar-empty','读取盘符失败')) })
            return
          }
          window.app.fsList(dir).then((res) => {
            box.innerHTML = ''
            if (!res || !res.ok) { box.appendChild(el('div', 'lbar-empty', '读不到这个目录')); return }
            const items = (res.entries || []).filter((e) => !e.hidden)
            items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
            items.slice(0, 400).forEach((e) => {
              const row2 = el('div', 'lbar-frow')
              row2.appendChild(el('span', 'lbar-ficon', e.isDir ? '📁' : '📄'))
              row2.appendChild(el('span', 'lbar-fname', e.name))
              row2.addEventListener('click', () => {
                if (e.isDir) {
                  state2.dir = e.path
                  pathEl.textContent = e.path
                  listDir(e.path, box, inputRef)
                } else if (/\.(exe|bat|cmd|lnk)$/i.test(e.name)) {
                  state2.path = e.path
                  if (inputRef) inputRef.value = e.path
                } else {
                  toastSafe('只能选 exe / bat / cmd / lnk')
                }
              })
              if (/\.(exe|bat|cmd|lnk)$/i.test(e.name)) {
                row2.addEventListener('dblclick', () => {
                  state2.path = e.path
                  if (inputRef) inputRef.value = e.path
                  if (!state2.label) state2.label = e.name.replace(/\.[^.]+$/, '')
                  if (window.__wtDialogLabel) window.__wtDialogLabel(state2.label)
                  if (commit) commit()
                })
              }
              box.appendChild(row2)
            })
            if (!items.length) box.appendChild(el('div', 'lbar-empty', '（空目录）'))
          })
        }
      } else {
        const row = el('div', 'lbar-row')
        const inp = el('input', 'lbar-input')
        inp.placeholder = 'https://example.com'
        inp.value = state2.url
        inp.addEventListener('input', () => { state2.url = inp.value })
        row.appendChild(inp)
        body.appendChild(row)
        const row2 = el('div', 'lbar-row')
        const nameInp = el('input', 'lbar-input')
        nameInp.placeholder = '显示名称（可留空，自动取域名）'
        nameInp.value = state2.label
        nameInp.addEventListener('input', () => { state2.label = nameInp.value })
        row2.appendChild(nameInp)
        body.appendChild(row2)
      }
    }
    bodySwap()

    const foot = el('div', 'lbar-pop-foot')
    const cancel = el('button', 'lbar-btn', '取消')
    cancel.addEventListener('click', closeDialog)
    const ok = el('button', 'lbar-btn primary', '保存')
    let commit = null
    const doSave = () => {
      const arr = state2.kind === 'local' ? bar.local : bar.web
      let target = item
      if (target && item) {
        // 类型可能被改过：先从原分组移除
        const oldArr = bar.local.includes(item) ? bar.local : bar.web
        const oi = oldArr.indexOf(item)
        if (oldArr !== arr && oi >= 0) oldArr.splice(oi, 1)
      }
      if (state2.kind === 'local') {
        const p = String(state2.path || '').trim()
        if (!p) { toastSafe('先填 exe 路径'); return }
        const label = String(state2.label || '').trim() || p.split(/[\\/]/).pop()
        if (!target) { target = { id: 'L' + Date.now().toString(36), icon: '' }; bar.local.push(target) }
        target.path = p
        target.label = label
        target.icon = ''
      } else {
        const u = normalizeUrl(state2.url)
        if (!u) { toastSafe('先填网址'); return }
        let label = String(state2.label || '').trim()
        if (!label) {
          try { label = new URL(u).hostname.replace(/^www\./, '') } catch (err) { label = u }
        }
        if (!target) { target = { id: 'W' + Date.now().toString(36), icon: '' }; bar.web.push(target) }
        target.url = u
        target.label = label
        target.icon = ''
      }
      save()
      closeDialog()
      render()
      toastSafe('已保存')
    }
    commit = doSave
    ok.addEventListener('click', () => { if (commit) commit() })
    foot.appendChild(cancel)
    foot.appendChild(ok)
    pop.appendChild(foot)

    document.body.appendChild(pop)
    const r = pop.getBoundingClientRect()
    pop.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, 120)) + 'px'
    pop.style.top = Math.max(8, Math.min(window.innerHeight - r.height - 8, 46)) + 'px'
  }

  /* ---------------- 入口 ---------------- */
  window.__wtBuildBar = function (sc) {
    const barEl = document.getElementById('taskbar')
    if (!barEl) return
    bar = load(sc)
    host = barEl
    barEl.hidden = false
    if (!barEl.dataset.wtBound) {
      barEl.dataset.wtBound = '1'
      barEl.addEventListener('contextmenu', (ev) => {
        if (ev.target.closest && ev.target.closest('.lbar-item')) return
        ev.preventDefault()
        barMenu(ev.clientX, ev.clientY)
      })
      document.addEventListener('pointerdown', (ev) => {
        if (pop && !pop.contains(ev.target)) closeDialog()
      })
    }
    render()
  }

  window.__wtBarReset = function () {
    try { localStorage.removeItem(BAR_KEY) } catch (err) {}
    if (host) render()
  }
  // 兜底：任何落在第一行里的右键都归我们处理（防止某个子节点没挂监听时「点了没反应」）
  document.addEventListener('contextmenu', function (ev) {
    var hostEl = document.getElementById('taskbar')
    if (!hostEl || !hostEl.contains(ev.target)) return
    ev.preventDefault()
    if (document.querySelector('.lbar-menu')) return
    var chipEl = ev.target.closest ? ev.target.closest('.lbar-item') : null
    if (chipEl) {
      var kk = chipEl.dataset.kind
      var arr2 = kk === 'local' ? bar.local : bar.web
      var it2 = arr2[Number(chipEl.dataset.idx)]
      if (it2) itemMenu(kk, it2, ev.clientX, ev.clientY)
    } else {
      barMenu(ev.clientX, ev.clientY)
    }
  }, true)
  window.__wtCtxFallback = true
})()
} catch (e) { window.__wtErrCatch(e) }