import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx', 'apps/*/test/**/*.test.ts', 'apps/*/test/**/*.test.tsx', 'scripts/test/**/*.test.ts'],
    // 默认 5 秒是照空闲的机器定的。这台 Mac 常有几条线同时跑（负载 60–200，14 核），起子进程（git、假的 claude）、
    // 扫全部源码（i18n）、穷举光标位置（hidden-syntax）的测试慢 3–5 倍，空闲时 1–3 秒的一条会超 5 秒
    // （2026-11-24 全量里每遍挂 3–4 条，都是超时、单跑过）。这些测试不会卡住不动，超时只用来抓卡死的：给 30 秒。
    // 自己知道要更久的（search-model、dream-night）照旧写在测试上
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
