/**
 * AI 回答用哪种语言（task-zojmg，2026-11-22 用户定）：默认跟界面语言（英文界面用英文答），用户用别的语言问就用那种语言答。
 * 给 AI 的提示词本身不翻（设计稿第 5 节），只把原来「用中文回答」那一句换成这里的。
 * 写进库里文件的（梦游的整理、写进笔记的格式）跟库语言，不归这里（设计稿第 4 节）。
 *
 * 用户用什么语言问由这里看字判断，交给 AI 的是一句直接的话，用要答的那种语言写（「用中文回答」「Answer in English」）。
 * 以前让 AI 自己判断（「默认用英文；用户用别的语言问就用那种」）靠不住：消息里软件加的几行、附上的笔记全是中文，
 * 真 Claude（Sonnet · Low）在英文界面把「123」答成中文；那句规矩改用英文写，4 次里还错 2 次（一次「123」答中文，一次中文问的答成英文）
 */
import { type Lang, uiLang } from './i18n'

/** 提示词里的语言名 */
const NAME: Record<Lang, string> = { zh: '中文', en: '英文' } // 不翻：给 AI 的提示词

/** 用户自己打的话是哪种语言写的；mixed 是几种都不少（交给 AI 看语法），null 是看不出（只有数字、符号，或者字太少） */
export type Wrote = 'zh' | 'ja' | 'ko' | 'latin' | 'other' | 'mixed' | null

export function wroteIn(said: string): Wrote {
  // 引的、贴的不算他自己的话：代码、[[双链]]、链接、邮箱、引号里的
  const own = said
    .replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/g, ' ')
    .replace(/「[^」]*」|『[^』]*』|“[^”]*”|‘[^’]*’|"[^"\n]*"/g, ' ')
  const count = (re: RegExp) => own.match(re)?.length ?? 0
  const han = count(/\p{Script=Han}/gu)
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)
  const hangul = count(/\p{Script=Hangul}/gu)
  const latin = count(/\p{Script=Latin}+/gu) // 按词数
  const other = count(/(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Latin}])\p{L})+/gu) // 别的文字，按词数
  // 一个汉字、假名、谚文算半个词；太少的不算（「ok」「嗯」看不出）
  const found: [Exclude<Wrote, 'mixed' | null>, number][] = []
  if (kana > 0 && kana + han >= 2) found.push(['ja', (kana + han) / 2])
  else if (han >= 2) found.push(['zh', han / 2])
  if (hangul >= 2) found.push(['ko', hangul / 2])
  if (latin >= 2) found.push(['latin', latin])
  if (other >= 1) found.push(['other', other])
  const [top, next] = found.sort((a, b) => b[1] - a[1])
  if (!top) return null
  // 夹着几个别的语言的词（名字、术语）照主体；两种都不少的看不准，交给 AI 看语法
  return !next || top[1] >= next[1] * 3 ? top[0] : 'mixed'
}

const ZH = '用中文回答' // 不翻：给 AI 的提示词
const EN = 'Answer in English'
const BY_WROTE: Record<'latin' | 'ja' | 'ko' | 'other' | 'mixed', string> = {
  latin: 'Answer in the language the user’s own words are written in (most likely English)',
  ja: 'Answer in Japanese, the language the user wrote in',
  ko: 'Answer in Korean, the language the user wrote in',
  other: 'Answer in the language the user’s own words are written in',
  mixed: '用户这句话夹着几种语言：句子主体是中文就用中文答，主体是别的语言就用那种语言答（看语法，不看夹在里面的名字、术语、标题） / The user’s words mix languages: answer in the language that carries the sentence', // 不翻：给 AI 的提示词
}

/**
 * 交给 AI 的「用哪种语言答」那一句（不带句号）。said 是用户自己打的那句话（不含软件加的说明、附上的笔记和网页）；
 * 没有（命令、框一块问）或看不出语言就照界面语言：中文界面和以前一样是「用中文回答」
 */
export function answerRule(said?: string, lang: Lang = uiLang()): string {
  const w = said === undefined ? null : wroteIn(said)
  if (w === null) return lang === 'en' ? EN : ZH
  return w === 'zh' ? ZH : BY_WROTE[w]
}

/** 每条消息开头那一行【语言】（AI 对话、旁支、读 PDF）；标签不翻（系统提示里认的是【语言】），句号跟着那一句的语言 */
export function answerLine(said?: string, lang: Lang = uiLang()): string {
  const rule = answerRule(said, lang)
  return `【语言】${rule}${/\p{Script=Han}$/u.test(rule) ? '。' : '.'}` // 不翻：给 AI 的提示词
}

/** 只要语言名的地方：「用英文」 */
export const answerLangName = (lang: Lang = uiLang()): string => NAME[lang]
