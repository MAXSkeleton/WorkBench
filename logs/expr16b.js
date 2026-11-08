(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1500)
  const restored = { preset: currentPresetName(), cells: state.grid.cells.map((r) => r.slice()) }
  resetCurrentPreset()
  await w(1200)
  const after = { preset: currentPresetName(), cells: state.grid.cells.map((r) => r.slice()) }
  return { restored, after }
})()