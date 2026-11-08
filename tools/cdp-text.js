// 通过 CDP 打印某个目标的 DOM 文本，用来确认 webview 里到底渲染了什么。
// 用法：node tools/cdp-text.js [url 关键字] [debugPort]
const http = require('node:http')
const path = require('node:path')
const WS = require(path.join(
  __dirname,
  '..',
  'vendor', 'cs', 'code-server-4.145.2-windows-amd64',
  'lib', 'vscode', 'node_modules', 'ws',
))

const needle = process.argv[2] || ''
const port = Number(process.argv[3] || 9222)

function json(p) {
  return new Promise((res, rej) => {
    const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, (resp) => {
      let b = ''
      resp.on('data', (c) => (b += c))
      resp.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } })
    })
    r.on('error', rej)
    r.on('timeout', () => { r.destroy(); rej(new Error('timeout')) })
  })
}

;(async () => {
  const list = await json('/json/list')
  const pages = list.filter((t) => t.type === 'page' || t.type === 'webview')
  for (const t of pages) console.log('[target]', t.type, t.url.slice(0, 120))

  const target = pages.find((t) => needle && t.url.includes(needle))
  if (!target) { console.log('未找到匹配目标'); return }

  const ws = new WS(target.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((r) => ws.on('open', r))
  let id = 0
  const call = (method, params) => new Promise((res) => {
    const myId = ++id
    const onMsg = (raw) => {
      const m = JSON.parse(raw)
      if (m.id === myId) { ws.off('message', onMsg); res(m.result) }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })

  const r = await call('Runtime.evaluate', {
    expression: 'document.body.innerText.replace(/\\n{2,}/g, "\\n")',
    returnByValue: true,
  })
  console.log('=== 目标:', target.url.slice(0, 100))
  console.log((r.result && r.result.value || '').slice(0, 1500))
  ws.close()
})().catch((e) => console.log('ERROR', e.message))
