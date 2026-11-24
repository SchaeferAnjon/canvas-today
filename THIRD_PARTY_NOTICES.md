# 第三方声明

Canvas Today（画布今日）本身按 GPL-3.0-or-later 授权（见 `LICENSE`），Copyright © 2026 Jia Zonghan。下面是随包分发的别人的东西和拷来的代码，各自的许可证都和 GPL-3.0 兼容（MIT、ISC、BlueOak-1.0.0、Python-2.0、CC0、CC BY 4.0）。

## Canvas Notes（画布笔记）

`packages/` 和 `apps/notes/` 里的文件来自同一作者的 Canvas Notes（https://github.com/SchaeferAnjon/canvas-notes ），同为 GPL-3.0-or-later。`packages/design/src/tokens.css` 的起点拷自同一作者的 MeetCaption（https://github.com/SchaeferAnjon/meetcaption ，GPL-3.0-or-later）。

## Codicons

界面图标用的是 VS Code 的图标库 Codicons（@vscode/codicons 0.0.45，https://github.com/microsoft/vscode-codicons ），© Microsoft Corporation，按 Creative Commons Attribution 4.0 International（CC BY 4.0，https://creativecommons.org/licenses/by/4.0/ ）授权。用到的图标原样拷进 `packages/design/src/codicons.gen.ts`，没有改动图形。CC BY 4.0 允许再分发和改编，只要署名，和 GPL-3.0 一起分发没有冲突。

## 窗口背景照片

`apps/notes/src/renderer/assets/covers/` 里的两张照片来自 Wikimedia Commons，都是 CC0（公有领域），缩到 1800 宽重新压缩过：

| 文件 | 原图 | 作者 |
|---|---|---|
| aurora.jpg | https://commons.wikimedia.org/wiki/File:Northern_Lights_above_Iceland_(Unsplash).jpg | Vincent Guth |
| ice-cave.jpg | https://commons.wikimedia.org/wiki/File:Glacier-cave-man-iceland_(Unsplash).jpg | Davide Cantelli |

## Claude 的标志

右边图标栏「AI（以后）」那一格的 Claude 标志（`packages/ai-chat/src/assets/engine-logos/claude.svg`）取自 LobeHub Icons（https://github.com/lobehub/lobe-icons ，MIT，版权 (c) LobeHub）。标志本身是 Anthropic 的商标，这里只用来标明那一格以后接的是哪家的命令行。

## 随包分发的库（许可证按 `pnpm licenses list --prod` 核过，2026-11-22）

构建时打进 JavaScript 的：

| 库 | 许可证 |
|---|---|
| Electron 45（含 Chromium，许可证在包里的 `LICENSES.chromium.html`） | MIT |
| React、react-dom、scheduler | MIT |
| node-diff3（撤销时的三方合并） | MIT |

检查更新用的 electron-updater 写在 `apps/today/package.json` 的 dependencies 里，连同它的依赖原样放进包里的 `app.asar`：

| 库 | 许可证 |
|---|---|
| electron-updater、builder-util-runtime、debug、fs-extra、js-yaml、jsonfile、lazy-val、lodash.escaperegexp、lodash.isequal、ms、tiny-typed-emitter、universalify | MIT |
| semver | ISC |
| graceful-fs、sax | BlueOak-1.0.0 |
| argparse | Python-2.0 |

只在构建、测试时用、不进包的工具（electron-builder、electron-vite、Vite、TypeScript、Vitest、Playwright 等）不影响发布出去的软件。
