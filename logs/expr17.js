(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms))
  await w(1500)
  const start = state.grid.cells.map((r) => r.slice())
  addWindow('note')
  await w(900)
  const added = state.grid.cells.map((r) => r.slice())
  resetCurrentPreset()
  await w(900)
  const reset = state.grid.cells.map((r) => r.slice())
  return { preset: currentPresetName(), start, added, reset }
})()