(async () => {
  await new Promise((r) => setTimeout(r, 600))
  const hs = [...document.querySelectorAll('.g-handle')].map((h) => ({ cls: h.className.replace('g-handle ', ''), left: h.style.left, top: h.style.top }))
  const ws = document.getElementById('grid')
  const before = getComputedStyle(ws).gridTemplateColumns
  const v = document.querySelector('.g-handle.g-v')
  const rect = v.getBoundingClientRect()
  const down = new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + 3, clientY: rect.top + 100, button: 0 })
  v.dispatchEvent(down)
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 3 + 120, clientY: rect.top + 100 }))
  await new Promise((r) => setTimeout(r, 100))
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rect.left + 123, clientY: rect.top + 100 }))
  const after = getComputedStyle(ws).gridTemplateColumns
  return { hs, before, after, changed: before !== after }
})()