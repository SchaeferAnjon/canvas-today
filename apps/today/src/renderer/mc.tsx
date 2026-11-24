/**
 * MeetCaption 联动（画布今日这一侧，main/mc.ts）在界面上的两样：
 * - 今日页「今天的课」：照课表、对上的日历日程列今天的课，还没下课的旁边一颗「开字幕」（走 meetcaption://start），正在上课写「上课中 · N 分钟」和「打开字幕」；
 *   下面列这节课的上课记录里还没定日子的待办（定了日子的照常在「今天」「明天」那几组里）。没装 MeetCaption、库里没有 meetcaption.json 时整块不画。
 * - 待办行上的「来自 ECP 09:43」：点了在画布笔记里打开那一篇、到那一秒。
 */
import { useEffect, useState } from 'react'
import type { TaskView } from '../shared/api'
import { notOver, srcCourse } from '../shared/mc'
import { useActions } from './actions'
import { nowMs, useData } from './store'
import { Ic, useT } from './ui'
import { Row } from './views'

/** 当天第几分钟，半分钟跟一次 */
function useNowMin(): number {
  const { offset } = useData()
  const calc = () => {
    const d = new Date(nowMs())
    return d.getHours() * 60 + d.getMinutes()
  }
  const [m, setM] = useState(calc)
  useEffect(() => {
    setM(calc())
    const id = setInterval(() => setM(calc()), 30_000)
    return () => clearInterval(id)
  }, [offset])
  return m
}

export function McToday({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const { mc } = useData()
  const t = useT()
  const a = useActions()
  const nowMin = useNowMin()
  if (!mc?.installed || !mc.classes.length) return null
  const live = mc.live
  return (
    <div className="mctoday" data-part="今天的课">
      <div className="grp">
        <Ic n="mortar-board" s={12} />
        {t('mcToday')}
        <span className="n">{mc.classes.length}</span>
      </div>
      {mc.classes.map((c) => {
        const on = !!live && live.project === c.project.id
        // 这节课的记录里还没定日子、没勾的（MeetCaption 正写着的那一篇，或者今天写进这门课文件夹的）
        const todos = tasks.filter((x) => x.mc && !x.date && !x.done && !x.cancelled && !x.dupOf && x.mc.date === today && (x.path === live?.file || x.path.startsWith(c.project.folder + '/')))
        return (
          <div className="mccls" key={c.key} data-key={c.key}>
            <div className={`mcrow${on ? ' live' : ''}`}>
              <span className="tm">{`${c.start}–${c.end}`}</span>
              <span className="nm">{c.name}</span>
              <span className="via">{c.via === 'calendar' ? t('mcViaCal', c.event ?? '') : t('mcViaSchedule')}</span>
              <span className="sp" />
              {on ? (
                <>
                  <span className="livetag">
                    <i className="dot" />
                    {t('mcLiveFor', Math.max(0, Math.round((nowMs() - live!.startedAt) / 60_000)))}
                  </span>
                  <button className="btn sm" onClick={() => void window.ct.mcOpenLive()}>
                    {t('mcOpenLive')}
                  </button>
                </>
              ) : (
                !live &&
                notOver(c, nowMin) && (
                  <button className="btn sm pri" data-testid="mc-start" onClick={() => a.mcStart(c.key, c.name)}>
                    <Ic n="mic" s={12} />
                    {t('mcStart')}
                  </button>
                )
              )}
            </div>
            {todos.map((x) => (
              <Row key={x.key} t={x} today={today} sel={false} flash={false} showNote={false} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** 待办行上「来自 ECP 09:43」 */
export function McSrcChip({ t: x }: { t: TaskView }) {
  const { mc } = useData()
  const t = useT()
  const a = useActions()
  if (!x.mc) return null
  const course = srcCourse(x.mc, x.path, mc?.projects ?? [])
  return (
    <span
      className="acc mcsrc"
      role="button"
      data-part="来自哪节课"
      title={t('mcSrcTip', x.path)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        a.mcJump(x)
      }}
    >
      <Ic n="play" s={11} />
      {t('mcFrom', course, x.mc.clock)}
    </span>
  )
}
