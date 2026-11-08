(async () => {
  await new Promise((r) => setTimeout(r, 4500))
  const mon = document.querySelector('.mon')
  const vals = mon ? [...mon.querySelectorAll('.mon-val')].map((v) => v.textContent) : null
  const sub = mon ? (mon.querySelector('.mon-sub') || {}).textContent : null
  const pv = document.querySelector('.pv-path')
  const res = await window.app.preview('D:\\deepseek\\电脑\\embed-obsidian.png')
  const imgOk = res && res.ok && res.kind === 'image' && (res.dataUrl || '').startsWith('data:image/png')
  return { vals, sub, pvPath: pv ? pv.textContent : null, imgOk, kind: res && res.kind }
})()