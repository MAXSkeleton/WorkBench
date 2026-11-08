'use strict'
/**
 * preload：渲染层能用的全部能力都在这里白名单登记。
 * 渲染层拿不到 fs / child_process / require。
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('app', {
  // 场景
  scenario: (id) => ipcRenderer.invoke('app:scenario', id),
  // 启动流程
  start: (id) => ipcRenderer.invoke('app:start', id),
  engineUrl: () => ipcRenderer.invoke('app:engine-url'),
  vscodeStatus: () => ipcRenderer.invoke('app:vscode-status'),
  boot: () => ipcRenderer.invoke('app:boot'),
  onBoot: (fn) => {
    const h = (_e, s) => fn(s)
    ipcRenderer.on('app:boot', h)
    return () => ipcRenderer.removeListener('app:boot', h)
  },
  // 本地 app
  launch: (key, scenarioId) => ipcRenderer.invoke('app:launch', key, scenarioId),
  // 文件
  fsList: (dir) => ipcRenderer.invoke('app:fs-list', dir),
  fsRoots: () => ipcRenderer.invoke('app:fs-roots'),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file) } catch (e) { return (file && file.path) || '' } },
  pickFile: () => ipcRenderer.invoke('app:pick-file'),
  preview: (p) => ipcRenderer.invoke('app:preview', p),
  sysStats: () => ipcRenderer.invoke('app:sys-stats'),
  noteSave: (p, text) => ipcRenderer.invoke('app:note-save', p, text),
  openPath: (p) => ipcRenderer.invoke('app:open-path', p),
  promptText: (title, def) => ipcRenderer.invoke('app:prompt', title, def),
  fsRead: (p) => ipcRenderer.invoke('app:fs-read', p),
  dock: (scenarioId, key, rect) => ipcRenderer.invoke('app:dock', scenarioId, key, rect),
  moveDock: (key, rect) => ipcRenderer.invoke('app:move-dock', key, rect),
  undock: (key) => ipcRenderer.invoke('app:undock', key),
  dockList: () => ipcRenderer.invoke('app:dock-list'),
  onReflow: (fn) => {
    const h = () => fn()
    ipcRenderer.on('app:reflow', h)
    return () => ipcRenderer.removeListener('app:reflow', h)
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
})
