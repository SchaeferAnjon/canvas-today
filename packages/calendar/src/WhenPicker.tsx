/**
 * 定日子和时间的选择器（task-pd289，「在文件里写 todo 时怎么写时间」第二种：自己选）：画布笔记文档、白板卡、待办三处和画布今日共用这一个。
 * 从上往下：今天 / 明天 / 下周一（原来「定日子」那个小菜单，task-kzr3n，点了选定就关上）、小月历（点一天改成那天，不关）、
 * 钟点 / 提醒 / 重复三行（选了就写）、「清掉」（日子、钟点、提醒、重复都拿掉）。改什么都马上交给宿主写进那一行（onChange），
 * 关上（esc、点外面）不用再按「好」。写法、选项都照 @cn/tasks（setWhen、TIME_CHOICES…），宿主只管写进哪一行。
 *
 * 键盘：方向键在小月历上挪（←→ 一天、↑↓ 一周、PageUp / PageDown 一个月），↵ 选定挪到的那天并关上，esc 关上。
 * 光标留在编辑器里的宿主（文档里打 @、按快捷键打开的）把键转进来：keys.current?.(key)，接了返回 true。
 */
import { Codicon } from '@cn/design'
import { addDays, addMonths, type ISODate, quickDays, REMIND_CHOICES, repeatChoices, TIME_CHOICES, type WhenFields, withCurrent } from '@cn/tasks'
import { type MutableRefObject, useEffect, useRef, useState } from 'react'
import { MiniMonth } from './MiniMonth'
import type { WeekStart } from './model'
import { CAL_TEXT, type CalLang, mdOf, remindText, repeatText } from './text'

export interface WhenPickerProps {
  lang: CalLang
  today: ISODate
  /** 那一行现在写着的 */
  value: WhenFields
  weekStart?: WeekStart
  /** 改了一项：交回整个新的样子；close 是选完了（今天 / 明天 / 下周一、↵） */
  onChange(next: WhenFields, opts: { close: boolean }): void
  onClose(): void
  /** 宿主把键盘转进来（光标留在编辑器里时）；接了返回 true */
  keys?: MutableRefObject<((key: string) => boolean) | null>
  /** 键盘打开的（打 @、快捷键）：底下多一行键怎么用 */
  keyboard?: boolean
}

const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export function WhenPicker({ lang, today, value, weekStart = 0, onChange, onClose, keys, keyboard }: WhenPickerProps) {
  const T = CAL_TEXT[lang]
  const [focus, setFocus] = useState<ISODate>(value.date ?? today)
  const [month, setMonth] = useState<string>((value.date ?? today).slice(0, 7))
  // 外面改了日子（这一行刚被写过）：键盘那一格跟着
  const last = useRef(value.date)
  useEffect(() => {
    if (value.date === last.current) return
    last.current = value.date
    if (value.date) {
      setFocus(value.date)
      setMonth(value.date.slice(0, 7))
    }
  }, [value.date])

  const set = (p: Partial<WhenFields>, close = false) => {
    const next: WhenFields = { ...value, ...p }
    // 没有日子：钟点、提醒挂不上，日子算今天（和 @cn/tasks setTime 一样）
    if ((next.time || next.remind) && !next.date) next.date = today
    onChange(next, { close })
  }
  const pickDay = (d: ISODate, close: boolean) => {
    setFocus(d)
    set({ date: d }, close)
  }
  const move = (d: ISODate) => {
    setFocus(d)
    setMonth(d.slice(0, 7))
  }

  const handle = useRef<(key: string) => boolean>(() => false)
  handle.current = (key: string) => {
    switch (key) {
      case 'ArrowLeft':
        return (move(addDays(focus, -1)), true)
      case 'ArrowRight':
        return (move(addDays(focus, 1)), true)
      case 'ArrowUp':
        return (move(addDays(focus, -7)), true)
      case 'ArrowDown':
        return (move(addDays(focus, 7)), true)
      case 'PageUp':
        return (move(addMonths(focus, -1)), true)
      case 'PageDown':
        return (move(addMonths(focus, 1)), true)
      case 'Enter':
        return (pickDay(focus, true), true)
      case 'Escape':
        return (onClose(), true)
    }
    return false
  }
  useEffect(() => {
    if (!keys) return
    keys.current = (k) => handle.current(k)
    return () => void (keys.current = null)
  }, [keys])

  const quick = quickDays(today)
  const label = (k: (typeof quick)[number]['kind'], d: ISODate) => (k === 'today' ? T.today : k === 'tomorrow' ? T.tomorrow : k === 'nextMonday' ? T.nextMon : T.wd[new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))).getUTCDay()]!)
  const keep = (e: { preventDefault(): void }) => e.preventDefault()
  const row = (icon: 'watch' | 'bell' | 'sync', name: string, v: string | null, all: string[], none: string, show: (o: string) => string, put: (o: string | null) => void, disabled?: string) => (
    <label className={cls('cal-when-row', disabled && 'off')} title={disabled}>
      <Codicon name={icon} size={14} />
      <span className="cal-when-lb">{name}</span>
      <span className="cal-when-sel">
        <select aria-label={name} value={v ?? ''} disabled={!!disabled} onChange={(e) => put(e.target.value || null)}>
          <option value="">{none}</option>
          {all.map((o) => (
            <option key={o} value={o}>
              {show(o)}
            </option>
          ))}
        </select>
        <Codicon name="chevron-down" size={12} />
      </span>
    </label>
  )
  return (
    <div
      className="cal-when"
      role="dialog"
      tabIndex={-1}
      aria-label={T.whenTitle}
      onKeyDown={(e) => {
        // 自己有焦点时（待办三处、画布今日）：下拉框里的方向键留给下拉框
        if ((e.target as HTMLElement).tagName === 'SELECT' && e.key !== 'Escape') return
        if (handle.current(e.key)) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div className="cal-when-q" role="menu" aria-label={T.whenTitle}>
        {quick.map((q) => (
          <button key={q.kind} type="button" role="menuitem" className={cls('cal-when-qi', value.date === q.date && 'on')} onMouseDown={keep} onClick={() => pickDay(q.date, true)}>
            {label(q.kind, q.date)}
            <span className="k">{mdOf(lang, q.date)}</span>
          </button>
        ))}
      </div>
      <div className="cal-when-sep" />
      <MiniMonth lang={lang} month={month} today={today} marks={new Set()} weekStart={weekStart} sel={value.date} focus={focus} onMonth={(m) => setMonth(m)} onPick={(d) => pickDay(d, false)} />
      <div className="cal-when-sep" />
      {row('watch', T.time, value.time, withCurrent(TIME_CHOICES, value.time), T.noTime, (o) => o, (o) => set({ time: o }))}
      {row('bell', T.remind, value.remind, withCurrent(REMIND_CHOICES, value.remind), T.noRemind, (o) => remindText(lang, o), (o) => set({ remind: o }), value.date ? undefined : T.needDate)}
      {row('sync', T.repeat, value.repeat, withCurrent(repeatChoices(value.date), value.repeat), T.noRepeat, (o) => repeatText(lang, o), (o) => set({ repeat: o }))}
      <div className="cal-when-sep" />
      <button
        type="button"
        className="cal-when-qi cal-when-clear"
        title={T.clearTip}
        disabled={!value.date && !value.time && !value.remind && !value.repeat}
        onMouseDown={keep}
        onClick={() => onChange({ date: null, time: null, remind: null, repeat: null }, { close: true })}
      >
        <Codicon name="close" size={14} />
        {T.clear}
      </button>
      {keyboard && <div className="cal-when-keys">{T.keysHint}</div>}
    </div>
  )
}
