/**
 * API Key 和本机模型（task-587os 收口第 2 条）：Key 存在哪、验过没有、拉到哪些模型；Ollama、LM Studio 开没开；软件自带的 OpenCode 在哪。
 * Key 用 Electron safeStorage 加密（加密钥匙在这台 Mac 的钥匙串里「Canvas Notes Safe Storage」），密文在 userData/ai/keys.json，
 * 不进库、不进 Git、不发给我们；界面只拿得到最后 4 位。测试实例（CN_E2E=1）只放内存，不碰真的钥匙串。
 * 拉到的模型（不是秘密）记在 userData/ai/sources.json，菜单直接用。
 */
import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { atomicWriteSync } from '@cn/atomic'
import { dirname, join } from 'node:path'
import type { EngineId } from '../../shared/agent'
import type { ModelOption } from '@cn/ai-engines/shared'
import { API_IDS, type ApiId, isApi, isLocal, LOCAL_IDS, type LocalId, type SourceState } from '@cn/ai-engines/shared'
import { t } from '../../shared/i18n'
import { E2E } from '../test-mode'
import { findCli, KeyStore, type LocalFound, localModels, probeLocal, verifyKey } from '@cn/ai-engines'

interface Saved {
  api: Partial<Record<ApiId, { models: ModelOption[]; at: number }>>
}

let dir = ''
let keys: KeyStore
let saved: Saved = { api: {} }
const local: Partial<Record<LocalId, LocalFound>> = {}
let probing: Promise<void> | null = null

function load(): Saved {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8')) as Partial<Saved>
    return { api: raw.api && typeof raw.api === 'object' ? raw.api : {} }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return { api: {} }
    throw e
  }
}

function save() {
  const p = join(dir, 'sources.json')
  mkdirSync(dirname(p), { recursive: true })
  atomicWriteSync(p, JSON.stringify(saved))
}

export function initSources(aiDir: string) {
  dir = aiDir
  keys = E2E
    ? new KeyStore(null, null)
    : new KeyStore(join(aiDir, 'keys.json'), {
        encrypt: (s) => {
          if (!safeStorage.isEncryptionAvailable()) throw new Error(t('这台Mac的钥匙串现在用不了，Key没存'))
          return safeStorage.encryptString(s)
        },
        decrypt: (b) => safeStorage.decryptString(b),
      })
  saved = E2E ? { api: {} } : load()
}

/** 这一家的 Key（真要问的时候才解密） */
export const apiKey = (id: ApiId): string | undefined => keys.get(id)
/** Key 的最后 4 位（不解密） */
export const apiKeyTail = (id: ApiId): string | undefined => keys.tail(id)

/** 验 Key：认了存进钥匙串、记下模型；不认抛一句人话（Key 不存） */
export async function setKey(id: ApiId, raw: unknown): Promise<ModelOption[]> {
  if (!isApi(id)) throw new Error('没有这一家')
  const key = typeof raw === 'string' ? raw.trim().replace(/^["'`]|["'`]$/g, '').replace(/^Bearer\s+/i, '') : ''
  if (key.length < 8 || key.length > 400 || /\s/.test(key)) throw new Error(t('这不像一把API Key：粘贴完整的一串，不带空格'))
  const models = await verifyKey(id, key)
  keys.set(id, key)
  saved.api[id] = { models, at: Date.now() }
  if (!E2E) save()
  return models
}

export function removeKey(id: ApiId) {
  if (!isApi(id)) throw new Error('没有这一家')
  keys.delete(id)
  delete saved.api[id]
  if (!E2E) save()
}

/** 找一遍本机模型（Ollama、LM Studio 一起，2 秒不回算没开） */
export function probeAll(): Promise<void> {
  probing ??= Promise.all(LOCAL_IDS.map(async (id) => (local[id] = await probeLocal(id)))).then(
    () => void (probing = null),
    (e) => {
      probing = null
      throw e
    },
  )
  return probing
}

/** 这一家能不能用：Key 填过（验过才存）；本机模型开着、有模型 */
export function sourceReady(id: EngineId): boolean {
  if (isApi(id)) return keys.has(id)
  if (isLocal(id)) return !!local[id]?.on && !!local[id]?.models.length
  return false
}

export function sourceModels(id: EngineId): ModelOption[] {
  if (isApi(id)) return saved.api[id]?.models ?? []
  if (isLocal(id)) return local[id] ? localModels(local[id]!) : []
  return []
}

export function sourceStates(): SourceState[] {
  return [
    ...API_IDS.map((id): SourceState => ({ id, ready: keys.has(id), ...(keys.has(id) ? { tail: keys.tail(id)! } : {}) })),
    ...LOCAL_IDS.map((id): SourceState => ({ id, ready: sourceReady(id), on: !!local[id]?.on, count: local[id]?.models.length ?? 0 })),
  ]
}

/** 本机模型找到的（上手卡列模型、写大小） */
export const localFound = (id: LocalId): LocalFound | undefined => local[id]

/**
 * 软件自带的 OpenCode（MIT，设计页第 6 节：打进安装包，只在没装命令行时用）：
 * 打包的在 Resources/opencode/opencode（electron-builder 的 extraResources，scripts/fetch-opencode.mjs 下载钉死的那一版）；
 * 开发时在 apps/notes/resources/opencode/darwin-<架构>/opencode（同一个脚本下的，不进 git）；CN_BUNDLED_OPENCODE 能指定（测试用）。
 * 都没有时用这台 Mac 上装着的 opencode（同一个程序），再没有就是 null（动手用不了，说清楚）
 */
export function bundledOpencode(): { path: string; dataDir: string } | null {
  const dataDir = join(app.getPath('userData'), 'ai', 'opencode')
  const candidates = [
    process.env.CN_BUNDLED_OPENCODE,
    app.isPackaged ? join(process.resourcesPath, 'opencode', 'opencode') : join(__dirname, '../../resources/opencode', `darwin-${process.arch}`, 'opencode'),
  ]
  for (const p of candidates) if (p && existsSync(p)) return { path: p, dataDir }
  const own = findCli('opencode')
  return own ? { path: own, dataDir } : null
}
