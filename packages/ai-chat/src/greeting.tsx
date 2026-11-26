/**
 * 空对话（画布笔记 task-0tgz2，小样 design/ai-empty 方向 A「贴着输入框」，家族对话框样式统一时从画布笔记 ai-quick.tsx 搬来）：
 * 消息区底下一句问候（Greeting），输入框上面一排快捷命令（QuickRow）。画布笔记的 AI 对话、读 PDF，ParaRead、MeetCaption 的空对话都用它。
 * 问候放不下时由调用的那一格收（.ai-empty 的 tight1 / tight2、.reading-ai 下的容器查询，样子在 greeting.css）。
 * 图标走宿主的 icon()（名字），引擎标志走 EngineLogo，字走 useUi().t。
 */
import { useDismiss } from '@cn/design/dismiss'
import { forwardRef, Fragment, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { Icon, useUi } from './context'
import { EngineLogo } from './engine-logo'
import './greeting.css'

/** 钟点问候（中文原句，画的时候过 t()） */
export function hello(hour: number): string {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/**
 * 引擎标志 22 + 钟点问候（宋体 600 22），下面一句（13 --t2）跟着在看的东西走。
 * engine：谁来答（画那一家的标志；没接 AI 时给 null，不画任何一家）；logo：宿主自己画的标志（给了就不看 engine）
 */
export const Greeting = forwardRef<HTMLDivElement, { engine?: string | null; logo?: ReactNode; ask: string; testId?: string }>(function Greeting(props, ref) {
  const { t } = useUi()
  // 五句都写成 t('…')：各软件的翻译表扫得到
  const said: Record<string, string> = { 夜深了: t('夜深了'), 早上好: t('早上好'), 中午好: t('中午好'), 下午好: t('下午好'), 晚上好: t('晚上好') }
  return (
    <div className="ai-empty ai-greet" data-testid={props.testId ?? 'ai-greet'} ref={ref}>
      <div className="hi">
        {props.logo ?? (props.engine ? <EngineLogo id={props.engine} size={22} /> : null)}
        <h2>{said[hello(new Date().getHours())]}</h2>
      </div>
      <p>{props.ask}</p>
    </div>
  )
})

/** 一颗快捷命令：icon 是宿主 icon() 认的名字，engine 给了画那一家的标志（交给 AI 跑的，偏好「AI 图标用引擎标志」）；tip 是悬停提示 */
export interface Quick {
  text: string
  icon?: string
  engine?: string
  tip?: string
  /** 自己存的命令（画布笔记 task-9womr）：排在一道竖线后面，图标用强调色 */
  own?: boolean
  /** 变淡、点不动（正在列核心概念这种） */
  disabled?: boolean
  go(): void
}

/**
 * 输入框上面一排小按钮（28 高、圆角 8）：放不下的从后往前收进最后一颗「⋯」，点开先列收起的几条，一道线，
 * 最后「全部命令 /」（onAll，就是在输入框打「/」）；不换第二排
 */
export function QuickRow(props: { items: Quick[]; /** 「⋯」最后一行「全部命令 /」；不给没有这一行 */ onAll?(): void; testId?: string }) {
  const { t } = useUi()
  const row = useRef<HTMLDivElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** 露着几颗（其余收进「⋯」） */
  const [shown, setShown] = useState(props.items.length)
  const [menu, setMenu] = useState(false)
  const sig = props.items.map((i) => i.text).join('|')

  // 量放得下几颗：先全露着量，不够就让出「⋯」那一格，从后往前收
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const fit = () => {
      const btns = [...el.querySelectorAll<HTMLElement>('.qc:not(.more)')]
      const gap = 6
      const room = el.clientWidth
      // 自己的命令前面那道竖线（1 宽、左右各 2，加一个间距）：露着自己的命令时才算它
      const sep = 5 + gap
      const firstOwn = btns.findIndex((b) => b.classList.contains('own'))
      const widths = btns.map((b, i) => b.offsetWidth + (i === firstOwn ? sep : 0))
      const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, widths.length - 1)
      if (total <= room) return setShown(widths.length)
      const more = 28 + gap
      let used = 0
      let n = 0
      for (const w of widths) {
        const next = used + (n ? gap : 0) + w
        if (next + more > room) break
        used = next
        n++
      }
      setShown(n)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sig])

  // 点外面、esc 收起（全软件的弹层同一个 @cn/design/dismiss，偏好「弹框点外面就关」）
  useDismiss(menu, [menuRef, moreBtn], () => setMenu(false), { esc: 'late' })

  const glyph = (q: Quick) => (q.engine ? <EngineLogo id={q.engine} size={14} className="ai-ic" /> : <Icon name={q.icon ?? 'comment-discussion'} size={14} className="qi" />)
  const folded = props.items.slice(shown)
  return (
    <div className="aiq">
      <div className="qrow" ref={row} data-testid={props.testId ?? 'ai-quick'}>
        {/* 收起的也画着（visibility: hidden 量宽度），不然量不出哪几颗放得下 */}
        {props.items.map((q, i) => (
          <Fragment key={q.text}>
            {q.own && !props.items[i - 1]?.own && <span className={'qsep' + (i < shown ? '' : ' folded')} aria-hidden />}
            <button
              className={'qc' + (q.own ? ' own' : '') + (i < shown ? '' : ' folded')}
              title={q.tip}
              tabIndex={i < shown ? 0 : -1}
              aria-hidden={i < shown ? undefined : true}
              aria-disabled={q.disabled || undefined}
              onClick={q.disabled ? undefined : q.go}
            >
              {glyph(q)}
              <span>{q.text}</span>
            </button>
          </Fragment>
        ))}
        <button ref={moreBtn} className={'qc more' + (menu ? ' on' : '')} aria-label={t('更多命令')} title={t('更多命令')} hidden={!folded.length} onClick={() => setMenu(!menu)}>
          <Icon name="ellipsis" size={14} className="qi" />
        </button>
      </div>
      {menu && (
        <div className="qmenu" role="menu" aria-label={t('更多命令')} ref={menuRef} style={{ left: Math.max(0, Math.min((moreBtn.current?.offsetLeft ?? 0) - 6, (row.current?.clientWidth ?? 0) - 220)) }}>
          {folded.map((q, i) => (
            <Fragment key={q.text}>
              {/* 自己的命令和自带的之间一道横线（和那一排里的竖线一个意思） */}
              {q.own && i > 0 && !folded[i - 1]!.own && <div className="sep" />}
              <button role="menuitem" className={q.own ? 'own' : ''} title={q.tip} aria-disabled={q.disabled || undefined} onClick={() => (setMenu(false), q.disabled || q.go())}>
                {glyph(q)}
                <span className="truncate">{q.text}</span>
              </button>
            </Fragment>
          ))}
          {props.onAll && (
            <>
              <div className="sep" />
              <button role="menuitem" onClick={() => (setMenu(false), props.onAll!())}>
                <Icon name="comment-discussion" size={14} className="qi" />
                <span className="truncate">{t('全部命令')}</span>
                <span className="k">/</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
