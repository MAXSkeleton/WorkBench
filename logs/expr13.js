(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1200)
  const btn = [...document.querySelectorAll('.tb-menu-btn')].find((x) => /窗口/.test(x.textContent))
  if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  await w(30000)
  return { ok: true }
})()