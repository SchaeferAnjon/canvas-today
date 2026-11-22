/**
 * 英文表：按区分文件（设计稿第 5 节「英文表按批分文件，改动好看」），这里合成一张。
 * 同一个键只能出现在一个文件里（test/i18n.test.ts 查）；几处都用的放 common。
 * 措辞照设计稿第 3 节的词表：句首大写、按钮动词开头、不用 please、引号用 “ ”、点了还要再选的加 …、单复数、美式拼写。
 */
import type { Table } from './core'
import { COMMON } from './en/common'
import { SETTINGS } from './en/settings'
import { PALETTE } from './en/palette'
import { SHELL } from './en/shell'
import { FILE_TEXT } from './en/file-text'
import { MINDMAP } from './en/mindmap'

/** 每张分表（测试按文件查重、查占位） */
export const EN_PARTS: Readonly<Record<string, Table>> = { common: COMMON, settings: SETTINGS, palette: PALETTE, shell: SHELL, 'file-text': FILE_TEXT, mindmap: MINDMAP }

export const EN: Table = Object.assign({}, ...Object.values(EN_PARTS)) as Table
