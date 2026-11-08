(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(600)
  const dn = [...document.querySelectorAll('.fb-node')].find((n) => /D:/.test(n.textContent || ''))
  if (dn) (dn.querySelector('.fb-name') || dn).click()
  await wait(1800)
  const rows = [...document.querySelectorAll('.fb-row')].filter((r) => !/文件夹/.test(r.textContent || ''))
  const target = rows.find((r) => /\.(png|jpg|txt|md)$/i.test(r.textContent || '')) || rows[0]
  const picked = target ? (target.textContent || '').trim() : null
  if (target) target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await wait(3000)
  const img = document.querySelector('.pv-img')
  const pre = document.querySelector('.pv-text')
  const vid = document.querySelector('.pv-video')
  return {
    filesOnDrive: rows.length,
    picked: picked ? picked.slice(0, 60) : null,
    kind: img ? 'image' : pre ? 'text' : vid ? 'video' : 'none',
    srcHead: img ? img.src.slice(0, 28) : null,
    path: ((document.querySelector('.pv-path') || {}).textContent || '').slice(0, 100),
  }
})()