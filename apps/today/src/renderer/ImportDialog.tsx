/**
 * 「导入提醒事项」（规格 05-任务软件 7-import）：一次搬家。
 * 第一步选列表（镜像进去的那个不列，旁边写各有几条、几条已完成）和两个选项（带不带已完成的，默认不带；搬完删不删原条目，默认不删）；
 * 第二步先给你看每个列表写成哪一篇、头几行长什么样、要知道的（对不上的重复、到地点提醒、几个闹钟、子任务和图片标签带不过来）；
 * 收下：一次提交，提示条带撤销；选了「搬完删掉」的，提交成功后由 App 再问一次（DeleteAsk）才删。样子同设置弹窗（640 宽、一组一块）。
 */
import { useEffect, useState } from 'react'
import type { ImportPreview, RemList } from '../shared/api'
import { useData, useLang } from './store'
import { Ic, useT } from './ui'

const SHOW = 4

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (r: { undo: string; total: number; lists: number; rids: string[] }, del: boolean) => void }) {
  const t = useT()
  const lang = useLang()
  const { rem } = useData()
  const [lists, setLists] = useState<RemList[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [withDone, setWithDone] = useState(false)
  const [del, setDel] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const mirrorName = rem?.list?.title ?? (lang === 'zh' ? '画布今日' : 'Canvas Today')
  useEffect(() => {
    void window.ct.remLists().then((ls) => setLists(ls.filter((l) => !l.mirror)))
  }, [])
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const opts = () => ({ lists: (lists ?? []).filter((l) => sel.has(l.id)).map((l) => l.id), completed: withDone })
  const look = async () => {
    setBusy(true)
    setErr(null)
    try {
      setPreview(await window.ct.remPreview(opts()))
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }
  const go = async () => {
    setBusy(true)
    try {
      const r = await window.ct.remImport(opts())
      if (!r.ok) return setErr(t('impFailed', r.message))
      onImported(r, del)
    } finally {
      setBusy(false)
    }
  }
  const sw = (on: boolean, label: string, sub: string | null, f: () => void) => (
    <div className="srow">
      <div className="sl">
        {label}
        {sub && <span>{sub}</span>}
      </div>
      <button className={`sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={f} />
    </div>
  )
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="setw impw" role="dialog" aria-label={t('impTitle')} onKeyDown={(e) => e.key === 'Escape' && (preview ? setPreview(null) : onClose())}>
        <div className="sh">
          <b>{preview ? t('impPreviewTitle') : t('impTitle')}</b>
          <button className="ib" aria-label={t('close')} onClick={onClose} autoFocus>
            <Ic n="close" s={14} />
          </button>
        </div>
        {!preview ? (
          <>
            <p className="impsub">{t('impSub', mirrorName)}</p>
            <div className="sgroup">
              {lists === null ? (
                <div className="srow">
                  <div className="sl t3">…</div>
                </div>
              ) : lists.length === 0 ? (
                <div className="srow">
                  <div className="sl t3">{t('impNone')}</div>
                </div>
              ) : (
                lists.map((l) => (
                  <div className="srow implist" key={l.id}>
                    <button className="impcheck" role="checkbox" aria-checked={sel.has(l.id)} onClick={() => toggle(l.id)}>
                      <span className={`cb${sel.has(l.id) ? ' on' : ''}`}>{sel.has(l.id) && <Ic n="check" s={10} />}</span>
                      <i className="impdot" style={l.color ? { background: l.color } : undefined} />
                      <span className="impname">{l.title}</span>
                      <span className="impn">{t('impCount', l.open, l.done)}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="impnote">{t('impExcluded', mirrorName)}</div>
            <div className="sgroup">
              {sw(withDone, t('impWithDone'), null, () => setWithDone((v) => !v))}
              {sw(del, t('impDelete'), t('impDeleteSub'), () => setDel((v) => !v))}
            </div>
            {err && <div className="impnote uerr">{err}</div>}
            <div className="impfoot">
              <button className="btn" onClick={onClose}>
                {t('cancel')}
              </button>
              <button className="btn pri" disabled={!sel.size || busy} onClick={() => void look()}>
                {t('impPreview')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="impsub">{t('impSummary', preview.files.length, preview.total)}</p>
            {preview.files.map((f) => (
              <div className="impfile" key={f.list + f.path}>
                <div className="imph">
                  <Ic n="file" s={14} />
                  <span className="mono">{f.path}</span>
                  <span className="t3 sm">{`${f.isNew ? t('impNew') : t('impAppend')} · ${t('impFileCount', f.count)}`}</span>
                </div>
                <div className="md mono">{f.lines.slice(0, SHOW).join('\n')}</div>
                {f.lines.length > SHOW && <div className="impmore">{t('impMore', f.lines.length - SHOW)}</div>}
              </div>
            ))}
            <div className="sg">{t('impKnow')}</div>
            <ul className="impknow">
              {preview.recurNotes > 0 && <li>{t('impRecur', preview.recurNotes)}</li>}
              {preview.places > 0 && <li>{t('impPlace', preview.places)}</li>}
              {preview.multiAlarms > 0 && <li>{t('impAlarms', preview.multiAlarms)}</li>}
              {preview.skippedDone > 0 && <li>{t('impSkipDone', preview.skippedDone)}</li>}
              {preview.reminded > 0 && rem?.active && (
                <li>
                  {t('impMirror', preview.reminded, mirrorName)}
                  {!del && t('impTwice')}
                </li>
              )}
              <li>{t('impLost')}</li>
            </ul>
            {err && <div className="impnote uerr">{err}</div>}
            <div className="impfoot">
              <button className="btn" onClick={() => setPreview(null)}>
                {t('impBack')}
              </button>
              <button className="btn pri" disabled={!preview.total || busy} onClick={() => void go()}>
                {preview.total ? t('impGo', preview.total) : t('impNothing')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** 搬完删掉原条目之前再问一次（照画布笔记删笔记的确认框：440 宽、标题 15/600、说明 13 --t2、取消 + 主按钮） */
export function DeleteAsk({ n, onKeep, onDelete }: { n: number; onKeep: () => void; onDelete: () => void }) {
  const t = useT()
  return (
    <>
      <div className="scrim" onClick={onKeep} />
      <div className="askw" role="alertdialog" aria-label={t('delAsk', n)} onKeyDown={(e) => e.key === 'Escape' && onKeep()}>
        <b>{t('delAsk', n)}</b>
        <p>{t('delAskSub')}</p>
        <div className="impfoot">
          <button className="btn" onClick={onKeep} autoFocus>
            {t('delKeep')}
          </button>
          <button className="btn pri" onClick={onDelete}>
            <Ic n="trash" s={14} />
            {t('delGo', n)}
          </button>
        </div>
      </div>
    </>
  )
}
