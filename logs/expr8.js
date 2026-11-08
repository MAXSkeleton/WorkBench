(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(600)
  const nodes = [...document.querySelectorAll('.fb-node')]
  const dn = nodes.find((n) => (n.textContent || '').trim().replace(/\s+/g, '') === 'D:')
  const labels = nodes.map((n) => (n.textContent || '').trim()).slice(0, 12)
  if (dn) dn.click()
  await wait(1500)
  const rows = [...document.querySelectorAll('.fb-row')]
  const target = rows.find((r) => /\.(png|txt|md|log)$/i.test((r.textContent || '')))
  const picked = target ? (target.textContent || '').trim().split('\n')[0] : null
  if (target) target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await wait(2600)
  const img = document.querySelector('.pv-img')
  const pre = document.querySelector('.pv-text')
  return {
    treeLabels: labels,
    rowCount: rows.length,
    firstName: rows.length ? (rows[0].textContent || '').trim().split('\n')[0] : null,
    picked,
    kind: img ? 'image' : pre ? 'text' : 'none',
    path: ((document.querySelector('.pv-path') || {}).textContent || '').slice(0, 90),
  }
})()