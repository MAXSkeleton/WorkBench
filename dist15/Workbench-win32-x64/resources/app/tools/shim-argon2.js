'use strict'
/**
 * argon2 垫片。
 *
 * 背景：code-server 在 util.js 顶层 `require("argon2")`，而 argon2 是原生模块，
 * 需要 node-pre-gyp 下载预编译二进制。本机网络取不到时，code-server 会启动即崩。
 *
 * 但我们用 `--auth none` 跑本地服务，argon2 的 hash/verify 永远不会被调用。
 * 所以这里：优先用真模块；真模块缺失时退回一个「调用即报错」的替身，
 * 让 require 能通过、进程能起来，且一旦真的用到密码功能会立刻暴露而不是静默错。
 *
 * 用法：node -r ./tools/shim-argon2.js node_modules/code-server/out/node/entry.js ...
 */
const Module = require('module')
const origLoad = Module._load

let real = null
let realError = null
try {
  real = origLoad.call(Module, 'argon2', module, false)
} catch (err) {
  realError = err
}

const stub = {
  hash: async () => {
    throw new Error('argon2 原生模块不可用（垫片生效）：本工作站以 --auth none 运行，无需密码哈希')
  },
  verify: async () => false,
  needsRehash: () => false,
}

if (!real) {
  console.error('[shim-argon2] 真模块不可用，启用替身：' + (realError && realError.message))
}

Module._load = function (request, parent, isMain) {
  if (request === 'argon2') return real || stub
  return origLoad.call(this, request, parent, isMain)
}
