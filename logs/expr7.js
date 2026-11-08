(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(800)
  const rows = [...document.querySelectorAll('.fb-row')]
  const drive = rows.find((r) => /^[A-Z]:$/.test((r.textContent || '').trim()))
  const driveName = drive ? drive.textContent.trim() : null
  if (drive) drive.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await wait(1200)
  const rows2 = [...document.querySelectorAll('.fb-row')]
  const txtFile = rows2.find((r) => /\.(txt|png|log|md)$/i.test((r.textContent || '').trim()))
  const fileName = txtFile ? txtFile.textContent.trim().split('\n')[0] : null
  if (txtFile) txtFile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await wait(2500)
  const img = document.querySelector('.pv-img')
  const pre = document.querySelector('.pv-text')
  const pvPath = (document.querySelector('.pv-path') || {}).textContent || ''
  return {
    driveName,
    fileName,
    previewKind: img ? 'image' : pre ? 'text' : 'none',
    previewPath: pvPath.slice(0, 80),
    handles: [...document.querySelectorAll('.g-handle')].map((h) => h.style.left || h.style.top),
  }
})()