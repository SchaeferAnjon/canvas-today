import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

// 和画布笔记同一套构建：依赖都写在 devDependencies，打进包里；workspace 里的 @cn/* 是 TS 源码，也打包。
// 窗口背景照片、引擎标志这些图和画布笔记共用一份（不复制），从画布笔记的 assets 里拿：@notes-assets
const notesAssets = resolve(__dirname, '../notes/src/renderer/assets')

export default defineConfig({
  main: { build: { externalizeDeps: true } },
  preload: { build: { externalizeDeps: false } },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@notes-assets': notesAssets } },
    // 主窗口和菜单栏小窗
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html'), tray: resolve(__dirname, 'src/renderer/tray.html') } } },
  },
})
