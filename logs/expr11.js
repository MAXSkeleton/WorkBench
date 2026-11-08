(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(1200)
  const bar = document.getElementById('taskbar2')
  const barText = bar.innerText.replace(/\n+/g, ' | ')
  const menuBtns = [...bar.querySelectorAll('.tb-menu-btn')].map((b) => b.textContent)
  const winBtn = [...bar.querySelectorAll('.tb-menu-btn')].find((b) => /窗口/.test(b.textContent))
  winBtn.click()
  await wait(200)
  const wraps = [...bar.querySelectorAll('.tb-menu-wrap')]
  const menus = wraps.map((w) => ({ btn: w.querySelector('.tb-menu-btn').textContent, items: [...w.querySelectorAll('.tb-menu-item')].map((i) => i.textContent) }))
  const noteItem = [...wraps.flatMap((w) => [...w.querySelectorAll('.tb-menu-item')])].find((i) => i.textContent === '笔记')
  noteItem.click()
  await wait(1600)
  const areas = getComputedStyle(document.getElementById('grid')).gridTemplateAreas
  const rings = [...document.querySelectorAll('.mon-ring')].map((r) => ({
    cap: r.querySelector('.ring-cap').textContent,
    num: r.querySelector('.ring-num').textContent,
    dash: r.querySelector('.ring-fg').getAttribute('stroke-dasharray'),
  }))
  const mem = (document.querySelector('.mon-val') || {}).textContent
  const sub = (document.querySelector('.mon-sub') || {}).textContent
  return { barText, menuBtns, menus, areas, rings, mem, sub }
})()