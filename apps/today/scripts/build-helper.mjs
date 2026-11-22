#!/usr/bin/env node
// 编提醒事项小助手（native/reminders，Swift）：发布版、arm64 + x86_64 一个文件（打包时两种架构的 .app 都放它）。
// 出来的在 native/reminders/.build/apple/Products/Release/canvas-today-reminders：
//   electron-builder.cjs 把它放进 Canvas Today.app/Contents/MacOS；e2e（e2e/app.ts）用它的 --memory 假提醒事项。
// 要装 Xcode（swift build --arch 两种架构要它）。没改过源码时 swift build 只查一遍，几秒。
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '../native/reminders')
export const HELPER = join(pkg, '.build/apple/Products/Release/canvas-today-reminders')

execFileSync('swift', ['build', '-c', 'release', '--arch', 'arm64', '--arch', 'x86_64', '--package-path', pkg], { stdio: 'inherit', timeout: 15 * 60_000 })
if (!existsSync(HELPER)) throw new Error(`编完了却没有 ${HELPER}`)
const archs = execFileSync('lipo', ['-archs', HELPER], { encoding: 'utf8' }).trim().split(/\s+/).sort()
if (archs.join(' ') !== 'arm64 x86_64') throw new Error(`小助手的架构是 ${archs.join(' ')}，要 arm64 和 x86_64 都有`)
// 先签一个本机签名：打包时 electron-builder 按名字先签 Contents/MacOS/Canvas Today，那时同一个文件夹里的小助手要已经签过（不然 codesign 报
// 「In subcomponent: … canvas-today-reminders」）；发布包接着照 electron-builder.cjs 的 mac.binaries 用 Developer ID 重签它
execFileSync('codesign', ['--sign', '-', '--force', HELPER], { stdio: 'inherit' })
console.log(`提醒事项小助手：${HELPER}（${archs.join(' + ')}）`)
