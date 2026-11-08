(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1500)
  const menu = document.querySelector('.tb-menu')
  if (menu) { menu.hidden = false; menu.style.zIndex = '999' }
  await w(32000)
  return { opened: !!(menu && !menu.hidden) }
})()