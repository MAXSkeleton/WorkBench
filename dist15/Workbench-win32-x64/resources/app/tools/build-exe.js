// 打包成 exe 的构建脚本：node tools/build-exe.js
// 说明：用 @electron/packager 的 API 而不是命令行，避免 Windows 下引号转义的坑。
const path = require('node:path')
const pkg = require('@electron/packager')
const packager = typeof pkg === 'function' ? pkg : pkg.packager || pkg.default

const ROOT = path.join(__dirname, '..')

const opts = {
  dir: ROOT,
  name: 'Workbench',
  platform: 'win32',
  arch: 'x64',
  electronVersion: '33.4.11',
  out: path.join(ROOT, process.argv[2] || 'dist'),
  overwrite: true,
  asar: false,
  prune: true,
  // 不把构建产物、日志、运行期数据、npm 缓存塞进包里
  ignore: [
    /^\/dist\d*($|\/)/,/^\/dist($|\/)/, /^\/logs($|\/)/, /^\/runtime($|\/)/, /^\/\.npm-cache($|\/)/],
  win32metadata: {
    CompanyName: 'workbench',
    FileDescription: '我的工作站',
    ProductName: '我的工作站',
  },
}

Promise.resolve(packager(opts))
  .then((paths) => {
    console.log('打包完成：')
    for (const p of paths) console.log('  ' + p)
  })
  .catch((err) => {
    console.error('打包失败：', err)
    process.exit(1)
  })
