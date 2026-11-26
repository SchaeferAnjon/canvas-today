# @cn/web-session

内置浏览器的登录：从 Chrome 导入登录、登录分区留得住、退出前写盘。画布笔记在用，画布订阅接上时直接用这一份（用户定「修一次两边都好」）。只用 Electron 主进程的 `Session`，由调的人传进来；包里不引 `electron`，接口只写用到的几样（同 `@cn/quit-fast`）。

## 接口

```ts
import { importChromeLogin, keepLogins, flushLogins, listChromeProfiles } from '@cn/web-session'

const web = session.fromPartition('persist:web')
keepLogins(web)                                   // app ready 后叫一次；分区不持久（名字没有 persist:）时报错
await listChromeProfiles(root?)                   // Chrome 有哪几个用户（root 默认本机的 Chrome 目录）
await importChromeLogin(web, profileId, { root?, password? })  // 返回 { imported, expired, skipped, sites }（sites：导进来的网站，排好序）
await flushLogins([session.defaultSession, web])  // 退出前，cookie 最多等 1.5 秒（就是 @cn/quit-fast 的 flushSessions）
```

- `keepLogins`：网站设下的会话 cookie（没有过期时间）改写成带 `SESSION_DAYS`（400）天过期时间的同一个，网站删掉、改掉照常跟着变；cookie 一变 `FLUSH_MS`（500 毫秒）内写一次盘，一直在变也每 500 毫秒写一次。
- `importChromeLogin`：Chrome 里的会话 cookie 导进来也带上 400 天的过期时间；导完马上写盘。
- 过期时间怎么定：会话 cookie 本来是「关了浏览器就失效」，Chrome 开着「继续浏览上次打开的网页」时一直留着，用户在 Chrome 里的感受是一直登录着。这里给 400 天，是 Chrome 允许 cookie 活的最长时间（RFC 6265bis 的上限）；网站自己删掉、换掉时照常跟着变，所以实际活多久由网站定。
- 测试：`root` 指到假的 Chrome 目录，`password` 直接给解 cookie 的密码（不问钥匙串）。

## 为什么

内置浏览器的登录以前三处会丢（ui-b A11，用户「网页里经常要点导入 Chrome 登录」）：

1. 会话 cookie Electron 不写盘，退出就没了（Electron 文档 `cookies.set`：省掉 `expirationDate` 就是会话 cookie）。Chrome 开着「继续浏览上次打开的网页」会把它存下来，用户在 Chrome 里一直是登录着的。
2. Chromium 攒着 cookie 改动约 30 秒才写一次盘：强杀、崩溃、装更新重启（画布笔记的退出流程在更新、没开库时不走退出前写盘那一步）丢掉刚登录、刚换过的 cookie；会换 token 的网站（Google 这类）见到旧的会整个登出。修前 e2e：登录 1.5 秒后强杀，重开「没登录」。
3. 分区名不带 `persist:` 是内存分区，什么都不落盘：`keepLogins` 报错，不悄悄放过。

管不了的：Chrome 里的 Google 账号是设备绑定的登录（Chrome 用户目录里有 `Device Bound Sessions`，cookie 里有 `__Secure-1PSIDRTS`），拷出来的 cookie 过一阵会被 Google 判作失效。Google、YouTube 要长期登录，在内置浏览器里直接登一次，那是它自己的登录，由上面两条留住。

测试：单元测试 `test/`；真的 Electron 分区在 `apps/notes/e2e/uib-web-login.spec.ts`（本机假网站发持久 cookie 和会话 cookie，正常退出重开、强杀重开、Chrome 导入后强杀重开）。
