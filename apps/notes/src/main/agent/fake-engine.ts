/**
 * 测试用的假引擎（CN_AI_FAKE=1）：不调模型，按用户说的话走一串固定的工具调用。
 * 工具是真的通过 MCP 服务调的（和真引擎走同一条路），字也是一小段一小段吐出来的。
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { EngineId } from '../../shared/agent'
import { effortOption, type ModelOption } from '@cn/ai-engines/shared'
import { type Engine, LABELS } from '@cn/ai-engines'

async function mcp(url: string, token: string, method: string, params: unknown, id = 1): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`MCP ${method} 回了 ${res.status}`)
  const body = (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } }
  if (body.error) throw new Error(body.error.message)
  return body.result!
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * CN_FAKE_HOLD=<文件>：测试手里的「放行」开关。这个文件不在时，假 AI 答到一半（说出头几个字以后、自己写完文件以后）停着「还在答」，
 * 等测试建出这个文件（或这一轮被停下）再往下答；文件一直在就不停。测试要在「AI 还在答」的那一会儿里看东西、再框一块时用：
 * 以前靠答得慢（CN_FAKE_SAY_MS、CN_FAKE_OWN_MS 固定几秒），机器忙时还没看完这一轮就答完了
 */
async function held(signal: AbortSignal): Promise<boolean> {
  const gate = process.env.CN_FAKE_HOLD
  if (!gate) return false
  while (!existsSync(gate) && !signal.aborted) await sleep(50)
  return true
}

/**
 * 一段一段放行（AI 对话同时跑的测试）：话里写「〔等放行 甲〕」的那一问，说出头几个字以后等 CN_FAKE_GATES 文件夹里出现「甲」这个文件
 * （或这一轮被停下）再往下答。别的问照旧只看 CN_FAKE_HOLD
 */
async function gate(said: string, signal: AbortSignal) {
  const name = /〔等放行 ([^〕]+)〕/.exec(said)?.[1]
  const dir = process.env.CN_FAKE_GATES
  if (!name || !dir) return
  while (!existsSync(join(dir, name)) && !signal.aborted) await sleep(50)
}

/** 写完文件多答一会儿：有放行开关等开关，没有照旧等 CN_FAKE_OWN_MS 毫秒 */
async function stillAnswering(signal: AbortSignal) {
  if (!(await held(signal))) await sleep(Number(process.env.CN_FAKE_OWN_MS ?? 0))
}

/** 假的 Codex 模型列表（照 codex 0.163.0 的 model/list 的样子；默认的排第一，两个模型的档不一样） */
export function fakeCodexModels(): ModelOption[] {
  return [
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(effortOption), defaultEffort: 'low' },
    { id: 'gpt-6-luna', label: 'GPT-6-Luna', efforts: ['low', 'medium', 'high', 'xhigh', 'max'].map(effortOption), defaultEffort: 'medium' },
  ]
}

/** 问里有「公式」时的回答：讲 LIF 神经元的三条公式（同 A 组方案小样里那段），行内 $…$、单独成行的 $$…$$ 都有（CN-89） */
export const FORMULA_ANSWER = [
  'LIF 神经元用「漏、积、发」三步描述一个神经元。',
  '',
  '## 水位怎么变',
  '',
  '$$\\tau_m \\frac{dV_m}{dt} = -V_m(t) + I_s(t) + I_b$$',
  '',
  '- $\\tau_m$ 是漏得多快，$I_s(t)$ 是这一刻进来的电流，$I_b$ 是常开的底水位。',
  '- 拿个数走一遍：$\\tau_m = 10$ ms，$V_m = 0.5$，没有输入时一毫秒漏掉 $0.05$。',
  '',
  '## 什么时候发',
  '',
  '$$',
  'V_m \\ge V_{th} \\;\\Rightarrow\\; V_m \\leftarrow V_m - V_{th},\\quad s(t) = 1',
  '$$',
  '',
  // 这一句公式两边没打空格（真回答常这样）：界面上紧挨汉字那边留 1/8 字宽
  '水位一到门槛$V_{th}$就发一个 spike，再减掉一个门槛的量（不是清零），见 [第 4 页](#page=4)。',
].join('\n')

/**
 * 问里有「宽内容」时的回答（task-83vl3，照用户截图 r34）：一长串没空格的行内代码、窄表、很多列的宽表、长行的代码块、
 * 对齐的输出。回答整条不能横着滑：字和行内代码折行，只有代码块、宽表在自己的框里横着滚
 */
export const WIDE_ANSWER = [
  '数字类别的列换成 0/1 数字列。模型只能吃数字，像 `Pave` 这样的文字没法直接用。',
  '',
  '| NumRooms | Alley |',
  '|---|---|',
  '| 3.0 | Pave |',
  '| 2.0 | NaN |',
  '',
  '或者转张量时写 `torch.tensor(inputs.to_numpy(dtype=float)).reshape(-1,1)`，再看一个长网址 https://zh.d2l.ai/chapter_preliminaries/pandas.html#subsec-preprocessing-convert-to-tensor 。',
  '',
  '| 列名 | 第一行 | 第二行 | 第三行 | 第四行 | 第五行 | 第六行 | 第七行 | 第八行 |',
  '|---|---|---|---|---|---|---|---|---|',
  '| NumRooms | 3.0 | 2.0 | 4.0 | 3.0 | 5.0 | 1.0 | 2.0 | 6.0 |',
  '| Alley_Pave | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |',
  '',
  '```python',
  'inputs = pd.get_dummies(inputs, dummy_na=True, dtype=int)  # 把文字列拆成 0/1 列，缺失值也单独成一列',
  'X = torch.tensor(inputs.to_numpy(dtype=float)); y = torch.tensor(outputs.to_numpy(dtype=float))',
  '```',
  '',
  '做完这一步，表里全是数字，下一步就能转成张量。',
].join('\n')

/** 问的话里带了几块引用的材料（shared/materials.ts 的 withMaterials 写的「我引用的材料…」下面一行一块） */
function materialCount(q: string): number {
  const at = q.indexOf('我引用的材料（')
  return at < 0 ? 0 : (q.slice(at).match(/^[①-⑳] /gm) ?? []).length
}

/**
 * 库里的笔记工具（2026-11-19）：按话里的「」走一个工具，回给用户工具说的那句。认的说法：
 * 新建一篇「标题」放到「文件夹」（写上「正文」）、把「路径」改名为「新名」、把「路径」挪到「文件夹」（「」空着是最外层）、
 * 删掉「路径」、新建文件夹「名字」（放在「上一层」）、在「路径」末尾加上「一段」
 */
async function vaultCommand(said: string, call: (name: string, args: Record<string, unknown>) => Promise<string>): Promise<string | null> {
  const q = [...said.matchAll(/「([^」]*)」/g)].map((m) => m[1]!)
  if (/^新建一篇/.test(said)) return call('note_create', { title: q[0], ...(q[1] !== undefined ? { folder: q[1] } : {}), ...(q[2] !== undefined ? { text: q[2] } : {}) })
  if (/^把「[^」]*」改名为/.test(said)) return call('note_rename', { path: q[0], name: q[1] })
  if (/^把「[^」]*」挪到/.test(said)) return call('note_move', { path: q[0], folder: q[1] ?? '' })
  if (/^删掉「/.test(said)) return call('note_delete', { path: q[0] })
  if (/^新建文件夹「/.test(said)) return call('folder_create', { name: q[0], ...(q[1] !== undefined ? { parent: q[1] } : {}) })
  if (/^在「[^」]*」末尾加上「/.test(said)) return call('note_write', { path: q[0], text: q[1], mode: 'append' })
  // 整篇换掉（新内容从本机的一个文件里读，测试用整篇长笔记）
  if (/^整篇改写「[^」]*」照「/.test(said)) return call('note_write', { path: q[0], text: readFileSync(q[1]!, 'utf8'), mode: 'replace' })
  return null
}

/** 测试写好的一段多轮对话（CN_FAKE_ROUNDS）：用户说的那句、改哪一篇、换成哪个文件里的字、AI 回的那句 */
function fakeRounds(): { say: string; path: string; file: string; reply?: string }[] {
  const f = process.env.CN_FAKE_ROUNDS
  return f ? (JSON.parse(readFileSync(f, 'utf8')) as { say: string; path: string; file: string; reply?: string }[]) : []
}

/** 问「用的什么模型」时说的：模型和 effort 都说出来（测试看设置、输入框底行选的真的传到了引擎，CN-44、CN-91） */
const modelSaid = (r: { model?: string; effort?: string }) => `模型：${r.model ?? '没指定'}，effort：${r.effort ?? '没指定'}`

/**
 * 测试写好的一串步骤（CN_FAKE_SCRIPT 指向一个 JSON：[{ say, steps }]）：用户的话里有 say 就照 steps 做。每一步：
 * - { read: 路径 }：像 Claude Code 的 Read（相对路径按库算），真读这个文件
 * - { grep: 文件夹, pattern }：像 Grep，在那个文件夹（库外的也行）里真搜，搜到的文件记下来，say 里的 {found} 换成它们的名字
 * - { tool, args }：调我们的 MCP 工具（{found} 在 args 的字里也换）
 * - { bash: 命令 }：像 Bash，先问软件（beforeTool），不放行就不跑、步骤记成没做；放行了在库里真跑
 * - { say: 字 }：说一段
 * 每一步可以带 when：'omni' 只在全能模式开着时做，'off' 只在关着时做
 */
type ScriptStep = { when?: 'omni' | 'off' } & ({ read: string } | { grep: string; pattern: string } | { tool: string; args?: Record<string, unknown> } | { bash: string } | { say: string })

function scriptFor(said: string): ScriptStep[] | null {
  const f = process.env.CN_FAKE_SCRIPT
  if (!f) return null
  const all = JSON.parse(readFileSync(f, 'utf8')) as { say: string; steps: ScriptStep[] }[]
  return all.find((x) => said.includes(x.say))?.steps ?? null
}

async function scripted(steps: ScriptStep[], r: Parameters<Engine['run']>[0], say: (s: string) => Promise<void>, call: (name: string, args?: Record<string, unknown>) => Promise<string>, text: () => string, id: EngineId) {
  const found: string[] = []
  const fill = (s: string) => s.replace(/\{found\}/g, found.join('、') || '（没搜到）')
  let n = 0
  for (const st of steps) {
    if (st.when && (st.when === 'omni') !== !!r.omni) continue
    if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
    const sid = `s${++n}`
    if ('read' in st) {
      const file_path = st.read.startsWith('/') ? st.read : join(r.cwd, st.read)
      r.onStep?.({ id: sid, tool: 'Read', input: { file_path }, status: 'run' })
      readFileSync(file_path, 'utf8')
      r.onStep?.({ id: sid, tool: 'Read', input: { file_path }, status: 'ok' })
    } else if ('grep' in st) {
      const input = { pattern: st.pattern, path: st.grep }
      r.onStep?.({ id: sid, tool: 'Grep', input, status: 'run' })
      const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else if (new RegExp(st.pattern).test(readFileSync(p, 'utf8'))) found.push(e.name)
        }
      }
      walk(st.grep)
      r.onStep?.({ id: sid, tool: 'Grep', input, status: 'ok' })
    } else if ('tool' in st) {
      const args = JSON.parse(fill(JSON.stringify(st.args ?? {}))) as Record<string, unknown>
      await call(st.tool, args).catch((e: Error) => say(`（${st.tool} 没做成：${e.message}）\n`))
    } else if ('bash' in st) {
      const input = { command: st.bash }
      r.onStep?.({ id: sid, tool: 'Bash', input, status: 'run' })
      const deny = (await r.beforeTool?.('Bash', input, sid)) ?? null
      if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
      if (deny) {
        r.onStep?.({ id: sid, tool: 'Bash', input, status: 'err', detail: deny.split('\n')[0]! })
        await say('这一步你没点头，没跑。\n')
        continue
      }
      execFileSync('/bin/sh', ['-c', st.bash], { cwd: r.cwd, timeout: 10_000 })
      r.onStep?.({ id: sid, tool: 'Bash', input, status: 'ok' })
    } else await say(fill(st.say))
  }
  return { text: text(), session: r.session ?? `fake-${id}` }
}

/** 网页工具问过用户、停下等点头的那一下：用户回「可以…」带 confirmed 再调一次，回「不要」就不做（同真 AI） */
let waiting: [string, Record<string, unknown>] | null = null

export function fakeEngine(id: EngineId): Engine {
  let sides = 0
  return {
    id,
    label: LABELS[id],
    async run(r) {
      // 消息最后软件加的那行【语言】（task-zojmg）不算用户的话，和真 AI 一样不理它
      const prompt = r.prompt.replace(/\n\n【语言】[^\n]*$/, '')
      const said = /用户说：\n([\s\S]*)$/.exec(prompt)?.[1]?.trim() ?? prompt
      // 测试量 AI 这一轮拿到了什么（上下文、引用、选中的几篇几块）：CN_FAKE_TURN_LOG 给了就一轮记一行（ai-entries.spec.ts）
      if (process.env.CN_FAKE_TURN_LOG) appendFileSync(process.env.CN_FAKE_TURN_LOG, JSON.stringify({ said, prompt, system: r.system }) + '\n')
      let text = ''
      let started = false
      const say = async (s: string) => {
        for (const part of s.match(/.{1,4}/gsu) ?? []) {
          if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
          text += part
          r.onText(part)
          // 头几个字说出来以后，有放行开关就等开关（测试在「还在答」时框一块、点按钮）
          if (!started) {
            started = true
            await held(r.signal)
            await gate(said, r.signal)
            if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
          }
          // CN_FAKE_SAY_MS：每 4 个字隔多久（测试「答的时候再框一块」要答得慢一点）
          await sleep(Number(process.env.CN_FAKE_SAY_MS ?? 25))
        }
      }
      const call = async (name: string, args: Record<string, unknown> = {}) => {
        // 停下以后不再调工具（真的命令行被停下时进程就结束了）
        if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
        if (!r.mcp) throw new Error('这一轮没给工具')
        const res = await mcp(r.mcp.url, r.mcp.token, 'tools/call', { name, arguments: args })
        const out = (res.content as { text: string }[])[0]?.text ?? ''
        if (res.isError) throw new Error(out)
        return out
      }
      if (r.mcp) await mcp(r.mcp.url, r.mcp.token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake', version: '0' } })

      // 测试写好的一串步骤（CN_FAKE_SCRIPT，画布今日的全能模式 e2e）：话里有 say 的那一问照 steps 一步步做（见 scripted）
      const script = scriptFor(said)
      if (script) return await scripted(script, r, say, call, () => text, id)

      // 回答里引用库里的东西（task-3e53q）：相对库根的笔记到几行、只写名字的、绝对路径、[[双链#标题]]、PDF 某页某块、网页某一段。
      // AI 对话、读 PDF 的 AI、旁支里问「列出引用」都这样答
      if (/列出引用/.test(r.prompt)) {
        await say(
          [
            'SAGE 是[小论文计划里排](课程/小论文计划.md#L42-L43)第 2 篇的论文。',
            '',
            `- 原话在 [小论文计划](${join(r.cwd, '课程/小论文计划.md')}) 里；定义见 [[第3讲 笔记#定义]]。`,
            '- 图在 [第 4 页那块](课程/线代/第3讲.pdf#page=4&rect=0.1,0.2,0.5,0.2)。',
            '- 网页上那句：[注意力那段](https://example.com/attn.html#:~:text=%E6%B3%A8%E6%84%8F%E5%8A%9B)。',
            '- [没有这篇](课程/没有这篇.md)。',
          ].join('\n'),
        )
        return { text, session: r.session ?? `fake-${id}` }
      }
      // 对话目录（task-3e53q「三、b」）：问里有「分几节讲」就答一段带三个小标题的长回答（够长，对话要滚）；
      // 小标题写成「问的头几个字 · 一句话」，好在目录里认出是哪一问的。读 PDF 问的在「他说：」后面，AI 对话、旁支的在「用户说：」后面
      const asked = /他说：([\s\S]*)$/.exec(prompt)?.[1]?.trim() ?? said
      // 截交付图时（CN_FAKE_SECTIONS=1）主对话每一问都这样答，小标题不带问的头几个字
      const shots = !!process.env.CN_FAKE_SECTIONS && !/这是一条旁支|接着这条旁支问/.test(prompt)
      if (/分几节讲/.test(asked) || shots) {
        const head = shots ? '' : (asked.replace(/分几节讲[\s\S]*$/, '').trim().slice(0, 6) || '这一问') + ' · '
        const para = (k: string) => `${k}：先把每个信号切成 30 秒一窗，再用图注意力看五个信号之间谁影响谁，最后用双向 LSTM 看前后几窗怎么变。每个人的身体底子不一样，随机划分时同一个人的数据会同时出现在练习题和考卷里。`
        await say([`## ${head}一句话`, '', para('一'), '', para('二'), '', `## ${head}三步`, '', para('三'), '', para('四'), '', `## ${head}结果`, '', para('五'), '', para('六')].join('\n'))
        return { text, session: r.session ?? `fake-${id}` }
      }

      // 回答里没写成链接的（task-3e53q 按名字认）：先读一遍《小论文计划》（步骤里记下读过它），回答里光写名字、写反引号路径、写「路径:行号」、
      // 书名号包着一篇没读过的；同一个名字第二次不认
      if (/按名字认/.test(said)) {
        if (r.mcp) await call('note_read', { path: '课程/小论文计划.md' })
        await say(
          [
            'SAGE 在小论文计划里排第 2 篇，作者和 C72 重叠。',
            '',
            '- 原文在 `课程/小论文计划.md`，就是 课程/小论文计划.md:42-43 那两行。',
            '- 线性的定义另见《第3讲 笔记》。',
            '- 小论文计划里别的几篇先放着。',
          ].join('\n'),
        )
        return { text, session: r.session ?? `fake-${id}` }
      }

      // 七种引用（task-3e53q 第 ① 条线）：笔记几行、PDF 某页某块、网页某一段、白板卡、数据库一行、待办一条、历史里一次提交。
      // 提交号跟在「列出七种引用」后面（测试先造好那次提交）
      const seven = /列出七种引用\s*([0-9a-f]{7,40})?/.exec(r.prompt)
      if (seven) {
        await say(
          [
            '七种引用：',
            '',
            '- 笔记：[小论文计划里排](课程/小论文计划.md#L42-L43)。',
            '- PDF：[第 4 页](课程/线代/第3讲.pdf#page=4&rect=0.1,0.2,0.5,0.2)。',
            '- 网页：[注意力那段](https://example.com/attn.html#:~:text=%E6%B3%A8%E6%84%8F%E5%8A%9B)。',
            '- 白板卡：[LOSO 那张卡](课程/读论文白板.md#^c7)。',
            '- 数据库：[SAGE 那一行](文献库/SAGE.md)。',
            '- 待办：[周五前读完 SAGE](待办.md#L3)。',
            `- 历史：[整理计划那次](canvas-notes://commit/${seven[1] ?? '0000000'})。`,
          ].join('\n'),
        )
        return { text, session: r.session ?? `fake-${id}` }
      }

      // 出卡（task-tz7y3）：一问一行 JSON，隔 CN_FAKE_CARD_MS 出一张。问题「小标题」里：原话；答案是回答第一句里第一个逗号前；原文摘句是回答第一句
      if (r.system.startsWith('你帮人把他读 PDF 课件时问过的问题做成 Anki 记忆卡片')) {
        for (const b of prompt.split(/^【第 \d+ 问】/m).slice(1)) {
          if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
          const id = /^编号：(\S+)/m.exec(b)?.[1] ?? ''
          const title = /这一轮：(.*)$/m.exec(b)?.[1]?.trim() ?? ''
          const q = /^他问的原话：(.*)$/m.exec(b)?.[1]?.trim() ?? ''
          const ans = /^AI 当时的回答：\n([\s\S]*?)(?=\n这一页 PDF 上的字：|$)/m.exec(b)?.[1]?.trim() ?? ''
          const first = /^[^。！？\n]*[。！？]?/.exec(ans)?.[0] ?? ans
          await sleep(Number(process.env.CN_FAKE_CARD_MS ?? 150))
          const line = JSON.stringify({ id, q: `「${title}」里：${q}`, a: first.split(/[：，；。]/)[0], more: '', quote: first }) + '\n'
          text += line
          r.onText(line)
        }
        return { text, session: undefined }
      }

      // 读 PDF：后台的两件小活，这一轮的标题和一句小结（只出 JSON）；小结里写主对话、旁支各问了几句（测试看每答完一次都重写）
      if (prompt.includes('输出 JSON：')) {
        await sleep(Number(process.env.CN_FAKE_NOTE_MS ?? 400))
        const page = /第 (\d+) 页/.exec(prompt)?.[1] ?? '1'
        const main = (prompt.match(/^【他】/gm) ?? []).length
        const side = (prompt.match(/^【他·旁支】/gm) ?? []).length
        const json = { title: `测试小标题 p${page}`, recap: `测试小结：主对话问了 ${main} 句${side ? `，旁支问了 ${side} 句` : ''}。` }
        return { text: JSON.stringify(json), session: undefined }
      }
      // 读 PDF：做个可视化（一个能拖的小网页）
      if (prompt.includes('做一个单文件 HTML 可视化')) {
        await sleep(Number(process.env.CN_FAKE_VIZ_MS ?? 600))
        const page = /第 (\d+) 页/.exec(prompt)?.[1] ?? '1'
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>旋转矩阵 · 拖动角度看基向量</title><style>body{font:14px sans-serif;margin:24px}@media (prefers-color-scheme: dark){body{background:#111;color:#eee}}</style></head><body><h1>第 ${page} 页 · 拖动角度</h1><input id="a" type="range" min="0" max="360" value="30" aria-label="角度"><p>角度 <b id="v">30</b>°</p><script>const a=document.getElementById('a');a.oninput=()=>document.getElementById('v').textContent=a.value</script></body></html>`
        return { text: '好的：\n```html\n' + html + '\n```', session: undefined }
      }
      // 让 Claude 帮我找：搜一下、读含有他的话里两个字的那几篇，交一行 JSON
      if (prompt.startsWith('帮他在库里找：')) {
        const q = prompt.slice('帮他在库里找：'.length).trim()
        const step = Number(process.env.CN_FAKE_FIND_MS ?? 300)
        await sleep(step)
        r.onTool?.('Grep', { pattern: q })
        const pairs = [...q].slice(0, -1).map((c, i) => c + q[i + 1])
        const hits: { path: string; why: string }[] = []
        const walk = (dir: string) => {
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith('.')) continue
            const p = join(dir, e.name)
            if (e.isDirectory()) walk(p)
            else if (e.name.endsWith('.md')) {
              const text = readFileSync(p, 'utf8')
              const pair = pairs.find((w) => text.includes(w))
              if (pair) hits.push({ path: relative(r.cwd, p).split(sep).join('/'), why: `里面写着「${pair}」：${text.slice(text.indexOf(pair), text.indexOf(pair) + 20)}` })
            }
          }
        }
        walk(r.cwd)
        for (const h of hits.slice(0, 3)) {
          await sleep(step)
          r.onTool?.('Read', { file_path: join(r.cwd, h.path) })
        }
        return { text: `翻了一遍。\n${JSON.stringify({ found: hits.slice(0, 5) })}`, session: undefined }
      }
      // iPhone / iPad 经 Mac 问「最近改过哪些笔记」：照真 AI 那样先调读库工具（list_recent、read_note）再答；没给工具照实说读不到
      if (/最近改过哪些笔记/.test(said)) {
        if (!r.mcp?.tools.includes('list_recent')) {
          await say('这一问没给读库的工具，读不到你的库。')
          return { text, session: undefined }
        }
        const { notes } = JSON.parse(await call('list_recent', { days: 30, limit: 3 })) as { notes: { path: string; title: string }[] }
        const first = notes[0] ? (JSON.parse(await call('read_note', { path: notes[0].path })) as { text: string }).text.split('\n').find((l) => l.trim() && !l.startsWith('#')) : undefined
        await say(`最近改过的笔记：${notes.map((n) => `《${n.title}》`).join('、')}。${first ? `第一篇讲的是：${first.trim()}` : ''}`)
        return { text, session: undefined }
      }
      // 测试设置 › AI「给AI的长期说明」真的带进了这一问（AI 对话、读 PDF 都在最前面）
      if (said.includes('复述长期说明')) {
        const note = /【用户的长期说明】每一问都照这个来：\n([\s\S]*?)\n/.exec(prompt)?.[1]
        await say(note ? `长期说明：${note}` : '没有长期说明')
        return { text, session: r.session }
      }
      // 读 PDF：框一块问、追问
      if (prompt.includes('他说：')) {
        const q = /他说：([\s\S]*)$/.exec(prompt)?.[1]?.trim() ?? ''
        const page = /他现在在看第 (\d+) 页/.exec(prompt)?.[1] ?? '?'
        // 旁支（CN-90）：从给的会话分叉，会话号另起一个；接着聊就还是给的那个
        const fork = !!(r.fork && r.session)
        const session = fork ? `fake-side-${id}-${++sides}` : (r.session ?? `fake-read-${id}`)
        // 引用的材料（多段引用方向 B）：「我引用的材料…」下面一行一块
        const mats = materialCount(q)
        const seen = [`第 ${page} 页`, `图 ${r.images?.length ?? 0} 张`, ...(mats ? [`材料 ${mats} 块`] : []), prompt.includes('<pdf>') || r.history?.includes('<pdf>') ? '读过全文' : '没读全文', fork ? `旁支，从 ${r.session} 分叉` : r.session ? '接着聊' : '新会话', ...(prompt.includes('<answer>') ? ['带了上一问的回答'] : []), ...(prompt.includes('<subs>') ? ['带了字幕'] : [])]
        // 测试设置 › AI 选的模型真的传到了引擎（CN-44）
        if (q.includes('用的什么模型')) {
          await say(modelSaid(r))
          return { text, session }
        }
        // 读 PDF 时也能动手（2026-11-19）：「新建一篇「…」放到「…」」这些走库里的笔记工具
        const did = await vaultCommand(q, call).catch((e: Error) => `没做成：${e.message}`)
        if (did !== null) {
          await say(`${did}。`)
          return { text, session }
        }
        // 旁支（CN-90）：回答里写问的是哪一句、从哪分叉；问里有「公式」照样答带 LaTeX 的
        if (/这是一条旁支|接着这条旁支问/.test(prompt) && !q.includes('公式')) {
          const quote = /他选中的那句：「(.*)」|问的还是「(.*)」这句/.exec(prompt)
          await say(`#### 旁支的回答\n\n这是旁支的回答（${seen.join('，')}）：讲「${(quote?.[1] ?? quote?.[2] ?? '').slice(0, 12)}」，问的是「${q}」。\n\n第二段：门槛减掉，不清零。`)
          return { text, session }
        }
        // 测试出错的说法（CN-75）：照录屏里的原话报错
        if (q.includes('假装被拦'))
          throw new Error(
            "API Error: Opus 5.5's safeguards flagged this message (https://www.anthropic.com/legal/aup). Please try rephrasing your request. Details: [reasoning_extraction] Request ID: req_011FAKE Message ID: msg_01FAKE",
          )
        // 测试表格（CN-29）：左右对照翻译
        if (q.includes('对照表'))
          await say('翻译：\n\n| 原文 | 译文 |\n|---|---|\n| **physics-inspired** machine learning | 受物理启发的机器学习 |\n| data-driven surrogate models for partial differential equations | 偏微分方程的数据驱动代理模型 |\n| [第 2 页](#page=2) | 见第 2 页 |\n\n就这些。')
        // 测试公式（CN-89）：行内的、单独成行的 LaTeX，回答区用 KaTeX 排
        else if (q.includes('公式')) {
          await say(FORMULA_ANSWER)
          // AI 看得到公式（2026-11-24）：带了公式那几块的截图时说收到几张、是哪几块
          const shots = /依次是原文公式的截图：([^。]*)。/.exec(prompt)?.[1]
          if (shots) await say(`\n\n收到公式截图（${seen.join('，')}）：${shots}`)
        }
        // 页码链接跳到段：链接带引的那句原文（第 2 页那句在测试 PDF 里有，第 3 页那句没有：只跳页）
        else if (q.includes('两种输入'))
          await say(
            '因为论文主要篇幅都在讲第一种输入，第二种只在两处一笔带过：\n\n- [第 2 页](#page=2&text=We%20additionally%20extract%20a%20static%20feature%20stream) §III-B 开头：一句话带过，「再结合一个由低频统计描述量构成的静态特征流」\n- [第 3 页](#page=3&text=This%20sentence%20is%20nowhere%20in%20the%20paper) §III-B-3 Static Feature Stream：真正交代第二种输入的只有这一小段',
          )
        // 前置知识标签：问的是论文外的基础知识（「O 是怎么算的」「什么是 softmax」），回答末尾单独一行〔前置知识〕
        else if (/这个 O 是怎么算的|什么是 softmax/.test(q)) await say(`这是论文外的前置知识（${seen.join('，')}）：大 O 记的是 n 变大时算的次数怎么涨，自注意力每两个位置算一次，所以是 n²。\n\n〔前置知识〕`)
        else if (q.includes('宽内容')) await say(WIDE_ANSWER)
        else if (/还是不懂|换个方式/.test(q)) await say(`换个方式讲（${seen.join('，')}）：先别看公式，看图。`)
        else await say(`这是讲解（${seen.join('，')}）。用你在 [第 2 页](#page=2) 弄懂的那条：列就是基向量去哪。\n\n〔可以做个可视化〕`)
        // 配图的框（CN-60）：测试里给一个固定的框
        if (process.env.CN_FAKE_FIGURE_MARK && r.images?.length && prompt.includes('〔配图')) await say(`\n${process.env.CN_FAKE_FIGURE_MARK}`)
        return { text, session }
      }

      // 一轮做到一半断了（像 Claude Code 中途退出、按了停下）：读了一样、说了半句就断，会话号照真的样子跟着错误给出来；
      // 「接着做」时说清是不是接着那个会话
      if (said.includes('做到一半就断') || said.includes('慢慢做')) {
        r.onStep?.({ id: 'r1', tool: 'Read', input: { file_path: join(r.cwd, '附件/截图 9.png') }, status: 'run' })
        r.onStep?.({ id: 'r1', tool: 'Read', input: { file_path: join(r.cwd, '附件/截图 9.png') }, status: 'ok' })
        await say('正在把这篇按章节重排')
        const session = r.session ?? `fake-cut-${id}`
        // 慢慢做：跑着一条命令，一直到用户按停下（这一步不会再报做完）
        if (said.includes('慢慢做')) r.onStep?.({ id: 'b1', tool: 'Bash', input: { command: 'python3 /tmp/fix.py' }, status: 'run' })
        while (said.includes('慢慢做') && !r.signal.aborted) await sleep(50)
        throw Object.assign(r.signal.aborted ? Object.assign(new Error('停下了'), { name: 'AbortError' }) : new Error('Claude Code 退出了（143）'), { session })
      }
      if (/^接着做/.test(said)) {
        await say(r.session ? `接着会话 ${r.session} 做完了。` : '这是新会话，不记得刚才做到哪。')
        return { text, session: r.session ?? `fake-${id}` }
      }
      // 旁支（task-4edsc，AI 对话、文档里 AI 讲解块的）：回答里写问的是哪一句、从哪分叉（文档里的没有会话可分叉，是新会话）
      if (/这是一条旁支|接着这条旁支问/.test(prompt)) {
        const quote = /他选中的那句：「(.*)」|问的还是「(.*)」这句/.exec(prompt)
        const fork = !!(r.fork && r.session)
        const session = r.session && !fork ? r.session : `fake-side-${id}-${++sides}`
        const how = fork ? `旁支，从 ${r.session} 分叉` : r.session ? '接着聊' : `新会话${r.history ? '，带了那段讲解' : ''}`
        await say(`#### 旁支的回答\n\n这是旁支的回答（${how}）：讲「${(quote?.[1] ?? quote?.[2] ?? '').slice(0, 12)}」，问的是「${said}」。\n\n第二段：说完了。`)
        return { text, session }
      }
      // 模型把一次工具调用写成了普通文字（task-ne7cw，照用户截图）：跑一步，回答前面夹一段 <invoke>，后面代码块里的 <invoke> 是正常内容
      if (said.includes('演漏出来的工具调用')) {
        const command = `cat "${join(r.cwd, '阅读/书.md')}"`
        r.onStep?.({ id: 'b1', tool: 'Bash', input: { command }, status: 'run' })
        r.onStep?.({ id: 'b1', tool: 'Bash', input: { command }, status: 'ok' })
        await say(`<invoke name="Bash">\n<parameter name="command">${command}</parameter>\n<parameter name="description">Read the current book note</parameter>\n</invoke>\n`)
        await say('我在文末加了一节「评价」，共两段。\n\n工具调用的标记长这样：\n\n```xml\n<invoke name="Read">\n</invoke>\n```')
        return { text, session: r.session ?? `fake-${id}` }
      }
      // 回答里有长行内代码、宽表、长代码块（task-83vl3）：整条回答不横着滑
      if (said.includes('宽内容')) {
        await say(WIDE_ANSWER)
        return { text, session: r.session ?? `fake-${id}` }
      }
      // 步骤行很长（对话区不横滚，用户截图 r139）：一条 200 字符没空格的命令、一条库外 300 字符的长路径，回答里一个很宽的代码块
      if (said.includes('长步骤行')) {
        const command = `python3${'-x'.repeat(48)}${'/very_long_dir_name'.repeat(5)}/run.py?${'a=1&b=2'.repeat(5)}`.slice(0, 200)
        const file_path = `/Users/me/Library/项目/study project 2/论文/情绪识别 Emo/${'很长的一层文件夹名字/'.repeat(24)}${'x'.repeat(40)}.md`.slice(0, 300)
        r.onStep?.({ id: 'l1', tool: 'Bash', input: { command }, status: 'run' })
        r.onStep?.({ id: 'l1', tool: 'Bash', input: { command }, status: 'ok' })
        r.onStep?.({ id: 'l2', tool: 'Read', input: { file_path }, status: 'run' })
        r.onStep?.({ id: 'l2', tool: 'Read', input: { file_path }, status: 'ok' })
        // 话里「」写了库里一篇的路径：也读它（标题 200 字符没空格时步骤行「读《…》」不截）
        const note = /「([^」]*)」/.exec(said)?.[1]
        if (note) {
          r.onStep?.({ id: 'l3', tool: 'Read', input: { file_path: join(r.cwd, note) }, status: 'run' })
          r.onStep?.({ id: 'l3', tool: 'Read', input: { file_path: join(r.cwd, note) }, status: 'ok' })
        }
        await say(`跑完了，输出如下：\n\n\`\`\`\n${'0123456789'.repeat(30)}\n短的一行\n\`\`\``)
        return { text, session: r.session ?? `fake-${id}` }
      }
      // 网页、视频、文档的 AI 对话里问论文外的基础知识（功能小三件 3）：回答末尾单独一行〔前置知识〕；问眼前这一段的不标
      if (/什么是 softmax|什么是向量/.test(said)) {
        await say('这是眼前内容外的前置知识：softmax 把一串数变成加起来是 1 的一组权重，大的更大、小的更小。\n\n〔前置知识〕')
        return { text, session: r.session ?? `fake-${id}` }
      }
      if (/这一段讲了什么/.test(said)) {
        await say('这一段讲的是注意力怎么在几个词之间分配权重。')
        return { text, session: r.session ?? `fake-${id}` }
      }
      // AI 对话里要几句话的回答（选一句开旁支用）：周记总结成三句话
      if (/总结成三句话/.test(said)) {
        await say('这周主要在赶第5讲的作业，注意力机制那部分花了两个晚上才弄懂。\n\n周三开始每天早上跑步，三次都坚持下来了。\n\n下周要把论文计划的第一节写完，并约导师见一面。')
        return { text, session: r.session ?? `fake-${id}` }
      }
      // 右下角 AI 浮窗也能演被拦（同读 PDF 那条）：看出错那一句在浮窗里的样子
      if (said.includes('假装被拦'))
        throw new Error("API Error: Opus 5.5's safeguards flagged this message (https://www.anthropic.com/legal/aup). Please try rephrasing your request. Request ID: req_011FAKE")
      // 左栏选了好几个交给 AI（task-0tgz2）：照话里交来的那几篇答；「合成一篇」真用 note_create 建一篇（一次提交、能撤回）
      if (/选中的这几篇/.test(said)) {
        const picked = /问的「选中的这几篇」就是它们[^：]*：(.*)$/m.exec(prompt)?.[1]?.split('、') ?? []
        if (!picked.length) {
          await say('没收到选中的是哪几篇。')
          return { text, session: `fake-${id}` }
        }
        if (/合成一篇/.test(said)) {
          const names = picked.map((p) => p.split('/').pop()!.replace(/\.md$/, ''))
          await call('note_create', { title: '合成的笔记', text: names.map((n) => `## ${n}\n`).join('\n') })
          await say(`合成好了：《合成的笔记》，来自${picked.length}篇。`)
        } else await say(`这是测试回答（选中的${picked.length}篇：${picked.join('、')}）。`)
        return { text, session: `fake-${id}` }
      }
      // 网页工具一个个照写好的调（测试用）：「网页工具：[["web_select", {"label": "城市", "option": "上海"}], …]」。
      // 每个的结果原样说出来；回了「先问用户」就照它问一句、停下（同真 AI）；出错说一句、停下
      if (waiting && /^(可以|Yes)/.test(said)) {
        const [name, args] = waiting
        waiting = null
        const out = await call(name, { ...args, confirmed: true }).catch((e: Error) => `出错：${e.message}`)
        await say(`【${name}】${out}\n`)
        return { text, session: `fake-${id}` }
      }
      if (waiting && /^(不要|No)$/.test(said)) {
        waiting = null
        await say('好，不做了。')
        return { text, session: `fake-${id}` }
      }
      if (said.startsWith('网页工具：')) {
        waiting = null
        const steps = JSON.parse(said.slice('网页工具：'.length)) as [string, Record<string, unknown>][]
        for (const [name, args] of steps) {
          let out: string
          try {
            out = await call(name, args)
          } catch (e) {
            await say(`【${name}】出错：${(e as Error).message}\n`)
            break
          }
          const ask = /问用户一句「(.*?)」，然后停下/.exec(out)?.[1]
          if (ask) {
            waiting = [name, args]
            await say(`【${name}】${ask}\n`)
            break
          }
          await say(`【${name}】${out}\n`)
        }
        return { text, session: `fake-${id}` }
      }
      const did = await vaultCommand(said, call).catch((e: Error) => `没做成：${e.message}`)
      if (did !== null) {
        await say(`${did}。`)
        return { text, session: `fake-${id}` }
      }
      // 照写好的稿子演一段多轮对话（CN_FAKE_ROUNDS 指向一个 JSON：[{say, path, file, reply}]）：说到那句，就把那一篇整篇换成 file 里的字
      // （「存成命令」的测试：好几轮才把一篇改成想要的样子）
      const round = fakeRounds().find((x) => said.includes(x.say))
      if (round) {
        await call('note_write', { path: round.path, text: readFileSync(round.file, 'utf8'), mode: 'replace' })
        await say(round.reply ?? '改好了。')
        return { text, session: `fake-${id}` }
      }
      // 现在是什么模式：照引擎拿到的开关和话里开头那一行【模式】说（测试看开关真的传到了引擎）
      if (/什么模式/.test(said)) {
        const line = /【模式】(全能模式[开关]着)/.exec(prompt)?.[1] ?? '没写'
        await say(`引擎拿到的：全能模式${r.omni ? '开着' : '关着'}；话里写的：${line}。`)
        return { text, session: `fake-${id}` }
      }
      // 全能模式：像 Claude Code 用 Bash 跑一行命令（「跑命令「rm 甲.md」」）：做之前先问软件（beforeTool，手机全能模式在手机上点头），
      // 不放行就不跑、照实说；放行了真在库里跑
      if (/^跑命令「/.test(said) && r.omni) {
        const command = /「([^」]*)」/.exec(said)![1]!
        const input = { command }
        r.onStep?.({ id: 'c1', tool: 'Bash', input, status: 'run' })
        const deny = (await r.beforeTool?.('Bash', input, 'c1')) ?? null
        if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
        if (deny) {
          r.onStep?.({ id: 'c1', tool: 'Bash', input, status: 'err', detail: deny.split('\n')[0]! })
          await say('没跑：你没点头。')
          return { text, session: `fake-${id}` }
        }
        execFileSync('/bin/sh', ['-c', command], { cwd: r.cwd, timeout: 10_000 })
        r.onStep?.({ id: 'c1', tool: 'Bash', input, status: 'ok' })
        await say('跑好了。')
        return { text, session: `fake-${id}` }
      }
      // 全能模式：像 Claude Code 自己用 Write 那样直接写一个文件（不走我们的工具），报成步骤；关着就说做不了、请用户打开全能模式
      if (/^(自己写文件|跑命令写文件)「/.test(said)) {
        // 跑命令写：像 Claude Code 用 Bash 跑 python 那样写（步骤是「跑命令」，看不出改了哪个文件）
        const bash = said.startsWith('跑命令')
        const [file, body] = [...said.matchAll(/「([^」]*)」/g)].map((m) => m[1]!)
        if (!r.omni) {
          await say('全能模式关着，我不能自己写文件。请在 AI 输入框下面打开「全能模式」再说一次。')
          return { text, session: `fake-${id}` }
        }
        const abs = file!.startsWith('/') ? file! : join(r.cwd, file!)
        const step = bash ? { tool: 'Bash', input: { command: 'python3 /tmp/fix.py' } } : { tool: 'Write', input: { file_path: abs } }
        r.onStep?.({ id: 'w1', ...step, status: 'run' })
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, body ?? '')
        // 写完多答一会儿（测试在这一会儿里往编辑器里打字，看提交里不带用户的字；看「AI 在写这一段」还挂着）
        await stillAnswering(r.signal)
        r.onStep?.({ id: 'w1', ...step, status: 'ok' })
        await say(`写好了 ${file}。`)
        return { text, session: `fake-${id}` }
      }
      // 全能模式：像 Claude Code 自己用 Edit 那样往一篇末尾加一行，写之前先问软件（同一个文件另一段对话在写就等着），
      // 加完先说一句、等放行再答完（「〔等放行 X〕」）：AI 对话同时跑「同一文件同一时间只让一段对话写」
      if (/^排队在「[^」]*」末尾加「/.test(said) && r.omni) {
        const [file, line] = [...said.matchAll(/「([^」]*)」/g)].map((m) => m[1]!)
        const abs = join(r.cwd, file!)
        await r.beforeWrite?.(abs)
        if (r.signal.aborted) throw Object.assign(new Error('停下了'), { name: 'AbortError' })
        r.onStep?.({ id: 'q1', tool: 'Edit', input: { file_path: abs }, status: 'run' })
        writeFileSync(abs, `${readFileSync(abs, 'utf8').replace(/\s*$/, '')}\n\n${line}\n`)
        r.onStep?.({ id: 'q1', tool: 'Edit', input: { file_path: abs }, status: 'ok' })
        await say(`加好了「${line}」。`)
        return { text, session: `fake-${id}` }
      }
      // 全能模式：像 Claude Code 自己用 Edit 那样，过一会儿（CN_FAKE_OWN_MS）直接在一篇末尾加一行（用户正在编辑器里打这一篇的字）
      if (/^过一会儿在「[^」]*」末尾加「/.test(said) && r.omni) {
        const [file, line] = [...said.matchAll(/「([^」]*)」/g)].map((m) => m[1]!)
        const abs = join(r.cwd, file!)
        r.onStep?.({ id: 'e1', tool: 'Edit', input: { file_path: abs }, status: 'run' })
        await sleep(Number(process.env.CN_FAKE_OWN_MS ?? 0))
        writeFileSync(abs, `${readFileSync(abs, 'utf8').replace(/\s*$/, '')}\n\n${line}\n`)
        r.onStep?.({ id: 'e1', tool: 'Edit', input: { file_path: abs }, status: 'ok' })
        // CN_FAKE_TAIL_MS：写完再答一会儿（真 AI 写完还要说几句才答完）
        await sleep(Number(process.env.CN_FAKE_TAIL_MS ?? 0))
        await say(`加好了。`)
        return { text, session: `fake-${id}` }
      }
      // 全能模式：像用户截图（task-dtc34）那样用 Edit 直接在一篇末尾加「## 评价」和两段普通的字（不包成 [!ai] 块），看软件这一轮结束补包
      if (/^在「[^」]*」末尾写一节评价/.test(said) && r.omni) {
        const file = /「([^」]*)」/.exec(said)![1]!
        const abs = join(r.cwd, file)
        r.onStep?.({ id: 'e1', tool: 'Edit', input: { file_path: abs }, status: 'run' })
        await sleep(Number(process.env.CN_FAKE_OWN_MS ?? 0))
        const review = '## 评价\n\n开篇很克制：从杰姆胳膊肘骨折这件小事讲起，再说"过了一些年"兄妹俩回头谈起它。\n\n"事情就开始了"这一句把源头指向迪尔和怪人拉德利，先抛一个悬念。'
        writeFileSync(abs, `${readFileSync(abs, 'utf8').replace(/\s*$/, '')}\n\n${review}\n`)
        r.onStep?.({ id: 'e1', tool: 'Edit', input: { file_path: abs }, status: 'ok' })
        await say('我在文末加了一节「评价」，共两段。')
        return { text, session: `fake-${id}` }
      }
      // 全能模式：像 Claude Code 用 Edit 改用户原有的字（把「旧」换成「新」），不加新的段落
      if (/^把「[^」]*」里的「[^」]*」改成「[^」]*」/.test(said) && r.omni) {
        const [file, from, to] = [...said.matchAll(/「([^」]*)」/g)].map((m) => m[1]!)
        const abs = join(r.cwd, file!)
        r.onStep?.({ id: 'e1', tool: 'Edit', input: { file_path: abs }, status: 'run' })
        writeFileSync(abs, readFileSync(abs, 'utf8').replace(from!, to!))
        r.onStep?.({ id: 'e1', tool: 'Edit', input: { file_path: abs }, status: 'ok' })
        await say('改好了。')
        return { text, session: `fake-${id}` }
      }
      const url = /https?:\/\/\S+/.exec(said)?.[0]
      if (url && /打开/.test(said)) {
        await say('好，我在右栏打开它。')
        await call('web_open', { url })
        const page = await call('web_read')
        const title = /^标题：(.*)$/m.exec(page)?.[1] ?? ''
        await say(`\n\n打开了，网页标题是「${title}」。`)
      } else if (/剪/.test(said) && /网页/.test(said) && /整页/.test(said)) {
        // 整页剪进收件箱（web_clip whole=true：抽正文、图存进附件，剪藏去处 2026-11-25）
        await say('我把整页剪进收件箱。')
        await call('web_clip', { whole: true })
        await say('剪好了。')
      } else if (/剪/.test(said) && /网页/.test(said)) {
        // 网页里的几段剪进收件箱：一段一段去找、选中、剪（每段一个 web_clip，指针挨个去拿）
        const parts = [...said.matchAll(/「([^」]+)」/g)].map((m) => m[1]!)
        await say(`我把这${parts.length || 1}段剪进收件箱。`)
        if (!parts.length) await call('web_clip', {})
        for (const p of parts) await call('web_clip', { text: p })
        await say('剪好了。')
      } else if (/^整理当前白板/.test(said)) {
        await call('board_list')
        await call('board_arrange', { mode: 'columns' })
        await say('按列排整齐了。')
      } else if (/^加一张卡「/.test(said)) {
        // 只加一张卡：先看白板，再加（流光只亮这一张）
        await call('board_list')
        await call('board_add_card', { text: /「([^」]+)」/.exec(said)![1] })
        await say('加好了，在最后一节。')
      } else if (/卡片/.test(said) && /排/.test(said)) {
        const items = [...said.matchAll(/「([^」]+)」/g)].map((m) => m[1]!)
        const cards = items.length ? items : ['订机票', '订租车', '看极光']
        await call('board_list')
        await say(`我加 ${cards.length} 张卡片，`)
        for (const c of cards) await call('board_add_card', { text: c })
        const mode = /按列/.test(said) ? 'columns' : 'grid'
        await call('board_arrange', { mode })
        await say(`再${mode === 'grid' ? '按网格' : '按列'}排整齐。好了。`)
      } else if (/插入/.test(said)) {
        const what = /「([^」]+)」/.exec(said)?.[1] ?? 'AI 插入的一段'
        await call('doc_read')
        await call('doc_insert', { text: what })
        await say('插好了。')
      } else {
        const mats = materialCount(said)
        await say(/用的什么模型/.test(said) ? `${modelSaid(r)}（${LABELS[id]}）` : `这是测试回答（${LABELS[id]}${r.images?.length ? `，图 ${r.images.length} 张` : ''}${mats ? `，材料 ${mats} 块` : ''}）。`)
      }
      return { text, session: `fake-${id}` }
    },
  }
}
