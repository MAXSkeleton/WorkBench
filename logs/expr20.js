(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = {}
  await w(1600)
  const host = document.getElementById('taskbar')
  out.barText = host.innerText.replace(/\n+/g, ' | ').slice(0, 120)
  out.items = [...host.querySelectorAll('.lbar-item')].length
  out.caps = [...host.querySelectorAll('.lbar-cap')].map((c) => c.textContent)
  // 空白处右键
  host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 20 }))
  await w(120)
  out.barMenu = [...document.querySelectorAll('.lbar-menu-item')].map((b) => b.textContent)
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await w(120)
  // 图标右键
  const first = host.querySelector('.lbar-item')
  first.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 20 }))
  await w(120)
  out.itemMenu = [...document.querySelectorAll('.lbar-menu-item')].map((b) => ({ t: b.textContent, danger: b.classList.contains('danger') }))
  // 删除第一个
  const del = [...document.querySelectorAll('.lbar-menu-item')].find((b) => b.textContent === '删除')
  del.click()
  await w(200)
  out.afterDelete = [...host.querySelectorAll('.lbar-item')].length
  // 打开新增本地弹窗看结构
  host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 20 }))
  await w(120)
  ;[...document.querySelectorAll('.lbar-menu-item')].find((b) => b.textContent === '新增本地').click()
  await w(600)
  const pop = document.querySelector('.lbar-pop')
  out.pop = pop ? { segs: [...pop.querySelectorAll('.lbar-seg-btn')].map((b) => b.textContent), inputs: [...pop.querySelectorAll('.lbar-input')].length, rows: [...pop.querySelectorAll('.lbar-frow')].length, head: pop.querySelector('.lbar-pop-head').textContent } : null
  if (pop) pop.querySelector('.lbar-btn:last-child') && null
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  // 图标提取
  const ico = await window.app.exeIcon('D:\\Linux\\vmware.exe')
  out.exeIcon = { ok: !!(ico && ico.ok), len: ico && ico.dataUrl ? ico.dataUrl.length : 0 }
  // 清理测试痕迹
  try { localStorage.removeItem('workbench.bar.v1') } catch (e2) {}
  return out
})()