(async () => {
  const bar = document.getElementById('taskbar2')
  const barText = bar ? bar.innerText.replace(/\n+/g, ' | ') : null
  const pbtn = bar.querySelector('.tb-menu-btn')
  pbtn.click()
  await new Promise((r) => setTimeout(r, 150))
  const menuItems = [...bar.querySelectorAll('.tb-menu-item')].map((b) => b.textContent)
  const dev = [...bar.querySelectorAll('.tb-menu-item')].find((b) => b.textContent === '开发')
  dev.click()
  await new Promise((r) => setTimeout(r, 1200))
  const areasDev = getComputedStyle(document.getElementById('grid')).gridTemplateAreas
  const panelsDev = [...document.querySelectorAll('.panel')].map((p) => p.dataset.panelId)
  const base = [...bar.querySelectorAll('.tb-menu-item')].find((b) => b.textContent === '基础')
  if (!base) { document.querySelector('.tb-menu-btn').click() }
  await new Promise((r) => setTimeout(r, 150))
  const base2 = [...document.querySelectorAll('.tb-menu-item')].find((b) => b.textContent === '基础')
  base2.click()
  await new Promise((r) => setTimeout(r, 1200))
  const areasBase = getComputedStyle(document.getElementById('grid')).gridTemplateAreas
  const panelsBase = [...document.querySelectorAll('.panel')].map((p) => p.dataset.panelId)

  window.dispatchEvent(new CustomEvent('wt:preview', { detail: { path: 'D:\\deepseek\\电脑\\revert-check.png' } }))
  await new Promise((r) => setTimeout(r, 2500))
  const img = document.querySelector('.pv-img')
  const pvPath = (document.querySelector('.pv-path') || {}).textContent

  const handles = [...document.querySelectorAll('.g-handle')].map((h) => ({ cls: h.className, left: h.style.left, top: h.style.top }))
  return { barText, menuItems, areasDev, panelsDev, areasBase, panelsBase, imgOk: !!(img && img.src.startsWith('data:image/png')), pvPath, handles }
})()