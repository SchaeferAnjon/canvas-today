/**
 * 设置：外观（默认和画布笔记一样；不跟时自己选 A/B、主题、窗口背景）、语言、库、提醒事项、菜单栏、版本和更新。
 * 居中弹窗，样子照画布笔记设置的「一组一块、一行一项」。
 */
import { useEffect, useState } from 'react'
import { activeSkin, SKINS, skinOf } from '../../../notes/src/shared/appearance'
import type { RemList } from '../shared/api'
import { updateError, updateLine } from '../shared/update'
import { nowMs, reloadState, saveSettings, useData, useLang } from './store'
import { Ic, useT } from './ui'

/** 给人看的长路径：中间省略，头尾都留着 */
const middle = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.ceil(n / 2) - 1)}…${s.slice(s.length - Math.floor(n / 2))}`)

const SKIN_EN: Record<string, string> = { mint: 'Mint', sky: 'Sky', sakura: 'Sakura', lilac: 'Lilac', stone: 'Stone', pine: 'Pine', petrol: 'Deep lake', cocoa: 'Cocoa', ink: 'Ink', graphite: 'Graphite' }

const Sw = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => <button className={`sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick} />

export function SettingsDialog({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
  const t = useT()
  const { state, dark } = useData()
  const s = state!.settings
  const look = state!.look
  const own = s.appearance
  const lang = s.lang
  const seg = <T extends string>(v: T, opts: [T, string][], set: (v: T) => void, label: string) => (
    <span className="seg" role="radiogroup" aria-label={label}>
      {opts.map(([k, l]) => (
        <button key={k} className={v === k ? 'on' : ''} role="radio" aria-checked={v === k} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </span>
  )
  const active = skinOf(activeSkin({ ...look, homeStyle: 'a', homeWinBg: false, winBgFile: null }, dark))
  const skinName = lang === 'zh' ? active.name : (SKIN_EN[active.id] ?? active.name)
  const pickSkin = (id: string, tone: 'light' | 'dark') =>
    void saveSettings({ appearance: own.followSystem ? (tone === 'light' ? { ...own, day: id } : { ...own, night: id }) : { ...own, skin: id } })
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="setw" role="dialog" aria-label={t('settings')} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="sh">
          <b>{t('settings')}</b>
          <button className="ib" aria-label={t('close')} onClick={onClose} autoFocus>
            <Ic n="close" s={14} />
          </button>
        </div>
        <div className="sg">{t('sLook')}</div>
        <div className="sgroup">
          <div className="srow">
            <div className="sl">
              {t('sFollowNotes')}
              <span>{s.followNotes ? `${t('sFollowNotesSub')} · ${t('sNow', skinName, look.frame === 'a' ? t('frameA') : t('frameB'))}` : t('sFollowNotesSub')}</span>
            </div>
            <Sw on={s.followNotes} label={t('sFollowNotes')} onClick={() => void saveSettings({ followNotes: !s.followNotes })} />
          </div>
          {!s.followNotes && (
            <>
              <div className="srow">
                <div className="sl">{t('sFrame')}</div>
                {seg(own.frame, [['a', t('frameA')], ['b', t('frameB')]], (frame) => void saveSettings({ appearance: { ...own, frame } }), t('sFrame'))}
              </div>
              <div className="srow">
                <div className="sl">{t('sFollowSystem')}</div>
                <Sw on={own.followSystem} label={t('sFollowSystem')} onClick={() => void saveSettings({ appearance: { ...own, followSystem: !own.followSystem } })} />
              </div>
              <div className="srow">
                <div className="sl">{t('sWinBg')}</div>
                {seg(own.winBg === 'custom' ? 'aurora' : own.winBg, [['aurora', t('bgAurora')], ['cave', t('bgCave')], ['none', t('bgNone')]], (winBg) => void saveSettings({ appearance: { ...own, winBg } }), t('sWinBg'))}
              </div>
            </>
          )}
        </div>
        {!s.followNotes && <div className="sg">{t('sTheme')}</div>}
        {!s.followNotes && (
          <div className="skins" role="radiogroup" aria-label={t('sTheme')}>
            {SKINS.map((k) => {
              const on = own.followSystem ? (k.tone === 'light' ? own.day === k.id : own.night === k.id) : own.skin === k.id
              return (
                <button key={k.id} className={on ? 'on' : ''} role="radio" aria-checked={on} onClick={() => pickSkin(k.id, k.tone)}>
                  <i data-skin={k.id} />
                  <span>{lang === 'zh' ? k.name : SKIN_EN[k.id]}</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="sg">{t('sLang')}</div>
        <div className="sgroup">
          <div className="srow">
            <div className="sl">{t('sLang')}</div>
            {seg(lang, [['zh', '简体中文'], ['en', 'English']], (l) => void saveSettings({ lang: l }), t('sLang'))}
          </div>
        </div>
        <div className="sg">{t('sVault')}</div>
        <div className="sgroup">
          <div className="srow">
            <div className="sl">
              {state!.vault?.name}
              <span className="mono" title={state!.vault?.path}>
                {middle(state!.vault?.path ?? '', 56)}
              </span>
              <span>{t('sVaultSub')}</span>
            </div>
            <button className="btn sm" onClick={() => void window.ct.chooseVault().then(() => reloadState())}>
              {t('sVaultChange')}
            </button>
          </div>
        </div>
        <div className="sg">{t('sRem')}</div>
        <RemSection onImport={onImport} />
        <div className="sg">{t('sTray')}</div>
        <div className="sgroup">
          <div className="srow">
            <div className="sl">{t('sTrayRow')}</div>
            <Sw on={s.tray} label={t('sTrayRow')} onClick={() => void saveSettings({ tray: !s.tray })} />
          </div>
        </div>
        <div className="sg">{t('sAbout')}</div>
        <div className="sgroup">
          <UpdateRow />
        </div>
      </div>
    </>
  )
}

/**
 * 提醒事项（task-b9y8i）：第一行是镜像开关和现在的样子（没连：「连接提醒事项」；没授权：说清楚、能打开系统设置；没开 iCloud：怎么打开、再试一次；
 * 连着：iCloud「画布今日」里几条、断开），连着时再有「放进哪个列表」「导入提醒事项」两行。动作照「版本和更新」那一行写成说明后面的链接
 */
function RemSection({ onImport }: { onImport: () => void }) {
  const t = useT()
  const lang = useLang()
  const { rem: r } = useData()
  const [lists, setLists] = useState<RemList[]>([])
  const [busy, setBusy] = useState(false)
  const ok = !!r && r.connected && r.auth === 'full'
  useEffect(() => {
    if (ok && r!.icloud) void window.ct.remLists().then(setLists)
  }, [ok, r?.icloud, r?.list?.id])
  if (!r) return null
  const listName = r.list?.title ?? (lang === 'zh' ? '画布今日' : 'Canvas Today')
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await f()
    } finally {
      setBusy(false)
    }
  }
  const link = (label: string, f: () => void) => (
    <>
      {' · '}
      <button className="link" onClick={f}>
        {label}
      </button>
    </>
  )
  const connectBtn = (label: string) => (
    <button className="btn sm" disabled={busy || r.asking} onClick={() => void run(() => window.ct.remConnect())}>
      {label}
    </button>
  )
  let sub: React.ReactNode
  let right: React.ReactNode = null
  if (!r.available) sub = t('remUnavailable')
  else if (r.asking) {
    sub = t('remAsking')
    right = connectBtn(t('remConnect'))
  } else if (r.auth === 'denied' || r.auth === 'restricted') {
    sub = (
      <>
        {t('remDeniedSub')}
        {link(t('remOpenPrivacy'), () => void window.ct.remOpenPrivacy())}
      </>
    )
    right = connectBtn(t('remConnect'))
  } else if (!r.connected) {
    sub = t('remOffSub', listName)
    right = connectBtn(t('remConnect'))
  } else if (r.icloud === false) {
    sub = (
      <>
        {t('remNoICloudSub')}
        {link(t('remHow'), () => void window.ct.remOpenICloud())}
      </>
    )
    right = connectBtn(t('remRetry'))
  } else {
    sub = (
      <>
        {!r.mirror ? t('remPausedSub') : r.error ? t('remErrorSub', r.error) : t('remOnSub', listName, r.mirrored)}
        {link(t('remDisconnect'), () => void run(() => window.ct.remDisconnect()))}
      </>
    )
    right = <Sw on={r.mirror} label={t('remRow')} onClick={() => !busy && void run(() => window.ct.remSetMirror(!r.mirror))} />
  }
  // 放进哪个列表：iCloud 里能写的列表；我们的「画布今日」还没建时也列出来（选了才建）
  const own = lang === 'zh' ? '画布今日' : 'Canvas Today'
  const choices = lists.filter((l) => l.icloud && l.writable).map((l) => l.title)
  if (!choices.includes(listName)) choices.unshift(listName)
  const fresh = !choices.includes(own)
  return (
    <div className="sgroup">
      <div className="srow" data-row="rem">
        <div className="sl">
          {t('remRow')}
          <span className={r.error && r.mirror && r.connected ? 'uerr' : undefined}>{sub}</span>
        </div>
        {right}
      </div>
      {ok && r.icloud && r.mirror && (
        <div className="srow" data-row="remList">
          <div className="sl">{t('remListRow')}</div>
          <select className="sel" aria-label={t('remListRow')} value={listName} disabled={busy} onChange={(e) => void run(() => window.ct.remSetList(e.target.value))}>
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {fresh && <option value={own}>{t('remListNew', own)}</option>}
          </select>
        </div>
      )}
      {ok && (
        <div className="srow" data-row="remImport">
          <div className="sl">
            {t('remImportRow')}
            <span>{t('remImportSub')}</span>
          </div>
          <button className="btn sm" onClick={onImport}>
            {t('remImportBtn')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 版本和更新：一行。左边「自动检查更新」，下面一行是版本、检查更新的状态和能点的那一步（现在查一次 / 再查一次 / 重启更新、看看改了什么），右边是开关。
 * 设置弹窗在 1420 × 800 的窗口里不用滚（e2e/t7），所以不另加一行。
 */
function UpdateRow() {
  const t = useT()
  const lang = useLang()
  const { state, update: st } = useData()
  const [checking, setChecking] = useState(false)
  const s = state!.settings
  const err = st?.phase === 'error' ? updateError(st.error, st.version, lang) : null
  const check = async () => {
    setChecking(true)
    try {
      await window.ct.checkUpdate()
    } finally {
      setChecking(false)
    }
  }
  const act = (label: string, run: () => void) => (
    <>
      {' · '}
      <button className="link" onClick={run}>
        {label}
      </button>
    </>
  )
  const canCheck = !checking && (st?.phase === 'idle' || st?.phase === 'latest' || st?.phase === 'error')
  return (
    <div className="srow" data-row="update">
      <div className="sl">
        {t('uAuto')}
        <span className={err && !err.soft ? 'uerr' : undefined} data-testid="update-line">
          {t('sVersion', state!.version)}
          {st && ` · ${updateLine(st, s.autoUpdate, lang, nowMs())}`}
          {canCheck && act(err ? t('uRetry') : t('uCheckNow'), () => void check())}
          {st?.phase === 'ready' && act(t('uInstall'), () => void window.ct.installUpdate())}
          {st?.phase === 'ready' && act(t('uWhatsNew'), () => void window.ct.openRelease())}
        </span>
        {st?.phase === 'downloading' && (
          <i className="ubar" aria-hidden>
            <i style={{ width: `${st.percent}%` }} />
          </i>
        )}
      </div>
      <Sw on={s.autoUpdate} label={t('uAuto')} onClick={() => void saveSettings({ autoUpdate: !s.autoUpdate })} />
    </div>
  )
}
