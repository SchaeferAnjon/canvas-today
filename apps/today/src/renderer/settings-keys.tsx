/**
 * 设置 › 快捷键（对标清单 U5，照画布笔记 settings/keys.tsx 方向 A，照 Obsidian）：顶上搜、只看已设的；命令表（shared/keymap.ts）里每一条一行，没有默认键的也在；
 * 点键位再按新的组合就换，撞了别的当场说撞了谁、能「换给这一条」「两个对调」，改过的能回到默认、能清掉。
 * 键存在哪：命令的在设置 keys 里；快速加一条是全局键（settings.quickKey，主进程重新注册），和设置 › 一般那一行是同一个键。
 */
import { Codicon } from '@cn/design'
import { Group, Row, Toggle, useSaid } from '@cn/design/settings'
import { useEffect, useRef, useState } from 'react'
import { clashOf, isCustom, KEY_SECTIONS, keyDef, type KeyId, type KeyOverrides, keyProblem, KEYMAP, keysOf, type KeySection, resetKey, setKey } from '../shared/keymap'
import { comboOf, quickKeyProblem } from '../shared/quick'
import type { Key } from '../shared/i18n'
import { getData, saveSettings, useData, useLang } from './store'
import { useT } from './ui'

export interface KeySlot {
  id: KeyId
  label: string
  desc: string
  keys: string[]
  fixed: boolean
  quick: boolean
  custom: boolean
  /** 默认的键（回到默认那颗的悬停用） */
  def: string | null
  section: KeySection
}

const SECTION_NAME: Record<KeySection, Key> = { global: 'kSecGlobal', go: 'kSecGo', view: 'kSecView', task: 'kSecTask', fixed: 'kSecFixed' }

/** 现在每个键是什么（这一页和一般页的快速加一条那一行共用） */
export function useKeySlots(): KeySlot[] {
  const t = useT()
  const s = useData().state!.settings
  return KEYMAP.map((d) => ({
    id: d.id,
    label: t(d.name as 'kSearch'),
    desc: d.hint ? t(d.hint as 'kSearchHint') : '',
    keys: keysOf(d.id, s),
    fixed: !!d.fixed,
    quick: !!d.quick,
    custom: isCustom(d.id, s.keys),
    def: d.keys[0] ?? null,
    section: d.section,
  }))
}

/** 设置里存的那两样（快速加一条的键、命令的键）一起改 */
const putKeys = (p: { quickKey?: string; keys?: KeyOverrides }) => saveSettings(p)

/**
 * 键位按钮和撞键那一句：点了开始录（「按新的组合键…」），再按一个组合；esc 取消。
 * 一般页的「快速加一条的快捷键」也用它判撞没撞（和这一页的「快速加一条」是同一个键）
 */
export function useKeyRecorder(slots: KeySlot[]) {
  const t = useT()
  const lang = useLang()
  const said = useSaid()
  const [rec, setRec] = useState<KeyId | null>(null)
  /** 撞键、不能给的那一句；pending 是刚按的键（键位上先写它，待定样子），take 换给这一条，swap 两个对调 */
  const [warn, setWarn] = useState<{ id: KeyId; text: string; pending?: string; take?: () => void; swap?: () => void } | null>(null)

  const problemFor = (slot: KeySlot, combo: string) => (slot.quick ? quickKeyProblem(combo, lang, true) : keyProblem(combo, lang))

  async function record(slot: KeySlot, combo: string) {
    setRec(null)
    const bad = problemFor(slot, combo)
    if (bad) return setWarn({ id: slot.id, text: bad })
    if (slot.keys.length === 1 && combo === slot.keys[0]) return setWarn(null)
    const s = getData().state!.settings
    const clash = clashOf(slot.id, combo, s)
    const other = clash ? slots.find((x) => x.id === clash) : undefined
    const put = (id: KeyId, c: string | null, keys: KeyOverrides | undefined) => (keyDef(id).quick ? { quickKey: c! } : { keys: setKey(keys, id, c) })
    if (!other) {
      setWarn(null)
      await putKeys(put(slot.id, combo, s.keys))
      return said.say(t('kSet', slot.label, combo))
    }
    const mine = slot.keys[0] ?? null
    // 换给这一条：那一条让出来（快速加一条不能空着）
    const canTake = !other.quick
    // 对调：那一格要放得下这一格原来的键
    const canSwap = !!mine && !(other.quick ? quickKeyProblem(mine, lang, true) : keyProblem(mine, lang))
    if (!canSwap && !canTake) return setWarn({ id: slot.id, text: t('kTakenPick', combo, other.label) })
    setWarn({
      id: slot.id,
      text: t('kTaken', combo, other.label),
      pending: combo,
      take: !canTake
        ? undefined
        : () => {
            setWarn(null)
            const now = getData().state!.settings
            const a = put(slot.id, combo, now.keys)
            const keys = setKey(a.keys ?? now.keys, other.id, null)
            void putKeys({ ...a, keys }).then(() => said.say(t('kTook', slot.label, combo, other.label)))
          },
      swap: !canSwap
        ? undefined
        : () => {
            setWarn(null)
            const now = getData().state!.settings
            const a = put(slot.id, combo, now.keys)
            const b = put(other.id, mine, a.keys ?? now.keys)
            void putKeys({ ...a, ...b, keys: b.keys ?? a.keys ?? now.keys }).then(() => said.say(t('kSwapped', slot.label, combo, other.label, mine!)))
          },
    })
  }

  // 撞键那一句开着时 esc 取消（不关设置）
  useEffect(() => {
    if (!warn?.pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setWarn(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [warn])

  useEffect(() => {
    if (!rec) return
    const slot = slots.find((x) => x.id === rec)
    if (!slot) return
    const onKey = (e: KeyboardEvent) => {
      // 录键时这个键不交给软件别处（⌘K 不开搜索、esc 不关设置）
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') return setRec(null)
      if (['Meta', 'Shift', 'Alt', 'Control', 'CapsLock'].includes(e.key)) return
      const combo = comboOf(e)
      if (combo) void record(slot, combo)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rec, slots])

  const button = (slot: KeySlot) =>
    slot.fixed ? (
      <span className="sa-keyb fixed" aria-label={t('kFixedAria', slot.label, slot.keys.join(' '))} title={t('kFixedTip')}>
        {slot.keys.join(' ')}
      </span>
    ) : (
      <button
        type="button"
        className={'sa-keyb' + (rec === slot.id ? ' rec' : warn?.id === slot.id && warn.pending ? ' pend' : !slot.keys.length ? ' none' : '')}
        aria-label={t('kChangeAria', slot.label)}
        data-key-id={slot.id}
        onClick={() => {
          setWarn(null)
          setRec(rec === slot.id ? null : slot.id)
        }}
      >
        {rec === slot.id ? t('kPress') : warn?.id === slot.id && warn.pending ? warn.pending : slot.keys.length ? slot.keys.join(' ') : t('kNone')}
      </button>
    )

  /** 撞键那一句：这一行的第二行（顶替说明），「换给这一条 · 两个对调」 */
  const line = (slot: KeySlot) =>
    warn?.id === slot.id ? (
      <span className="sa-kclash" role="alert">
        {warn.text}
        {warn.take && (
          <button type="button" className="sa-lnk" onClick={warn.take}>
            {t('kTake')}
          </button>
        )}
        {warn.take && warn.swap && <span className="sep">·</span>}
        {warn.swap && (
          <button type="button" className="sa-lnk" onClick={warn.swap}>
            {t('kSwap')}
          </button>
        )}
      </span>
    ) : undefined

  return { button, line, warn }
}

export function KeysPage() {
  const t = useT()
  const said = useSaid()
  const slots = useKeySlots()
  const { button, line } = useKeyRecorder(slots)
  const [q, setQ] = useState('')
  const [onlySet, setOnlySet] = useState(false)
  const k = q.trim().toLowerCase()
  // 搜了、换了「只看已设的」：回到顶上；搜索那一行贴在顶上，滚下去时下面一道线
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bar.current?.closest('.set-body')?.scrollTo({ top: 0 })
  }, [k, onlySet])
  useEffect(() => {
    const el = bar.current
    const body = el?.closest('.set-body')
    if (!el || !body) return
    const on = () => el.classList.toggle('stuck', body.scrollTop > el.offsetTop - 4)
    body.addEventListener('scroll', on, { passive: true })
    return () => body.removeEventListener('scroll', on)
  }, [])
  const shown = (x: KeySlot) => (!onlySet || x.keys.length > 0) && (!k || x.label.toLowerCase().includes(k) || x.keys.some((y) => y.toLowerCase().includes(k)) || x.desc.toLowerCase().includes(k))
  // 提示条只说一句（同画布笔记快捷键页：每一行自己有回到默认）
  const change = async (p: { keys: KeyOverrides }, hint: string) => {
    await putKeys(p)
    said.say(hint)
  }
  /** 清掉、回到默认（Obsidian 每条右边那两颗）：两颗一直占着位置（不能用时看不见），一列一列对齐 */
  const tools = (x: KeySlot) =>
    x.fixed || x.quick ? null : (
      <>
        <button
          type="button"
          className="sa-btn ghost sa-ic"
          hidden={!x.custom}
          aria-label={t('kResetAria', x.label)}
          title={t('kResetTip', x.def)}
          onClick={() => void change({ keys: resetKey(getData().state!.settings.keys, x.id) }, t('kResetSaid', x.label, x.def))}
        >
          <Codicon name="discard" size={14} />
        </button>
        <button
          type="button"
          className="sa-btn ghost sa-ic"
          hidden={!x.keys.length}
          aria-label={t('kClearAria', x.label)}
          title={t('kClearTip')}
          onClick={() => void change({ keys: setKey(getData().state!.settings.keys, x.id, null) }, t('kCleared', x.label))}
        >
          <Codicon name="close" size={14} />
        </button>
      </>
    )
  const groups = KEY_SECTIONS.map((sec) => ({ sec, rows: slots.filter((x) => x.section === sec && shown(x)) })).filter((g) => g.rows.length)
  return (
    <>
      <div className="sa-keytools" ref={bar}>
        <label className="sa-srch">
          <Codicon name="search" size={14} />
          <input value={q} placeholder={t('kSrchPh')} aria-label={t('kSrchAria')} onChange={(e) => setQ(e.currentTarget.value)} />
        </label>
        <label className="sa-only">
          <Toggle on={onlySet} label={t('kOnlySet')} onChange={setOnlySet} />
          {t('kOnlySet')}
        </label>
      </div>
      {groups.map((g) => (
        <Group key={g.sec} title={t(SECTION_NAME[g.sec])}>
          {g.rows.map((x) => (
            <Row key={x.id} id={`k-${x.id}`} label={x.label} desc={line(x) ?? x.desc}>
              {tools(x)}
              {button(x)}
            </Row>
          ))}
        </Group>
      ))}
      {!groups.length && <p className="sa-note">{t('kNoHit', q.trim())}</p>}
      <p className="sa-note">{t('kNote')}</p>
    </>
  )
}
