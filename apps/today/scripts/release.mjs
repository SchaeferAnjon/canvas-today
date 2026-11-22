#!/usr/bin/env node
// 画布今日发一个新版本到 GitHub Release（照画布笔记的 scripts/release.mjs）。名字、仓库读 apps/today/brand.json。
// 在公开仓库（brand.json 的 repo，由 apps/today/scripts/public-export.mjs 从私有仓库导出）里跑：tag 和 Release 都在那个仓库。
//   1. 改 apps/today/package.json 的 version，导出、提交，打 tag v<版本>
//   2. node apps/today/scripts/release.mjs（公开仓库里是 pnpm release）：本机打 Mac 的 dmg + zip（arm64 和 x64），钥匙串里的 Developer ID 签名、
//      hardened runtime，不公证（2026-11-22 用户定「Mac App 发版不公证」，第一次打开怎么放行写在 README 和官网）；
//      核对签名、团队、entitlements、版本号、包里的 app-update.yml，用包里的 Electron 从 app.asar 加载 electron-updater；
//      放在 apps/today/release/<版本>/，记下核对过的文件和 SHA-256。要求工作区干净、HEAD 上有 v<版本>。
//      签名证书：CT_SIGN_IDENTITY="名字 (团队号)"；不给就用钥匙串里唯一的那张「Developer ID Application」（团队号不写进仓库）
//      --try：本机试打包，不管工作区干不干净、有没有 tag（这样的包不能 --publish）
//      --arch=arm64：只打一种架构
//   3. 发布说明写在 apps/today/release/<版本>/notes.md（release/ 不进 git），看过没问题：
//      node apps/today/scripts/release.mjs --publish：推送 tag 后，上传第 2 步核对过的那一份，建 Release（不是草稿）
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brand = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'brand.json'), 'utf8'))
const args = process.argv.slice(2)
const publish = args.includes('--publish')
const trial = args.includes('--try')
const archArg = args.find((a) => a.startsWith('--arch='))?.slice(7)
const ARCHS = archArg ? archArg.split(',') : ['arm64', 'x64']
const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'))
const { version } = pkg
const tag = `v${version}`
const out = path.join(APP_DIR, 'release', version)
const notes = path.join(out, 'notes.md')
const checked = path.join(out, 'checked.json')

// stdio: 'inherit' 时 execFileSync 返回 null
const run = (cmd, argv, opts = {}) => (execFileSync(cmd, argv, { cwd: APP_DIR, encoding: 'utf8', maxBuffer: 1 << 26, ...opts }) ?? '').trim()
const fail = (msg) => {
  console.error(`没发：${msg}`)
  process.exit(1)
}
const sha256 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex')

for (const a of ARCHS) if (!['arm64', 'x64'].includes(a)) fail(`不认识的架构 ${a}`)
for (const a of args) if (!['--publish', '--try'].includes(a) && !a.startsWith('--arch=')) fail(`不认识的参数 ${a}`)
const head = run('git', ['rev-parse', 'HEAD'])

if (publish) {
  // 在公开仓库里、代码和 tag 对得上：tag 已经推上去、指着 HEAD，GitHub 上还没有这个 Release；只上传第 2 步核对过的那一份
  const origin = run('git', ['remote', 'get-url', 'origin'])
  if (!origin.replace(/\.git$/, '').endsWith(brand.repo)) fail(`origin 是 ${origin}，不是 ${brand.repo}：要在导出的公开仓库里发`)
  const remoteTag = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}^{}`, `refs/tags/${tag}`])
  if (!remoteTag) fail(`GitHub 上还没有 ${tag}：先 git push origin ${tag}`)
  const tagCommit = remoteTag.split('\n').find((l) => l.endsWith('^{}'))?.split(/\s/)[0] ?? remoteTag.split(/\s/)[0]
  if (tagCommit !== head) fail(`${tag} 指的是 ${tagCommit.slice(0, 7)}，本机 HEAD 是 ${head.slice(0, 7)}`)
  if (spawnSync('gh', ['release', 'view', tag, '--repo', brand.repo]).status === 0) fail(`GitHub 上已经有 ${tag} 的 Release`)
  const prev = fs.existsSync(checked) ? JSON.parse(fs.readFileSync(checked, 'utf8')) : null
  if (prev?.head !== head) fail(`${out} 不是这个提交核对过的：先跑 node apps/today/scripts/release.mjs`)
  if (prev.trial) fail('核对过的那一份是试打包（--try 打的）：去掉 --try 重打')
  if (!fs.existsSync(notes)) fail(`还没写发布说明：${notes}`)
  const files = prev.files.map((f) => path.join(out, f))
  for (const f of files) if (!fs.existsSync(f)) fail(`核对过的文件不见了：${f}`)
  for (const f of files) if (prev.sha256[path.relative(out, f)] !== sha256(f)) fail(`${path.relative(out, f)} 核对后又变了`)
  run('gh', ['release', 'create', tag, '--repo', brand.repo, '--verify-tag', '--title', `${brand.name} ${version}`, '--notes-file', notes, ...files], { stdio: 'inherit' })
  console.log(`已发布 ${tag}：https://github.com/${brand.repo}/releases/tag/${tag}`)
  process.exit(0)
}

// 正式打包要在干净的、打了 tag 的提交上；试打包（--try）不管这些
if (!trial) {
  if (run('git', ['status', '--porcelain'])) fail('工作区有没提交的改动')
  const tagged = spawnSync('git', ['rev-parse', `${tag}^{commit}`], { cwd: APP_DIR, encoding: 'utf8' }).stdout.trim()
  if (tagged !== head) fail(`HEAD 上没有 ${tag}：先 git tag ${tag}`)
}

// 签名证书：钥匙串里的 Developer ID Application（团队号从证书名里读，不写进仓库）
const ids = [...run('security', ['find-identity', '-v', '-p', 'codesigning']).matchAll(/"Developer ID Application: (.+?) \(([A-Z0-9]{10})\)"/g)].map((m) => ({ name: `${m[1]} (${m[2]})`, team: m[2] }))
const want = process.env.CT_SIGN_IDENTITY
const id = want ? ids.find((i) => i.name === want) : ids.length === 1 ? ids[0] : null
if (!id) fail(want ? `钥匙串里没有「Developer ID Application: ${want}」` : ids.length ? `钥匙串里有 ${ids.length} 张 Developer ID Application，用 CT_SIGN_IDENTITY="名字 (团队号)" 指定一张` : '钥匙串里没有 Developer ID Application 证书')
const { team } = id

// 写好的发布说明留着，其余重新来
const keptNotes = fs.existsSync(notes) ? fs.readFileSync(notes) : null
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
if (keptNotes) fs.writeFileSync(notes, keptNotes)

console.log('构建…')
run('npx', ['electron-vite', 'build'], { stdio: 'inherit' })
// 提醒事项小助手（Swift，arm64 + x86_64 一个文件，两种架构的包都放它）
run('node', ['scripts/build-helper.mjs'], { stdio: 'inherit' })
// 签不上 Developer ID 时 electron-builder 默认只打一条警告、照样出包：强制签名，签不上就失败
console.log(`打 Mac 包（Developer ID 签名，不公证，${ARCHS.join(' + ')}，dmg + zip）…`)
const mac = spawnSync('npx', ['electron-builder', '--mac', ...ARCHS.map((a) => `--${a}`), '--config', 'electron-builder.cjs', '--publish', 'never', '-c.forceCodeSigning=true'], {
  cwd: APP_DIR,
  stdio: 'inherit',
  env: { ...process.env, CT_RELEASE: '1', CT_SIGN_IDENTITY: id.name, CT_RELEASE_OUT: path.join(out, 'mac') },
})
if (mac.status !== 0) fail('Mac 包没打成')

// 每个架构的 .app：Developer ID、团队对、hardened runtime、带上 entitlements、版本号对、带着 app-update.yml（装上后查 brand.json 的仓库）
const report = []
for (const arch of ARCHS) {
  const dir = path.join(out, 'mac', arch === 'x64' ? 'mac' : `mac-${arch}`)
  const app = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith('.app'))
  if (!app) fail(`没找到 ${arch} 的 .app（${dir}）`)
  const p = path.join(dir, app)
  const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', p], { encoding: 'utf8' })
  if (verify.status !== 0) fail(`${arch} 的签名校验没过：\n${verify.stderr}`)
  const info = spawnSync('codesign', ['-dvv', p], { encoding: 'utf8' }).stderr
  if (!/Authority=Developer ID Application:/.test(info) || !info.includes(`TeamIdentifier=${team}`)) fail(`${arch} 不是 ${id.name} 签的`)
  if (!/flags=0x10000\(runtime\)/.test(info)) fail(`${arch} 没开 hardened runtime`)
  const ent = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', p], { encoding: 'utf8' }).stdout
  if (!ent.includes('com.apple.security.cs.allow-jit')) fail(`${arch} 的 entitlements 没带上`)
  if (!ent.includes('com.apple.security.personal-information.calendars')) fail(`${arch} 的 entitlements 里没有提醒事项要的 personal-information.calendars`)
  // 提醒事项小助手：在 Contents/MacOS 里，两种架构都有，同一张证书、hardened runtime、带着 personal-information.calendars
  const helper = path.join(p, 'Contents/MacOS/canvas-today-reminders')
  if (!fs.existsSync(helper)) fail(`${arch} 包里没有提醒事项小助手 ${helper}`)
  const helperArchs = run('lipo', ['-archs', helper]).split(/\s+/).sort().join(' ')
  if (helperArchs !== 'arm64 x86_64') fail(`${arch} 包里的提醒事项小助手是 ${helperArchs}`)
  const hInfo = spawnSync('codesign', ['-dvv', helper], { encoding: 'utf8' }).stderr
  if (!/Authority=Developer ID Application:/.test(hInfo) || !hInfo.includes(`TeamIdentifier=${team}`) || !/flags=0x10000\(runtime\)/.test(hInfo)) fail(`${arch} 的提醒事项小助手不是 ${id.name} 签的或没开 hardened runtime`)
  if (!spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', helper], { encoding: 'utf8' }).stdout.includes('com.apple.security.personal-information.calendars')) fail(`${arch} 的提醒事项小助手没带 personal-information.calendars`)
  const plist = fs.readFileSync(path.join(p, 'Contents/Info.plist'), 'utf8')
  for (const k of ['NSRemindersFullAccessUsageDescription', 'NSRemindersUsageDescription', 'NSCalendarsFullAccessUsageDescription']) if (!plist.includes(`<key>${k}</key>`)) fail(`${arch} 的 Info.plist 里没有 ${k}`)
  if (!fs.readFileSync(path.join(p, 'Contents/Resources/zh_CN.lproj/InfoPlist.strings'), 'utf8').includes('NSRemindersFullAccessUsageDescription')) fail(`${arch} 包里没有中文的权限说明`)
  const key = (k) => plist.match(new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`))?.[1]
  if (key('CFBundleShortVersionString') !== version) fail(`${arch} 的版本号是 ${key('CFBundleShortVersionString')}，不是 ${version}`)
  if (key('CFBundleIdentifier') !== brand.appId) fail(`${arch} 的 Bundle ID 是 ${key('CFBundleIdentifier')}`)
  const yml = path.join(p, 'Contents/Resources/app-update.yml')
  const [owner, repo] = brand.repo.split('/')
  if (!fs.existsSync(yml)) fail(`${arch} 包里没有 app-update.yml（装上后不会检查更新）`)
  const ytext = fs.readFileSync(yml, 'utf8')
  if (!ytext.includes('provider: github') || !ytext.includes(`owner: ${owner}`) || !ytext.includes(`repo: ${repo}`)) fail(`${arch} 的 app-update.yml 不是查 ${brand.repo}：\n${ytext}`)
  // electron-builder 漏收间接依赖时不报错（画布笔记、MeetCaption 踩过）：用包里的 Electron 当 Node 跑，从 app.asar 里加载每个运行时依赖
  if (arch === process.arch) {
    const exe = path.join(p, 'Contents/MacOS', brand.name)
    const asar = path.join(p, 'Contents/Resources/app.asar')
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      const r = spawnSync(exe, ['-e', `require(${JSON.stringify(path.join(asar, 'node_modules', dep))})`], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 60_000 })
      if (r.status !== 0) fail(`${arch} 的 app.asar 里加载不了 ${dep}：\n${r.stderr}`)
    }
  }
  const spctl = spawnSync('spctl', ['-a', '-vv', '-t', 'exec', p], { encoding: 'utf8' })
  report.push(`${arch}: ${info.match(/Authority=Developer ID Application:[^\n]*/)[0]}，hardened runtime，版本 ${version}，Gatekeeper：${(spctl.stderr || spctl.stdout).trim().split('\n').join(' ')}`)
}

const files = []
const need = (re, label) => {
  const dir = path.join(out, 'mac')
  const hit = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
  if (hit.length < ARCHS.length) fail(`少了${label}（${dir}）`)
  files.push(...hit)
  return hit
}
const archRe = `(${ARCHS.join('|')})`
const dmgs = need(new RegExp(`^${brand.artifact}-${version}-mac-${archRe}\\.dmg$`), ' dmg')
need(new RegExp(`^${brand.artifact}-${version}-mac-${archRe}\\.zip$`), ' zip')
// 检查更新要的：latest-mac.yml（写着这一版每个架构的 zip）和 zip 的 blockmap（只下改了的块）
need(new RegExp(`^${brand.artifact}-${version}-mac-${archRe}\\.zip\\.blockmap$`), ' zip.blockmap')
{
  const yml = path.join(out, 'mac', 'latest-mac.yml')
  if (!fs.existsSync(yml)) fail(`少了 latest-mac.yml（${path.dirname(yml)}）`)
  const text = fs.readFileSync(yml, 'utf8')
  if (!text.includes(`version: ${version}`)) fail(`latest-mac.yml 里的版本不是 ${version}`)
  for (const a of ARCHS) if (!text.includes(`${brand.artifact}-${version}-mac-${a}.zip`)) fail(`latest-mac.yml 里没有 ${a} 的 zip`)
  files.push(yml)
}

// 不带版本号的拷贝：README、官网和总站链到 releases/latest/download/<文件名>，点一下就开始下载
for (const f of dmgs) {
  const stable = path.join(out, path.basename(f).replace(`-${version}`, ''))
  fs.copyFileSync(f, stable)
  files.push(stable)
}
const sums = files.map((f) => `${sha256(f)}  ${path.basename(f)}`)
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
files.push(path.join(out, 'SHA256SUMS.txt'))
fs.writeFileSync(
  checked,
  JSON.stringify({ head, version, trial, archs: ARCHS, files: files.map((f) => path.relative(out, f)), sha256: Object.fromEntries(files.map((f) => [path.relative(out, f), sha256(f)])), report }, null, 1),
)

console.log(`\n${report.join('\n')}`)
console.log(`\n${tag} 要上传的文件（${out}）：`)
for (const f of files) console.log(`  ${path.relative(out, f)}  ${(fs.statSync(f).size / 1e6).toFixed(1)} MB`)
console.log(
  trial
    ? '\n试打包（--try），没公证：这一份只能本机试，不能 --publish'
    : `\n核对过了（没公证），还没上传。发布说明写在 ${notes}，推送 tag 后：node apps/today/scripts/release.mjs --publish`,
)
