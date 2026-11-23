/**
 * 全局快速加一条的小框（任何软件里按 ⌥⇧T 弹出来，main/quick.ts）：照方案页原型 A1、A3（设计稿目录 canvas-notes-visual/45-画布今日特色/proto-a.html）。
 * 上面打一句话，下面一行实时写认出来的（和主窗口快速加一条同一个 QuickChips），再下面是写进哪一篇（#清单 对上的，⌘↵ 换一篇）；
 * ↵ 加上、⇧↵ 加上并在画布今日里打开、esc 关掉；中文输入法选字时的回车不算。贴进几行就是几条，各认各的、各进各的笔记。
 * 本地认不出、看着又有时间词的问一次 AI（和主窗口一样的 useWhenInput；只用它问 AI 那一半，选择器在这个小框里不开）。
 */
import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import './today.css'
import './quick.css'
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useWhenInput } from '@cn/calendar'
import { parseQuick } from '@cn/tasks'
import type { QuickKeyState } from '../shared/api'
import { INBOX_NOTE } from '../shared/brand'
import { destRing, notesFor, pathFolder, pathTitle, quickLines } from '../shared/quick'
import { boot, nowLocal, useData, useLang, useToday } from './store'
import { Ic, useT } from './ui'
import { QuickChips } from './views'

function QuickPanel() {
  const { snap, state, ai } = useData()
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const [v, setV] = useState('')
  const [pick, setPick] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [key, setKey] = useState<QuickKeyState | null>(null)
  const busy = useRef(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const lines = quickLines(v)
  const multi = lines.length > 1
  // 只用来问 AI（本地认不出时）；@ 和 ⌥⌘T 的选择器在小框里不开（弹层会被小窗口裁掉）
  const when = useWhenInput(multi ? '' : v, setV, box as unknown as RefObject<HTMLInputElement | null>, {
    lang,
    now: nowLocal,
    ask: (title, now) => window.ct.whenAi(title, now).catch(() => null),
    isPickKey: () => false,
    weekStart: 0,
  })
  const q = useMemo(() => {
    if (multi || !v.trim()) return null
    const p = parseQuick(v.trim(), nowLocal())
    return when.ai ? { ...p, title: when.ai.title, date: when.ai.date, time: when.ai.time, repeat: when.ai.repeat, remind: when.ai.date ? when.ai.remind : null } : p
  }, [v, multi, today, when.ai])
  const list = q?.list ?? null
  const ring = useMemo(() => destRing(snap.notes, list), [snap.notes, list])
  const dest = ring[pick % ring.length]!
  /** 写进收件箱时（#清单 没对上、自己换进了收件箱）#那几个字留在标题里：认出来那一行照写进去的样子写，不当清单小块 */
  const shown = q && list && dest === INBOX_NOTE ? { ...q, title: `${q.title} #${list}`.trim(), list: null } : q

  useEffect(() => {
    void window.ct.quickState().then(setKey)
    const offs = [
      window.ct.onQuickState(setKey),
      window.ct.onQuickOpen((fresh) => {
        if (fresh) {
          setV('')
          setPick(0)
          setErr(null)
        }
        requestAnimationFrame(() => box.current?.focus())
      }),
    ]
    return () => offs.forEach((f) => f())
  }, [])
  // 输入框跟着字长高；整个小框量好多高，窗口跟着变
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [v])
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => void window.ct.fit(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state?.vault])

  if (!state) return null
  if (!state.vault)
    return (
      <div className="qp" ref={root} data-part="快速加一条小框">
        <div className="qnov">{t('qNoVault')}</div>
      </div>
    )

  const add = async (open: boolean) => {
    if (busy.current || !lines.length) return
    busy.current = true
    setErr(null)
    const items = multi ? lines.map((text) => ({ text, dest: null, when: null })) : [{ text: v.trim(), dest, when: when.ai }]
    try {
      const r = await window.ct.quickAdd(items, open)
      if (r.ok) {
        setV('')
        setPick(0)
      } else setErr(r.message)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      busy.current = false
    }
  }

  const hit = list ? notesFor(snap.notes, list).some((n) => n.path === dest) : false
  const why = pick % ring.length !== 0 ? t('qWhyPicked') : list ? (hit ? t('qWhyList', list) : t('qWhyNoMatch', list)) : t('qWhyInbox')
  const keyName = key?.registered ? key.key : null

  return (
    <div className="qp" ref={root} data-part="快速加一条小框">
      <div className="qin">
        <Ic n="add" s={18} />
        <textarea
          ref={box}
          rows={1}
          value={v}
          placeholder={t('qPh')}
          aria-label={t('qAria')}
          spellCheck={false}
          autoFocus
          onChange={(e) => {
            setV(e.target.value)
            setPick(0)
            setErr(null)
          }}
          onKeyDown={(e) => {
            // 中文输入法选字时的回车、esc 交给输入法
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Escape') {
              e.preventDefault()
              void window.ct.quickClose()
              return
            }
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (e.metaKey || e.ctrlKey) {
              if (!multi) setPick((p) => p + 1)
              return
            }
            void add(e.shiftKey)
          }}
        />
      </div>
      {multi ? (
        <div className="qmulti" data-part="一次几条">
          {lines.map((l, i) => {
            const p = parseQuick(l, nowLocal())
            const d = destRing(snap.notes, p.list)[0]!
            return (
              <div className="qr" key={i}>
                <span className="qt">{p.title || l}</span>
                <span className="chips">
                  <QuickChipsShort q={p} today={today} />
                  <span className="chip g">
                    <Ic n="file" s={12} />
                    {pathTitle(d)}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="chips qgot" id="qgot">
          {shown ? <QuickChips q={shown} today={today} ai={when.ai ? (ai?.engine ?? null) : undefined} /> : <span>{t('qHint')}</span>}
        </div>
      )}
      <div className="qdest" data-part="写进哪一篇">
        <Ic n={dest === INBOX_NOTE && !multi ? 'inbox' : 'file'} s={14} />
        {multi ? (
          <>
            <span>{t('qWriteTo')}</span>
            <b>{t('qMultiN', new Set(lines.map((l) => destRing(snap.notes, parseQuick(l, nowLocal()).list)[0])).size)}</b>
            <span className="t3">{t('qMultiWhere')}</span>
          </>
        ) : (
          <>
            <span>{t('qWriteTo')}</span>
            <b>{`《${pathTitle(dest)}》`}</b>
            {pathFolder(dest) && <span className="t3">{pathFolder(dest)}</span>}
            <span className="t3 qwhy">{why}</span>
            {ring.length > 1 && (
              <button className="btn sm qswap" onClick={() => setPick((p) => p + 1)}>
                {t('qSwap')}
                <kbd className="kbd">⌘↵</kbd>
              </button>
            )}
          </>
        )}
      </div>
      {err && (
        <div className="qerr" role="alert">
          <Ic n="warning" s={14} />
          {err}
        </div>
      )}
      <div className="qfoot">
        <span>
          <kbd className="kbd">↵</kbd>
          {multi ? t('qAddN', lines.length) : t('qAdd')}
        </span>
        <span>
          <kbd className="kbd">⇧↵</kbd>
          {t('qAddOpen')}
        </span>
        <span>
          <kbd className="kbd">esc</kbd>
          {t('qClose')}
        </span>
        <span className="sp" />
        {keyName && <span>{t('qAnywhere', keyName)}</span>}
      </div>
    </div>
  )
}

/** 一次几条时每行后面的小块：只写日子钟点、提醒、重复、优先级（#清单 换成后面写进哪篇） */
function QuickChipsShort({ q, today }: { q: ReturnType<typeof parseQuick>; today: string }) {
  return <QuickChips q={{ ...q, list: null }} today={today} bare />
}

void boot().then(() => createRoot(document.getElementById('root')!).render(<QuickPanel />))
