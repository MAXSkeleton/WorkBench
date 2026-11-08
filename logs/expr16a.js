(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1500)
  const dev = allPresets().find((p) => p.name === '开发')
  applyPreset(dev)
  saveUi()
  await w(1200)
  return { preset: currentPresetName(), cells: state.grid.cells, saved: !!localStorage.getItem('workbench.ui.v2') }
})()