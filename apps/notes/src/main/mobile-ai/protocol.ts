/**
 * iPhone / iPad 用这台 Mac 的 AI（task-wwqf0）：两边说话的规矩。纯函数，只用 Node 的 crypto，不碰 Electron；
 * iOS 那边照这里一比一写在 apps/apple/CanvasCore/Sources/CanvasCore/AI/MobileAIProtocol.swift（CryptoKit），
 * 两边算的结果用 apps/apple/test/ai-fixtures.test.ts 导出的同一批样例对照。
 *
 * 配对（扫 Mac 设置里的二维码一次）：
 *   二维码是一个链接 canvas-notes://pair?v=1&id=<Mac 编号>&k=<Mac 的公钥>&c=<一次性配对码>&n=<Mac 的名字>&p=<端口>&a=<地址,地址>
 *   iPad 现生一对 X25519 钥匙，和 Mac 的公钥算出共享的秘密；配对钥匙 = HKDF(共享秘密, 盐 = 配对码, "canvasnotes/pair/v1")。
 *   POST /v1/pair 送上 { 设备编号, 名字, 设备公钥, proof = HMAC(配对钥匙, "pair\n编号\n名字") }。
 *   Mac 用自己的私钥和当时的配对码算一遍，对得上才收下：设备钥匙 = HKDF(共享秘密, 盐 = 配对码, "canvasnotes/device/v1")，
 *   回 { Mac 编号, 名字, proof = HMAC(设备钥匙, "paired\n编号") }，iPad 对得上才存。配对码用一次就作废，十分钟没用也作废。
 *   中间有人截下这一来一回也没用：没有配对码（只在 Mac 屏幕上）算不出配对钥匙，没有 Mac 的私钥算不出共享秘密。
 *
 * 之后每一问：
 *   头上 X-CN-Device（设备编号）、X-CN-Time（毫秒）、X-CN-Nonce（12 字节随机）、X-CN-Sign = HMAC(签名钥匙, 规范串)；
 *   规范串 = "CN1\n方法\n路径\n设备编号\n时间\nnonce\nsha256(请求体) 的十六进制"。
 *   请求体是封好的 JSON（AES-256-GCM，请求钥匙；Electron 的 BoringSSL 没有 ChaCha20-Poly1305）；回答一行一帧，每帧也封好（回答钥匙，附带数据 = 这一问的 nonce，
 *   旧回答挪不到新一问上）。签名钥匙、请求钥匙、回答钥匙都从设备钥匙用 HKDF 分出来。
 *   时间差两分钟以上、nonce 五分钟内用过、签名不对、设备没配对过：一律 401，不说是哪一样不对。
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, type KeyObject, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FullNo } from './danger'

/** Bonjour 服务类型（iOS 的 Info.plist 里 NSBonjourServices 写的同一个） */
export const SERVICE_TYPE = '_canvasnotes._tcp'
export const PROTO_VERSION = 1
/** 配对码多久作废 */
export const CODE_TTL_MS = 10 * 60_000
/** 请求上的时间和 Mac 差多少还认 */
export const CLOCK_SKEW_MS = 2 * 60_000
/** 用过的 nonce 记多久（比时间差的窗口长） */
export const NONCE_TTL_MS = 5 * 60_000

export const b64u = (b: Uint8Array): string => Buffer.from(b).toString('base64url')
export const unb64u = (s: string): Buffer => Buffer.from(s, 'base64url')
const utf8 = (s: string) => Buffer.from(s, 'utf8')

export function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, length = 32): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, utf8(info), length))
}

export function hmac(key: Uint8Array, data: string | Uint8Array): Buffer {
  return createHmac('sha256', key).update(typeof data === 'string' ? utf8(data) : data).digest()
}

export const sha256hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

/** 一样长才比，比的时候不提前退出 */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------------------------------------------------------------- X25519

export interface KeyPair {
  /** 32 字节原样，base64url */
  pub: string
  priv: string
}

export function newKeyPair(): KeyPair {
  const { privateKey } = generateKeyPairSync('x25519')
  const j = privateKey.export({ format: 'jwk' }) as { x: string; d: string }
  return { pub: j.x, priv: j.d }
}

function privKey(k: KeyPair): KeyObject {
  return createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d: k.priv, x: k.pub }, format: 'jwk' })
}

function pubKey(x: string): KeyObject {
  if (unb64u(x).length !== 32) throw new Error('公钥不对')
  return createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x }, format: 'jwk' })
}

/** 共享秘密（32 字节）；对方的公钥不对（全零这种）时抛错 */
export function sharedSecret(mine: KeyPair, theirPub: string): Buffer {
  return diffieHellman({ privateKey: privKey(mine), publicKey: pubKey(theirPub) })
}

// ---------------------------------------------------------------- 配对

const INFO_PAIR = 'canvasnotes/pair/v1'
const INFO_DEVICE = 'canvasnotes/device/v1'
const INFO_SIGN = 'canvasnotes/sign/v1'
const INFO_REQ = 'canvasnotes/req/v1'
const INFO_RES = 'canvasnotes/res/v1'

export const pairKeyOf = (shared: Uint8Array, code: Uint8Array) => hkdf(shared, code, INFO_PAIR)
export const deviceSecretOf = (shared: Uint8Array, code: Uint8Array) => hkdf(shared, code, INFO_DEVICE)

/** 设备那一问的证明：用配对钥匙签「pair\n编号\n名字」 */
export const pairProof = (pairKey: Uint8Array, device: string, name: string) => hmac(pairKey, `pair\n${device}\n${name}`)
/** Mac 回的证明：用设备钥匙签「paired\n编号」（证明 Mac 有私钥、算出了同一个设备钥匙） */
export const pairedProof = (secret: Uint8Array, device: string) => hmac(secret, `paired\n${device}`)

/** 二维码里的东西 */
export interface PairLink {
  v: number
  /** Mac 的编号（Bonjour 的 TXT 里也写它，iPad 认的是它，不是名字） */
  id: string
  /** Mac 的公钥 */
  key: string
  /** 一次性配对码（16 字节，base64url） */
  code: string
  name: string
  port: number
  /** 这台 Mac 现在的局域网地址（Bonjour 找不到时直接连） */
  addrs: string[]
}

export const PAIR_PREFIX = 'canvas-notes://pair?'

export function pairLink(l: PairLink): string {
  const q = new URLSearchParams({ v: String(l.v), id: l.id, k: l.key, c: l.code, n: l.name, p: String(l.port), a: l.addrs.join(',') })
  return PAIR_PREFIX + q.toString()
}

export function parsePairLink(s: string): PairLink {
  const t = s.trim()
  if (!t.startsWith(PAIR_PREFIX)) throw new Error('这不是画布笔记的配对码')
  const q = new URLSearchParams(t.slice(PAIR_PREFIX.length))
  const v = Number(q.get('v'))
  const port = Number(q.get('p'))
  const id = q.get('id') ?? ''
  const key = q.get('k') ?? ''
  const code = q.get('c') ?? ''
  if (v !== PROTO_VERSION) throw new Error('配对码的版本对不上：两边都更新到最新版再扫')
  if (!/^[\w-]{6,40}$/.test(id) || unb64u(key).length !== 32 || unb64u(code).length !== 16 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('配对码不全')
  return { v, id, key, code, name: q.get('n') ?? '', port, addrs: (q.get('a') ?? '').split(',').filter(Boolean) }
}

// ---------------------------------------------------------------- 每一问

/** 设备钥匙分出来的三把：签名、封请求、封回答 */
export interface SessionKeys {
  sign: Buffer
  req: Buffer
  res: Buffer
}

export function sessionKeys(secret: Uint8Array): SessionKeys {
  const none = new Uint8Array(0)
  return { sign: hkdf(secret, none, INFO_SIGN), req: hkdf(secret, none, INFO_REQ), res: hkdf(secret, none, INFO_RES) }
}

export interface SignedHead {
  device: string
  time: number
  nonce: string
}

export function canonical(method: string, path: string, h: SignedHead, body: string | Uint8Array): string {
  return `CN1\n${method.toUpperCase()}\n${path}\n${h.device}\n${h.time}\n${h.nonce}\n${sha256hex(body)}`
}

export const signRequest = (keys: SessionKeys, method: string, path: string, h: SignedHead, body: string | Uint8Array) => b64u(hmac(keys.sign, canonical(method, path, h, body)))

export function verifySignature(keys: SessionKeys, method: string, path: string, h: SignedHead, body: string | Uint8Array, sign: string): boolean {
  return sameBytes(hmac(keys.sign, canonical(method, path, h, body)), unb64u(sign))
}

/** 封一段：nonce(12) + 密文 + 校验(16)，base64url；aad 是附带数据（回答帧带这一问的 nonce） */
export function seal(key: Uint8Array, plain: string, aad = '', nonce: Uint8Array = randomBytes(12)): string {
  const c = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
  const p = utf8(plain)
  c.setAAD(utf8(aad), { plaintextLength: p.length })
  const body = Buffer.concat([c.update(p), c.final()])
  return b64u(Buffer.concat([nonce, body, c.getAuthTag()]))
}

/** 打开一段；对不上（钥匙不对、被改过、aad 不对）抛错 */
export function open(key: Uint8Array, sealed: string, aad = ''): string {
  const all = unb64u(sealed)
  if (all.length < 28) throw new Error('封好的数据太短')
  const d = createDecipheriv('aes-256-gcm', key, all.subarray(0, 12), { authTagLength: 16 })
  const ct = all.subarray(12, all.length - 16)
  d.setAAD(utf8(aad), { plaintextLength: ct.length })
  d.setAuthTag(all.subarray(all.length - 16))
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

/** 回答的一帧（封之前）。i 从 0 数，iPad 认顺序；最后一帧是 done 或 error */
export type Frame =
  /**
   * mode（手机全能模式）：这一问按哪种答。full：和 Mac 右栏全能模式一样能动手；read：只读库。手机要了全能模式却答成只读时 why 写为什么
   * （这台设备在 Mac 设置里关了、Mac 上用的不是 Claude Code、库没开），no 是挡在哪一道（danger.ts 的 FullNo，新的手机照它自己写）。旧的 Mac 不带 mode，手机当只读
   */
  | { t: 'meta'; i: number; mac: string; engine: string; label: string; mode?: 'full' | 'read'; why?: string; no?: FullNo }
  | { t: 'text'; i: number; d: string }
  /**
   * 全能模式的一步（和 Mac 右栏的步骤行同一个说法）：run 在做、ok 做完、err 没做成（detail 是原因）、ask 在等手机点头（yes 是「可以，删除」那颗的字）。
   * 同一个 id 的后一帧换掉前一帧
   */
  | { t: 'step'; i: number; id: string; label: string; code?: string; status: 'run' | 'ok' | 'err' | 'ask'; detail?: string; yes?: string }
  /** 这一轮改了的库里文件、提交成的那一次（撤回就是撤这一次）；提交没成时 failed 是原因 */
  | { t: 'changed'; i: number; commit: string | null; files: { path: string; kind: string }[]; failed?: string }
  | { t: 'done'; i: number }
  | { t: 'error'; i: number; message: string }
  /**
   * omni：Mac 右栏现在开没开全能模式（手机默认跟它）；full：这台设备能不能用全能模式（Mac 设置里能单独关）；
   * no：这台设备现在要全能模式会被挡在哪一道（没挡不带；和真问时同一个判断）。旧的 Mac 三样都不带（手机写「Mac 上的画布笔记太旧」）
   */
  | { t: 'hello'; i: number; mac: string; engine: string; label: string; vault: boolean; note: string; omni?: boolean; full?: boolean; no?: FullNo }
  /** 点头（POST /v1/confirm）、撤回（POST /v1/undo）、请 Mac 打开全能模式（POST /v1/want-full，already：本来就能用）的回话 */
  | { t: 'ok'; i: number; commit?: string | null; already?: boolean }

// ---------------------------------------------------------------- 只认局域网

/**
 * 对方地址是不是这台 Mac 自己、局域网、Tailscale：127/8、10/8、172.16/12、192.168/16、169.254/16、100.64/10（Tailscale 用的那一段）、
 * IPv6 的 ::1、fc00::/7、fe80::/10；「::ffff:192.168.1.5」这种按里面的 IPv4 算。别的一律不认
 */
export function isLocalAddress(addr: string | undefined): boolean {
  if (!addr) return false
  let a = addr.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  if (mapped) a = mapped[1]!
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a)
  if (v4) {
    const [x, y] = [Number(v4[1]), Number(v4[2])]
    return x === 127 || x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127)
  }
  const zone = a.indexOf('%')
  if (zone !== -1) a = a.slice(0, zone)
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a)
}
