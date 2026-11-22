/**
 * AI 回答用哪种语言（task-zojmg，2026-11-22 用户定）：默认跟界面语言（英文界面用英文答），用户用别的语言问就用那种语言答。
 * 给 AI 的提示词本身不翻（设计稿第 5 节），只把原来「用中文回答」那一句换成这里的。
 * 写进库里文件的（梦游的整理、写进笔记的格式）跟库语言，不归这里（设计稿第 4 节）。
 */
import { type Lang, uiLang } from './i18n'

/** 提示词里的语言名 */
const NAME: Record<Lang, string> = { zh: '中文', en: '英文' } // 不翻：给 AI 的提示词

/** 「用哪种语言答」那一句（不带句号） */
export const answerRule = (lang: Lang = uiLang()): string => `默认用${NAME[lang]}回答；用户用别的语言问，就用他问的那种语言答` // 不翻：给 AI 的提示词

/** 只要语言名的地方：「用英文」 */
export const answerLangName = (lang: Lang = uiLang()): string => NAME[lang]
