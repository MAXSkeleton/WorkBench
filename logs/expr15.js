(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1500)
  const bar1 = document.getElementById('taskbar')
  const icons = [...bar1.querySelectorAll('.tb-ico')].map((i) => ({
    src: i.getAttribute('src'),
    loaded: i.complete && i.naturalWidth > 0,
    title: i.parentElement.title,
  }))
  const bar2 = document.getElementById('taskbar2')
  const bar2Text = bar2.innerText.replace(/\n+/g, ' | ')
  const men = bar2.querySelector('.tb-menu')
  const items = [...men.querySelectorAll('.tb-menu-item')].map((i) => i.textContent)
  const hasSep = !!men.querySelector('.tb-menu-sep')
  // 改一下布局再存，验证持久化
  const before = JSON.stringify(state0())
  window.__wtState = typeof state === 'object' ? state : null
  return { icons, bar2Text, items, hasSep, presets: [...bar2.querySelectorAll('.tb-preset')].map((c) => c.textContent + (c.classList.contains('on') ? '*' : '')) }
  function state0() { return {} }
})()