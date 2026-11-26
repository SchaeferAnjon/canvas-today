/**
 * 对比标签要的两版全文（CN-47 / 48）：一次提交、梦游的一条、可能重复的两篇、某次提交时的一个文件、还没提交的改动。
 * 两版都用 `git show <rev>:<path>` 读，文件现在挪走、删了也读得到；不再截成 -U3 片段，也没有 300 行的上限。
 * 不依赖 Electron（IPC 在 dream-main.ts 接），单元测试直接跑。
 */
import { when } from '../shared/when'
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import * as git from '@cn/git'
import type { DreamReport } from '../shared/api'
import { baseName, type DiffEntry, type DiffResult, type DiffSource, fileKindOf, type Hunk, moveSay, parseHunks, relinkSay, sizeText, summarize } from '../shared/diff'
import { titleOf } from '../shared/layout'

/** git 的空树：第一次提交没有父提交，跟它比 */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
/** 图片超过这么大不放进对比（只写大小） */
const MAX_IMAGE = 8 * 1024 * 1024

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic' }

/** 一个版本里的文件，原样的字节（图片不能当字符串读）；没有这个文件是 null */
export function blob(root: string, rev: string, path: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', 'show', `${rev}:${path}`], { cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, timeout: 30_000, env: { ...process.env, PATH: git.gitPath(), GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout)
      const msg = String(stderr)
      if (/does not exist|exists on disk, but not in|bad revision|invalid object name/i.test(msg)) return resolve(null)
      reject(new Error(`读不出 ${rev.slice(0, 7)} 那一版的 ${path}：${msg.trim() || err.message}`))
    })
  })
}

/** git diff --no-index：两个文件不一样时 git 退出码是 1，这不算出错 */
function diffNoIndex(root: string, a: string, b: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', 'diff', '--no-index', '--no-color', '--no-ext-diff', '-U0', '--', a, b], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 30_000, env: { ...process.env, PATH: git.gitPath() } }, (err, stdout, stderr) => {
      if (err && (err as { code?: number }).code !== 1) return reject(new Error(`比不了这两篇：${String(stderr).trim() || err.message}`))
      resolve(stdout)
    })
  })
}

async function exists(root: string, path: string): Promise<boolean> {
  try {
    return (await stat(join(root, path))).isFile()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') return false
    throw e
  }
}

/** 字节 → 对比里放的样子：文字是全文，图片是 data: 地址，别的二进制不放 */
function content(path: string, buf: Buffer | null): string | null {
  if (!buf) return null
  const kind = fileKindOf(path)
  if (kind === 'image') return buf.length <= MAX_IMAGE ? `data:${MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'};base64,${buf.toString('base64')}` : null
  if (kind === 'binary') return null
  return buf.toString('utf8').replace(/^﻿/, '')
}

interface NameStatus {
  status: DiffEntry['status']
  path: string
  from?: string
}

/** git diff --name-status -M -z 的输出 */
export function parseNameStatus(out: string): NameStatus[] {
  const parts = out.split('\0')
  const res: NameStatus[] = []
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++]
    if (!code) continue
    if (code.startsWith('R') || code.startsWith('C')) {
      const from = parts[i++]!
      const path = parts[i++]!
      res.push({ status: 'moved', path, from })
    } else {
      const path = parts[i++]!
      res.push({ status: code === 'A' ? 'new' : code === 'D' ? 'deleted' : 'changed', path })
    }
  }
  return res
}

/** base..tip 之间这些文件（不给就是全部）的两版 */
async function between(root: string, base: string, tip: string, only?: string[], said?: Map<string, string>): Promise<DiffEntry[]> {
  const scope = only?.length ? ['--', ...only] : []
  const names = parseNameStatus(await git.git(root, ['diff', '--name-status', '-M', '-z', base, tip, ...scope]))
  const hunks = parseHunks(await git.git(root, ['diff', '-M', '--no-color', '--no-ext-diff', '-U0', base, tip, ...scope]))
  const out: DiffEntry[] = []
  for (const n of names) {
    const [b, a] = await Promise.all([n.status === 'new' ? null : blob(root, base, n.from ?? n.path), n.status === 'deleted' ? null : blob(root, tip, n.path)])
    out.push(await entry(root, n, b, a, hunks.get(n.path) ?? [], said?.get(n.path)))
  }
  return out
}

async function entry(root: string, n: NameStatus, b: Buffer | null, a: Buffer | null, hunks: Hunk[], said?: string): Promise<DiffEntry> {
  const kind = fileKindOf(n.path)
  const after = content(n.path, a)
  const size = (a ?? b)?.length ?? 0
  const e: DiffEntry = {
    path: n.path,
    ...(n.from ? { from: n.from } : {}),
    status: n.status,
    kind,
    before: content(n.from ?? n.path, b),
    after,
    size,
    added: hunks.reduce((s, h) => s + h.add.length, 0),
    removed: hunks.reduce((s, h) => s + h.del.length, 0),
    summary: '',
    exists: await exists(root, n.path),
  }
  e.summary = said ?? summarize(e, hunks, typeof after === 'string' && kind !== 'image' ? after : null, basename(root))
  return e
}

const short = (h: string) => h.slice(0, 7)

/** 还没提交的改动：上次提交的和现在磁盘上的（新建还没进 Git 的文件也算） */
async function working(root: string): Promise<DiffResult> {
  const head = await git.git(root, ['rev-parse', '--verify', '-q', 'HEAD']).then(
    (s) => s.trim(),
    () => null,
  )
  const base = head ?? EMPTY_TREE
  const names = parseNameStatus(await git.git(root, ['diff', '--name-status', '-M', '-z', base]))
  const hunks = parseHunks(await git.git(root, ['diff', '-M', '--no-color', '--no-ext-diff', '-U0', base]))
  const files: DiffEntry[] = []
  for (const n of names) {
    const [b, a] = await Promise.all([n.status === 'new' ? null : blob(root, base, n.from ?? n.path), n.status === 'deleted' ? null : readFile(join(root, n.path))])
    files.push(await entry(root, n, b, a, hunks.get(n.path) ?? []))
  }
  for (const path of (await git.git(root, ['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)) {
    const added = [...parseHunks(await diffNoIndex(root, '/dev/null', path)).values()][0] ?? []
    files.push(await entry(root, { status: 'new', path }, null, await readFile(join(root, path)), added))
  }
  return { note: files.length ? `还没提交的改动 · ${files.length}处` : '都提交了', left: head ? `上次提交 · ${short(head)}` : '上次提交 · 没有', right: '现在 · 还没提交', files }
}

/** 对比标签要的东西；report 是梦游报告（kind 是 dream 时要） */
export async function diffOf(root: string, src: DiffSource, report: DreamReport | null): Promise<DiffResult> {
  if (src.kind === 'working') return working(root)
  if (src.kind === 'commit' || src.kind === 'version') {
    if (!/^[0-9a-f]{7,40}$/.test(src.hash)) throw new Error('提交号不对')
    const [hash, ...parents] = (await git.git(root, ['rev-list', '--parents', '-n', '1', src.hash])).trim().split(' ')
    const [date, subject] = (await git.git(root, ['log', '-1', '--format=%aI%x1f%s', hash!])).trim().split('\x1f')
    const note = `${when(Date.parse(date!), { time: true })} · ${subject}`
    if (src.kind === 'version') {
      const buf = await blob(root, hash!, src.path)
      if (!buf) throw new Error(`那次提交里没有 ${src.path}`)
      const e = await entry(root, { status: 'new', path: src.path }, null, buf, [])
      return { note, left: '', right: `${short(hash!)} 那一版 · 只读`, files: [{ ...e, summary: `${short(hash!)} 那次提交时的样子 · ${sizeText(e.size)}` }] }
    }
    const base = parents[0] ?? EMPTY_TREE
    const all = await between(root, base, hash!)
    // 藏起设置文件时只列用户自己的；只建了空文件夹那次（只有 .gitkeep）照样列它
    const mine = all.filter((f) => !git.isInternalPath(f.path))
    const keep = all.filter((f) => /(^|\/)\.gitkeep$/.test(f.path))
    const files = src.kind === 'commit' && src.hide ? (mine.length ? mine : keep.length ? keep : all) : all
    return { note, left: parents[0] ? `改之前 · ${short(parents[0])}` : '改之前 · 没有', right: `这次提交后 · ${short(hash!)}`, files, rev: hash! }
  }
  if (src.kind === 'pair') {
    for (const p of [src.a, src.b]) if (p.startsWith('/') || p.split('/').includes('..')) throw new Error('路径不对')
    const [a, b] = await Promise.all([readFile(join(root, src.a)), readFile(join(root, src.b))])
    const hunks = [...parseHunks(await diffNoIndex(root, src.a, src.b)).values()][0] ?? []
    const e = await entry(root, { status: 'changed', path: src.b }, a, b, hunks)
    return { note: `可能重复 · ${baseName(src.a).replace(/\.md$/i, '')} 和 ${baseName(src.b).replace(/\.md$/i, '')}`, left: src.a, right: src.b, files: [{ ...e, from: src.a }] }
  }
  if (!report) throw new Error('还没有梦游报告')
  const it = report.items.find((i) => i.id === src.id)
  if (!it) throw new Error('报告里没有这一条')
  if (!it.commit) {
    // 可能重复：只是提醒，没有提交，就是两篇并排
    const [a, b] = it.files
    return diffOf(root, { kind: 'pair', a: a!, b: b! }, report)
  }
  // 重做过的：从第一次提交之前到最后一次重做
  const commits = [it.commit, ...(it.redoCommits ?? [])]
  const tip = commits[commits.length - 1]!
  // 这一条动过的每个文件（task-m552v）：挪的那篇，还有改名时别的笔记里 [[旧名]] 换成新名的那几篇（以前只列 it.files，那几篇看不到）
  const touched = new Set<string>()
  for (const c of commits)
    for (const n of parseNameStatus(await git.git(root, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', '-z', c]))) {
      touched.add(n.path)
      if (n.from) touched.add(n.from)
    }
  const said = new Map((it.changes ?? []).map((c) => [c.path, c.text]))
  // 挪的那篇按改了什么重拼一句（「挪到剪藏/旅行，标题加「2」，2张图的地址跟着改」）；别的笔记写哪段的 [[旧名]] 换成了什么
  if (it.move) said.delete(it.move.to)
  const files = await between(root, `${it.commit}^`, tip, [...touched], said)
  const vault = basename(root)
  for (const f of files) {
    if (!it.move || it.move.from === it.move.to) continue
    if (f.path === it.move.to) f.summary = moveSay(it.move.from, it.move.to, f.before, f.after, vault)
    else if (f.status === 'changed' && f.kind === 'md' && !said.has(f.path) && titleOf(it.move.from) !== titleOf(it.move.to)) f.summary = relinkSay(titleOf(it.move.from), titleOf(it.move.to), f.before ?? '', f.after ?? '')
  }
  // 挪的那篇在前，别的 md 跟着，HTML 这些在后（可视化那条：笔记在前、新建的 HTML 在后）
  const rank = (f: DiffEntry) => (f.path === it.move?.to ? 0 : f.kind === 'md' ? 1 : 2)
  files.sort((a, b) => rank(a) - rank(b))
  // 「打开「文件名」」开哪一份：原处的；后来收下的归类挪走了的跟过去；还没收下的挪动开原来那份；只在梦游分支上的开分支上那份
  const moves = report.items.filter((i) => i.move && i.state === 'taken' && i.move.from !== i.move.to).map((i) => i.move!)
  for (const f of files) {
    if (f.exists) {
      f.now = f.path
      continue
    }
    if (f.from && (await exists(root, f.from))) {
      f.now = f.from
      continue
    }
    let cur: string | null = f.path
    for (let k = 0; cur && k < 8 && !(await exists(root, cur)); k++) cur = moves.find((m) => m.from === cur)?.to ?? null
    f.now = cur && (await exists(root, cur)) ? cur : null
    if (!f.now && f.status === 'new' && it.state === 'pending') f.branch = true
  }
  return { note: `梦游 · ${it.state === 'pending' ? '还没收下' : it.state === 'taken' ? '已收下' : '已丢掉'}`, left: `现在的 · ${report.base}`, right: `收下后 · ${report.branch}`, files, rev: tip }
}
