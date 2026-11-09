(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(2000)
  const host = document.getElementById('taskbar')
  return {
    hasHost: !!host,
    hostHtml: host ? host.innerHTML.slice(0, 160) : null,
    buildBar: typeof window.__wtBuildBar,
    scripts: [...document.scripts].map((s) => s.getAttribute('src')),
    lbarItems: host ? host.querySelectorAll('.lbar-item').length : -1,
    err: window.__wtErr || null,
  }
})()