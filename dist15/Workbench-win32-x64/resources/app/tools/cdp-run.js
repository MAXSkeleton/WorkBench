const http = require('node:http')
const fs = require('node:fs')
const WS = require('E:/Work/workbench/vendor/cs/code-server-4.145.2-windows-amd64/lib/vscode/node_modules/ws')
const port = Number(process.argv[2] || 9555)
const exprFile = process.argv[3]
const expr = fs.readFileSync(exprFile, 'utf8')
function list() {
  return new Promise((res, rej) => {
    const r = http.get({ host: '127.0.0.1', port: port, path: '/json/list' }, (x) => {
      let b = ''
      x.on('data', (c) => { b += c })
      x.on('end', () => res(JSON.parse(b)))
    })
    r.on('error', rej)
    r.setTimeout(8000, () => { r.destroy(); rej(new Error('list timeout')) })
  })
}
;(async () => {
  const l = await list()
  const t = l.find((x) => x.type === 'page' && /renderer/.test(x.url)) || l.find((x) => x.type === 'page')
  if (!t) return console.log('ERR no page target')
  const ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((r) => ws.on('open', r))
  const out = await new Promise((res) => {
    const timer = setTimeout(() => res({ err: 'eval timeout' }), 15000)
    ws.on('message', (raw) => {
      const m = JSON.parse(raw)
      if (m.id === 1) { clearTimeout(timer); res(m.result || m.error) }
    })
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }))
  })
  console.log(JSON.stringify(out && out.result ? out.result.value : out).slice(0, 1500))
  ws.close()
})().catch((e) => console.log('ERR', e.message))