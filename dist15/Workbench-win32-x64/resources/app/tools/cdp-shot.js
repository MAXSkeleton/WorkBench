const http = require('node:http')
const fs = require('node:fs')
const WS = require('E:/Work/workbench/vendor/cs/code-server-4.145.2-windows-amd64/lib/vscode/node_modules/ws')

const out = process.argv[2] || 'shot-cdp.png'
const needle = process.argv[3] || 'index.html'
const port = Number(process.argv[4] || 9333)

function list() {
  return new Promise((res, rej) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/json/list' }, (x) => {
      let b = ''
      x.on('data', (c) => { b += c })
      x.on('end', () => res(JSON.parse(b)))
    })
    r.on('error', rej)
    r.setTimeout(6000, () => { r.destroy(); rej(new Error('timeout')) })
  })
}

;(async () => {
  const l = await list()
  const t = l.find((x) => x.url.includes(needle))
  if (!t) { console.log('no target'); return }
  const ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((r) => ws.on('open', r))
  let id = 0
  const call = (m, p, to = 8000) => new Promise((res) => {
    const i = ++id
    const tm = setTimeout(() => { ws.off('message', on); res({ __t: 1 }) }, to)
    const on = (raw) => {
      const x = JSON.parse(raw)
      if (x.id === i) { clearTimeout(tm); ws.off('message', on); res(x.result || x.error) }
    }
    ws.on('message', on)
    ws.send(JSON.stringify({ id: i, method: m, params: p }))
  })
  await call('Page.enable')
  const r = await call('Page.captureScreenshot', { format: 'png' }, 15000)
  if (r && r.data) {
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'))
    console.log('已保存', out, fs.statSync(out).size, '字节')
  } else {
    console.log('截图失败', JSON.stringify(r))
  }
  ws.close()
})().catch((e) => console.log('ERR', e.message))
