/**
 * 设置的框架（画布笔记设置方向 A「分组侧栏」，task-f7rib；2026-11-22 抽出来给画布今日一起用，task-ykkoz）：
 * B 里是居中弹窗、A 里可以开成中间的一个标签；左边侧栏（「设置」、可选的搜索、分段的分页），右边一页：页头、按组一张细线表、
 * 一行左边名字和说明、右边 220 一列（下拉、分段 220 宽，开关、按钮贴右）。改了马上存，底下提示条一句说会怎样、带「撤回」（SaidContext）。
 * 每一行带 data-row，从别处跳过来（focus）时翻到它、闪 1.6 秒。样式在 settings.css（类名 set-*、sa-*、sw-toggle）。
 * 不碰各软件的翻译：给人看的字都从参数进来。
 */
import { createContext, Fragment, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Codicon } from './index'

/** 设置里改了一项之后，底下提示条说的话：已存 · 会怎样，带「撤回」；别的事（存好了、导入了）只说一句 */
export interface Said {
  /** 改了一项：hint 是这次改了会怎样，undo 撤回成原来的值 */
  saved(hint: string, undo?: () => void): void
  /** 只说一句（不带撤回） */
  say(text: string): void
}
export const SaidContext = createContext<Said>({ saved: () => undefined, say: () => undefined })
export const useSaid = () => useContext(SaidContext)

export interface SetPage {
  id: string
  name: string
  icon: ReactNode
  /** 名字后面的小东西（「新版本已下好」的小点） */
  after?: ReactNode
}
export interface SetSection {
  /** 段名；不给就不写段头 */
  name?: string
  pages: SetPage[]
}

export interface SettingsShellProps {
  /** 给人看的字：标题「设置」、侧栏的名字、× 的名字和悬停、「已存 · {hint}」、「撤回」 */
  text: { title: string; nav: string; close: string; closeTip: string; saved: (hint: string) => string; undo: string }
  sections: SetSection[]
  page: string
  onPage(id: string): void
  onClose(): void
  /** 开成中间的一个标签（画布笔记 A），不是弹窗 */
  asTab?: boolean
  /** 侧栏标题下面的东西（搜索框） */
  navTop?: ReactNode
  /** 给了就代替分页列表（搜索结果） */
  navBody?: ReactNode
  /** 要翻到、闪一下的那一行（data-row）；seq 变了就再闪一次 */
  focus?: { row: string; seq: number } | null
  /** 软件这会儿说的话：设置开着时（弹窗盖住了底栏）在设置底下的提示条里说 */
  appNotice?: string | null
  /** 右边这一页：页头（PageHead）和内容 */
  children: ReactNode
}

export function SettingsShell(props: SettingsShellProps) {
  const body = useRef<HTMLDivElement>(null)
  /** 底下的提示条：一句说这次改了会怎样，带「撤回」，4 秒后收起（鼠标停在上面不计时） */
  const [toast, setToast] = useState<{ text: string; ok: boolean; undo?: () => void; seq: number } | null>(null)
  const [toastHover, setToastHover] = useState(false)
  const savedText = props.text.saved
  const said = useMemo<Said>(
    () => ({
      saved: (hint, undo) => setToast({ text: savedText(hint), ok: true, undo, seq: Date.now() }),
      say: (text) => setToast({ text, ok: false, seq: Date.now() }),
    }),
    [savedText],
  )
  useEffect(() => {
    if (!toast || toastHover) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast, toastHover])
  useEffect(() => {
    if (props.appNotice) said.say(props.appNotice)
  }, [props.appNotice])

  useEffect(() => {
    if (props.asTab) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        props.onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose, props.asTab])

  // 换页：从顶上看起；带着要闪的那一行（搜索回车、从用的地方跳过来）时翻到那一行、--acc-soft 闪 1.6 秒，
  // 那一页的内容是读出来的就等它画出来。两件事在一处：先后各做会互相盖掉
  const flashedSeq = useRef(0)
  useEffect(() => {
    const f = props.focus
    const b = body.current
    if (!f || f.seq === flashedSeq.current) {
      if (b) b.scrollTop = 0
      return
    }
    flashedSeq.current = f.seq
    let tries = 0
    let off: ReturnType<typeof setTimeout> | undefined
    const find = () => {
      const row = body.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(f.row)}"]`)
      const bb = body.current
      if (!bb || !row) {
        if (tries++ < 40) off = setTimeout(find, 50)
        return
      }
      const top = row.getBoundingClientRect().top - bb.getBoundingClientRect().top + bb.scrollTop
      bb.scrollTop = Math.max(0, top - bb.clientHeight / 2 + row.offsetHeight / 2)
      row.classList.remove('sa-flash')
      void row.offsetWidth
      row.classList.add('sa-flash')
      off = setTimeout(() => row.classList.remove('sa-flash'), 1600)
    }
    find()
    return () => clearTimeout(off)
  }, [props.page, props.focus?.seq])

  const T = props.text
  return (
    <SaidContext.Provider value={said}>
      <div className={props.asTab ? 'pane setpane' : 'set-back'} onMouseDown={(e) => !props.asTab && e.target === e.currentTarget && props.onClose()}>
        <div className={'set' + (props.asTab ? ' set-tab' : '')} role={props.asTab ? 'region' : 'dialog'} aria-label={T.title}>
          <nav className="set-nav" aria-label={T.nav}>
            <h3>{T.title}</h3>
            {props.navTop}
            {props.navBody ?? (
              <div className="sa-navlist">
                {props.sections.map((sec, i) => (
                  <Fragment key={sec.name ?? i}>
                    {sec.name && <div className="sa-sec">{sec.name}</div>}
                    {sec.pages.map((p) => (
                      <button key={p.id} className={'si' + (props.page === p.id ? ' on' : '')} aria-current={props.page === p.id ? 'page' : undefined} onClick={() => props.onPage(p.id)}>
                        {p.icon}
                        {p.name}
                        {p.after}
                      </button>
                    ))}
                  </Fragment>
                ))}
              </div>
            )}
          </nav>
          {/* × 在滚动区外面：页面滚动、有没有滚动条它都不动 */}
          <button className="iconbtn set-x" hidden={props.asTab} aria-label={T.close} title={T.closeTip} onClick={props.onClose}>
            <Codicon name="close" size={16} />
          </button>
          <div className="set-body" ref={body}>
            {props.children}
          </div>
          <div className={'sa-toast' + (toast ? ' show' : '') + (toast?.undo ? ' with-act' : '')} role="status" data-testid="settings-toast" onMouseEnter={() => setToastHover(true)} onMouseLeave={() => setToastHover(false)}>
            {toast && (
              <>
                <Codicon name={toast.ok ? 'pass-filled' : 'info'} size={14} className={toast.ok ? 'ok' : undefined} />
                <span>{toast.text}</span>
                {toast.undo && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.undo!()
                      setToast(null)
                      setToastHover(false)
                    }}
                  >
                    {T.undo}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </SaidContext.Provider>
  )
}

/** 页头：图标、名字、一句这页管什么 */
export function PageHead({ icon, title, desc }: { icon: ReactNode; title: ReactNode; desc: ReactNode }) {
  return (
    <div className="sa-head" data-testid="settings-head">
      <span className="pi">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </div>
  )
}

/** 一组：组名 + 一张细线表 */
export function Group(props: { title: ReactNode; children: ReactNode; label?: string }) {
  return (
    <>
      <div className="sa-grph">{props.title}</div>
      <div className="sa-card" role="group" aria-label={props.label ?? (typeof props.title === 'string' ? props.title : undefined)}>
        {props.children}
      </div>
    </>
  )
}

/** 一行：左边名字和说明，右边 220 一列放控件。full：控件在说明下面整行宽；info：只有字；more：整行宽、跟在说明下面的一句 */
export function Row(props: { id: string; label: ReactNode; desc?: ReactNode; children?: ReactNode; full?: boolean; info?: boolean; dim?: boolean; more?: ReactNode }) {
  return (
    <div className={'sa-row' + (props.full ? ' full' : '') + (props.info ? ' info' : '') + (props.dim ? ' dim' : '')} data-row={props.id}>
      <div className="sa-txt">
        <div className="sa-lb">{props.label}</div>
        {props.desc ? <div className="sa-ds">{props.desc}</div> : null}
      </div>
      {!props.info && <div className="sa-cc">{props.children}</div>}
      {props.more && <div className="sa-more">{props.more}</div>}
    </div>
  )
}

/** 220 宽的下拉：选项是 [值, 写给人看的字, 停用] */
export function Sel<T extends string | number>(props: { label: string; value: T; options: readonly (readonly [T, string, boolean?])[]; onChange(v: T): void; disabled?: boolean }) {
  return (
    <select
      className="sa-sel"
      aria-label={props.label}
      value={String(props.value)}
      disabled={props.disabled}
      onChange={(e) => {
        const o = props.options.find(([v]) => String(v) === e.currentTarget.value)
        if (o) props.onChange(o[0])
      }}
    >
      {props.options.map(([v, text, off]) => (
        <option key={String(v)} value={String(v)} disabled={off}>
          {text}
        </option>
      ))}
    </select>
  )
}

/** 220 宽的分段（两三样里挑一样） */
export function Seg<T extends string>(props: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange(v: T): void }) {
  return (
    <div className="sa-seg" role="radiogroup" aria-label={props.label}>
      {props.options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={props.value === v} className={props.value === v ? 'on' : ''} onClick={() => props.value !== v && props.onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** 说明里的小链接（「排顺序 ›」「去Git和同步 ›」） */
export function Lnk(props: { children: ReactNode; onClick(): void; label?: string }) {
  return (
    <button type="button" className="sa-lnk" aria-label={props.label} onClick={props.onClick}>
      {props.children}
      <Codicon name="chevron-right" size={12} />
    </button>
  )
}

/** 方角开关（用户偏好：开关的轨道和滑块都是小圆角方形） */
export function Toggle(props: { on: boolean; label: string; onChange(v: boolean): void; disabled?: boolean }) {
  return <button className={'sw-toggle' + (props.on ? ' on' : '')} role="switch" aria-checked={props.on} aria-label={props.label} disabled={props.disabled} onClick={() => props.onChange(!props.on)} />
}
