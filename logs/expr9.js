(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(600)
  const nodes = [...document.querySelectorAll('.fb-node')]
  const dn = nodes.find((n) => /D:/.test(n.textContent || ''))
  let clickTargets = []
  if (dn) {
    const name = dn.querySelector('.fb-name') || dn.querySelector('span:last-child') || dn
    name.click()
    clickTargets = [dn.className]
  }
  await wait(1800)
  const rows = [...document.querySelectorAll('.fb-row')]
  const target = rows.find((r) => /\.(png|txt|md|log|ini)$/i.test(r.textContent || '')) || rows.find((r) => /\./i.test(r.textContent || ''))
  const picked = target ? (target.textContent || '').trim().split('\n')[0] : null
  if (target) target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await wait(2600)
  const img = document.querySelector('.pv-img')
  const pre = document.querySelector('.pv-text')
  return {
    clickTargets,
    rowCount: rows.length,
    names: rows.slice(0, 4).map((r) => (r.textContent || '').trim().split('\n')[0]),
    picked,
    kind: img ? 'image' : pre ? 'text' : 'none',
    srcHead: img ? img.src.slice(0, 30) : null,
    path: ((document.querySelector('.pv-path') || {}).textContent || '').slice(0, 90),
  }
})()