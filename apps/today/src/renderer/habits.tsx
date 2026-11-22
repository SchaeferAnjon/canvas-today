/**
 * 习惯（照 v2 原型 habitView）：每个习惯一行 56 高，名字、「每天 · 连续2次 · 习惯/背 30 个单词.md」，前六天的小方块（打了卡的强调色淡底、
 * 该打没打的空心框、不用打的空着），最右是今天的打卡框（不用打的那天写「休」）。点前六天的小方块是补打卡 / 取消那天的，右键一行是系统菜单。
 * 原型里没有「加一个」：习惯是「习惯」文件夹里的一篇篇笔记，这里在列表下面加一行能直接建（多久一次照 HABIT_RULES）。
 */
import { useState } from 'react'
import { HABIT_RULES, habitWeek, streakOf, weekday } from '@cn/tasks'
import type { HabitView, Snapshot } from '../shared/api'
import { repeatLabel, tr } from '../shared/i18n'
import { mdLabel } from '../shared/when'
import { useActions } from './actions'
import { useLang } from './store'
import { Ic, useT } from './ui'

export function HabitsView({ snap, today }: { snap: Snapshot; today: string }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  const [name, setName] = useState('')
  const [rule, setRule] = useState(HABIT_RULES[0]!)
  return (
    <>
      <div className="vhead">
        <h1>{t('habit')}</h1>
        <span className="t2">{t('habitSub')}</span>
      </div>
      <div className="mbody" data-part="习惯打卡">
        {snap.habits.map((h) => (
          <HabitRow key={h.path} h={h} today={today} />
        ))}
        {!snap.habits.length && (
          <div className="empty">
            <Ic n="history" s={32} />
            <b>{t('habitEmpty')}</b>
            <p>{t('habitEmptySub')}</p>
          </div>
        )}
        <div className="habadd" data-part="加一个习惯">
          <Ic n="add" s={14} />
          <input
            value={name}
            placeholder={t('habitNewPh')}
            aria-label={t('habitNewPh')}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing || !name.trim()) return
              if (await a.habitNew(name.trim(), rule)) setName('')
            }}
          />
          <select className="sel" aria-label={t('habitRuleAria')} value={rule} onChange={(e) => setRule(e.target.value)}>
            {HABIT_RULES.map((r) => (
              <option key={r} value={r}>
                {repeatLabel(lang, r)}
              </option>
            ))}
          </select>
        </div>
        <div className="store">
          <Ic n="database" s={12} />
          <span>{t('habitStore', today)}</span>
        </div>
      </div>
    </>
  )
}

function HabitRow({ h, today }: { h: HabitView; today: string }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  const w = habitWeek(h, today)
  const state = (s: 'done' | 'miss' | 'rest') => t(s === 'done' ? 'habitDone' : s === 'miss' ? 'habitMiss' : 'habitRestDay')
  return (
    <div
      className="hab"
      data-habit={h.path}
      onContextMenu={(e) => {
        e.preventDefault()
        a.habitMenu(h)
      }}
    >
      <div className="hn">
        <b>{h.name}</b>
        <span>{t('habitLine', repeatLabel(lang, h.rule), streakOf(h, today), h.path)}</span>
      </div>
      <div className="days">
        {w.days.map((d) => (
          <button
            key={d.date}
            className={d.state === 'done' ? 'y' : d.state === 'miss' ? 'x' : ''}
            aria-label={t('habitDayAria', `${mdLabel(lang, d.date)} ${tr(lang, 'wd')[weekday(d.date)]}`, state(d.state))}
            title={`${mdLabel(lang, d.date)} · ${state(d.state)}`}
            disabled={h.readOnly}
            onClick={() => a.habitCheck(h, d.date, d.state !== 'done')}
          >
            {d.state === 'rest' ? '' : tr(lang, 'wdShort')[weekday(d.date)]}
          </button>
        ))}
      </div>
      {w.today === 'rest' ? (
        <span className="hrest t3 sm">{t('habitRest')}</span>
      ) : (
        <button className={`hcheck${w.today === 'done' ? ' on' : ''}`} aria-label={w.today === 'done' ? t('habitUncheckAria', h.name) : t('habitCheckAria', h.name)} aria-pressed={w.today === 'done'} disabled={h.readOnly} onClick={() => a.habitCheck(h, today, w.today !== 'done')}>
          {w.today === 'done' && <Ic n="check" s={14} />}
        </button>
      )}
    </div>
  )
}
