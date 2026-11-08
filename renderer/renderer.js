'use strict'
/**
 * 渲染层壳：读场景 json → 建网格 → 逐面板调渲染器 → 驱动启动进度。
 */

const SCENARIO_ID = 'dev'
const state = { scenario: null, engineUrl: '', vscode: null, panels: {} }

function $(id) { return document.getElementById(id) }

function onBoot(s) {
  const pct = typeof s.pct === 'number' ? s.pct : 0
  $('bootfill').style.width = pct + '%'
  $('boottext').textContent = s.text || ''
  $('bootdetail').textContent = s.detail || ''
}

function buildGrid(sc) {
  const g = $('grid')
  const cols = (sc.grid && sc.grid.cols) || 12
  const rows = (sc.grid && sc.grid.rows) || 10
  g.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
  g.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`
  g.innerHTML = ''
  g.hidden = false // #grid 初始 hidden（避免白闪），建完必须显式打开，否则整块网格一直 display:none

  ;(sc.panels || []).forEach((p) => {
    const box = document.createElement('div')
    box.className = 'panel'
    box.style.gridColumn = `${(p.col || 0) + 1} / span ${p.w || 1}`
    box.style.gridRow = `${(p.row || 0) + 1} / span ${p.h || 1}`
    box.dataset.panelId = p.id

    const head = document.createElement('div')
    head.className = 'panel-head'
    const dot = document.createElement('i')
    dot.className = 'dot'
    const title = document.createElement('span')
    title.className = 'title'
    title.textContent = p.title || p.id
    const actions = document.createElement('div')
    actions.className = 'actions'
    head.appendChild(dot)
    head.appendChild(title)
    head.appendChild(actions)

    const body = document.createElement('div')
    body.className = 'panel-body'

    box.appendChild(head)
    box.appendChild(body)
    g.appendChild(box)

    state.panels[p.id] = { box, body, head, dot, actions, panel: { ...p, scenarioId: SCENARIO_ID } }
  })
}

function renderPanel(id) {
  const rec = state.panels[id]
  if (!rec) return
  const api = {
    engineUrl: () => state.engineUrl,
    vscodeStatus: () => state.vscode,
    launchers: () => state.scenario.launchers || [],
    setDot: (kind) => { rec.dot.className = 'dot' + (kind ? ' ' + kind : '') },
    reload: null,
  }
  const fn = window.RENDERERS[rec.panel.type]
  if (!fn) {
    rec.body.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'empty'
    d.textContent = '未知面板类型：' + rec.panel.type
    rec.body.appendChild(d)
    api.setDot('err')
    return
  }
  try {
    fn(rec.body, rec.panel, api)
  } catch (err) {
    rec.body.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'empty'
    d.textContent = '渲染失败：' + (err && err.message)
    rec.body.appendChild(d)
    api.setDot('err')
    console.error(err)
  }
}

function renderStatus() {
  const bar = $('status')
  bar.innerHTML = ''
  const engineOk = !!state.engineUrl
  let host = ''
  try { host = new URL(state.engineUrl).host } catch {}
  bar.textContent = [
    'DSH 引擎：' + (engineOk ? host : '未就绪'),
    'VSCode：' + (state.vscode ? state.vscode.status : '未知'),
    '面板：' + Object.keys(state.panels).length,
  ].join('   ·   ')
  bar.hidden = false
}

async function main() {
  window.app.onBoot(onBoot)

  const sc = await window.app.scenario(SCENARIO_ID)
  state.scenario = sc
  buildGrid(sc)

  // 先渲染不依赖启动结果的面板，让界面尽快有内容
  Object.keys(state.panels).forEach((id) => {
    const t = state.panels[id].panel.type
    if (t !== 'web' && t !== 'vscode') renderPanel(id)
  })

  const res = await window.app.start(SCENARIO_ID)
  state.engineUrl = res.url || ''
  state.vscode = res.vscode || null

  // 引擎相关的面板延后渲染
  Object.keys(state.panels).forEach((id) => {
    const t = state.panels[id].panel.type
    if (t === 'web' || t === 'vscode') renderPanel(id)
  })

  $('boot').hidden = true
  renderStatus()
}

main().catch((err) => {
  onBoot({ pct: 100, text: '启动失败', detail: String(err && err.message || err) })
  console.error(err)
})
