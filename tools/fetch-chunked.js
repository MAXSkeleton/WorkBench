'use strict'
/**
 * 可断点续传的分块下载器（专治这台机器上 github 大文件被掐断）。
 * 用法：node tools/fetch-chunked.js <url> <out> [totalBytes]
 * 特性：Range 续传、每块超时重试、失败自动退避、进度写进日志。
 */
const fs = require('fs')
const path = require('path')

const url = process.argv[2]
const out = process.argv[3]
const RETRY = 8
const CHUNK = 4 * 1024 * 1024
const IDLE_MS = 45000

if (!url || !out) {
  console.error('usage: node tools/fetch-chunked.js <url> <out>')
  process.exit(2)
}

const dir = path.dirname(out)
fs.mkdirSync(dir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sizeOf(p) {
  try { return fs.statSync(p).size } catch { return 0 }
}

async function once(start) {
  const ac = new AbortController()
  let idle = setTimeout(() => ac.abort(), IDLE_MS)
  const bump = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), IDLE_MS) }
  const res = await fetch(url, { signal: ac.signal, headers: { Range: `bytes=${start}-${start + CHUNK - 1}` } })
  if (res.status !== 206 && res.status !== 200) throw new Error('HTTP ' + res.status)
  const total = res.headers.get('content-range') ? Number(res.headers.get('content-range').split('/')[1]) : 0
  const fd = fs.openSync(out, start === 0 ? 'w' : 'r+')
  let n = 0
  try {
    fs.ftruncateSync(fd, start)
    let pos = start
    const rd = res.body.getReader()
    for (;;) {
      const { done, value } = await rd.read()
      if (done) break
      bump()
      fs.writeSync(fd, value, 0, value.length, pos)
      pos += value.length
      n += value.length
      if (n >= CHUNK) break
    }
  } finally {
    fs.closeSync(fd)
    clearTimeout(idle)
  }
  return { got: n, total }
}

;(async () => {
  let attempt = 0
  for (;;) {
    let have = sizeOf(out)
    if (have >= 1000) console.log(`[resume] 已有 ${(have / 1048576).toFixed(1)}MB`)
    try {
      const r = await once(have)
      const now = sizeOf(out)
      const pct = r.total ? ((now / r.total) * 100).toFixed(1) + '%' : '?'
      console.log(`[ok] +${(r.got / 1048576).toFixed(1)}MB → ${(now / 1048576).toFixed(1)}MB ${pct}`)
      attempt = 0
      if (r.total && now >= r.total) { console.log('[done] ' + out); return }
      if (r.got === 0) { console.log('[stop] 服务端没有更多数据'); return }
    } catch (err) {
      attempt++
      const now = sizeOf(out)
      console.log(`[retry ${attempt}/${RETRY}] at ${(now / 1048576).toFixed(1)}MB: ${err.name === 'AbortError' ? 'idle timeout' : err.message}`)
      if (attempt >= RETRY) { console.log('[give-up]'); process.exit(1) }
      await sleep(3000 * attempt)
    }
  }
})()
