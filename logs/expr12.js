(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(1400)
  const bar = document.getElementById('taskbar2')
  const barText = bar.innerText.replace(/\n+/g, ' | ')
  const presets = [...bar.querySelectorAll('.tb-preset')].map((c) => c.textContent + (c.classList.contains('on') ? '*' : ''))
  const winBtn = [...bar.querySelectorAll('.tb-menu-btn')].find((b) => /窗口/.test(b.textContent))
  const wmenu = winBtn.parentElement.querySelector('.tb-menu')
  const beforeHidden = wmenu.hidden
  winBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  await wait(150)
  const afterHidden = wmenu.hidden
  const items = [...wmenu.querySelectorAll('.tb-menu-item')].map((i) => i.textContent)
  const clipped = (() => {
    const r = wmenu.getBoundingClientRect()
    return r.height === 0 || r.width === 0
  })()
  const rings = [...document.querySelectorAll('.mon-ring')].map((r) => ({
    cap: r.querySelector('.ring-cap').textContent,
    num: r.querySelector('.ring-num').textContent,
    capTop: Math.round(r.querySelector('.ring-cap').getBoundingClientRect().top),
    svgBottom: Math.round(r.querySelector('svg').getBoundingClientRect().bottom),
  }))
  const pvInput = !!document.querySelector('.pv-input')
  return { barText, presets, beforeHidden, afterHidden, items, clipped, rings, pvInput }
})()