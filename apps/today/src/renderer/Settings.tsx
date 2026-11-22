/**
 * 设置（第一批几项）：外观（默认和画布笔记一样；不跟时自己选 A/B、主题、窗口背景）、语言、库、菜单栏、版本和更新。
 * 居中弹窗，样子照画布笔记设置的「一组一块、一行一项」。
 */
import { useState } from 'react'
import { activeSkin, SKINS, skinOf } from '../../../notes/src/shared/appearance'
import { updateError, updateLine } from '../shared/update'
import { nowMs, reloadState, saveSettings, useData, useLang } from './store'
import { Ic, useT } from './ui'

/** 给人看的长路径：中间省略，头尾都留着 */
const middle = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.ceil(n / 2) - 1)}…${s.slice(s.length - Math.floor(n / 2))}`)

const SKIN_EN: Record<string, string> = { mint: 'Mint', sky: 'Sky', sakura: 'Sakura', lilac: 'Lilac', stone: 'Stone', pine: 'Pine', petrol: 'Deep lake', cocoa: 'Cocoa', ink: 'Ink', graphite: 'Graphite' }

const Sw = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => <button className={`sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick} />

export function SettingsDialog({ onClose }: { onClose: () => void }) {
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
