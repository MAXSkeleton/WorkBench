'use strict'
/**
 * preload：渲染层能用的全部能力都在这里白名单登记。
 * 渲染层拿不到 fs / child_process / require。
 */
const { contextBridge, ipcRenderer } = require('electron')

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
  fsRead: (p) => ipcRenderer.invoke('app:fs-read', p),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
})
