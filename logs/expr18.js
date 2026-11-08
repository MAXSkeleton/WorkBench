(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1500)
  try { localStorage.removeItem('workbench.ui.v2') } catch (err) {}
  applyPreset(allPresets()[0])
  saveUi()
  await w(28000)
  return { preset: currentPresetName() }
})()