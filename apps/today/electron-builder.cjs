// electron-builder 配置（照画布笔记 apps/notes/electron-builder.cjs）。名字、Bundle ID、仓库读 brand.json（只写那一处）。
// 两种用法：
//   pnpm --filter @cn/today dist:mac   本机自己用：本地签名（不用开发者证书）、不公证，只出 release/mac-arm64/Canvas Today.app
//   CT_RELEASE=1（scripts/release.mjs 设的）   发布：钥匙串里的 Developer ID 签名（CT_SIGN_IDENTITY，发版脚本从钥匙串找）、
//                                             hardened runtime、dmg + zip，不公证；包里带 app-update.yml，装上后会检查更新
// 依赖只有 electron-updater 写在 dependencies（检查更新时才加载），别的都写在 devDependencies，构建时已经打进 out/。
const brand = require('./brand.json')

const release = process.env.CT_RELEASE === '1'
if (release && !process.env.CT_SIGN_IDENTITY) throw new Error('发布包要 CT_SIGN_IDENTITY（scripts/release.mjs 从钥匙串里找 Developer ID Application 后设好）')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: brand.appId,
  productName: brand.name,
  artifactName: `${brand.artifact}-\${version}-\${os}-\${arch}.\${ext}`,
  copyright: `Copyright © ${brand.year} ${brand.author}`,
  directories: { output: process.env.CT_RELEASE_OUT || 'release', buildResources: 'build' },
  files: ['out/**', 'package.json', '!**/*.map'],
  // canvas-today://task/<🆔>：画布笔记、通知、系统提醒事项里的链接回到画布今日的那一条
  protocols: [{ name: brand.name, schemes: [brand.scheme] }],
  // 检查更新（src/main/index.ts 的 setupUpdater）查这个仓库 Release 里的 latest-mac.yml。只有发布包写 publish：
  // 打包时会把 app-update.yml 放进包里，软件看到它才查更新；本机自己打的包没有它，不查。Release 由 scripts/release.mjs --publish 用 gh 建
  publish: release ? { provider: 'github', owner: brand.repo.split('/')[0], repo: brand.repo.split('/')[1], releaseType: 'release' } : null,
  mac: {
    category: 'public.app-category.productivity',
    // 应用图标「今日一页」：scripts/make-icons.mjs 从 design/today/icon/ 生成
    icon: 'build/icon.icns',
    target: release ? ['dmg', 'zip'] : 'dir',
    identity: release ? process.env.CT_SIGN_IDENTITY : '-',
    hardenedRuntime: release,
    gatekeeperAssess: false,
    entitlements: release ? 'build/entitlements.mac.plist' : undefined,
    entitlementsInherit: release ? 'build/entitlements.mac.plist' : undefined,
    notarize: false,
    minimumSystemVersion: '12.0',
    extendInfo: {
      CFBundleDisplayName: brand.name,
      // 到点提醒要带按钮（勾掉、推迟），通知得是「提醒」样式
      NSUserNotificationAlertStyle: 'alert',
    },
  },
  dmg: { title: `${brand.name} \${version}` },
}
