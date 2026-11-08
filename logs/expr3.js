(async () => {
  await new Promise((r) => setTimeout(r, 5000))
  const s = await window.app.sysStats()
  const mon = document.querySelector('.mon')
  return { gpu: s.gpu, vals: mon ? [...mon.querySelectorAll('.mon-val')].map((v) => v.textContent) : null, sub: mon ? (mon.querySelector('.mon-sub') || {}).textContent : null }
})()