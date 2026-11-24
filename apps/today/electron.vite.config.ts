import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

// 和画布笔记同一套构建：依赖都写在 devDependencies，打进包里；workspace 里的 @cn/* 是 TS 源码，也打包。
// 窗口背景照片和画布笔记共用一份（不复制），从画布笔记的 assets 里拿：@notes-assets；引擎标志在 AI 对话框的共用包里（ParaRead 联动）：@ai-chat-assets
const notesAssets = resolve(__dirname, '../notes/src/renderer/assets')
const aiChatAssets = resolve(__dirname, '../../packages/ai-chat/src/assets')

export default defineConfig({
  main: { build: { externalizeDeps: true } },
  preload: { build: { externalizeDeps: false } },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@notes-assets': notesAssets, '@ai-chat-assets': aiChatAssets } },
    // 主窗口、菜单栏小窗、全局快速加一条的小框
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html'), tray: resolve(__dirname, 'src/renderer/tray.html'), quick: resolve(__dirname, 'src/renderer/quick.html') } } },
  },
})
