(async () => {
  await new Promise((r) => setTimeout(r, 900))
  const hs = [...document.querySelectorAll('.g-handle')].map((h) => ({ cls: h.className.replace('g-handle ', ''), left: h.style.left, top: h.style.top }))
  return { hs }
})()