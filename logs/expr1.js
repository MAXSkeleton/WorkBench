(async () => {
  const s = await window.app.sysStats()
  const p = await window.app.preview('D:\\deepseek\\电脑\\revert-check.png')
  const chips = [...document.querySelectorAll('.tb-win b')].map((b) => b.textContent)
  const menuBtn = document.querySelector('.tb-menu-btn')
  menuBtn.click()
  await new Promise((r) => setTimeout(r, 200))
  const items = [...document.querySelectorAll('.tb-menu-item')].map((b) => b.textContent)
  const note = [...document.querySelectorAll('.tb-menu-item')].find((b) => b.textContent.includes('笔记'))
  note.click()
  await new Promise((r) => setTimeout(r, 1500))
  const after = [...document.querySelectorAll('.panel')].map((p2) => p2.dataset.panelId)
  const cells = getComputedStyle(document.querySelector('#grid')).gridTemplateAreas
  return {
    stats: { ok: s.ok, cpu: s.cpu, memGB: +(s.mem.used / 1073741824).toFixed(1), gpu: s.gpu ? s.gpu.util : null },
    preview: { ok: p.ok, kind: p.kind, len: (p.dataUrl || '').length, name: p.name },
    chips, items, after, cells
  }
})()