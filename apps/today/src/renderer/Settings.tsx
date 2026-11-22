/**
 * 设置（2026-11-22 用户：「这里的设置你也改的和canvas note一样的结构. 可以把框架的代码直接拿来用吧我觉得.」）：
 * 用画布笔记设置的框架 @cn/design/settings（居中弹窗，左边分页，右边一页一个头、按组一张细线表、一行左边名字和说明右边 220 一列，
 * 改了马上存、底下提示条一句说会怎样、带「撤回」），只放画布今日自己的设置：
 * 一般（语言、菜单栏、版本和更新）、外观（和画布笔记一样；不跟时界面风格、跟着系统换浅深、窗口背景、主题）、日历和提醒事项、库。
 */
import { Codicon, type CodiconName } from '@cn/design'
import { Group, PageHead, Row, Seg, Sel, SettingsShell, Toggle, useSaid } from '@cn/design/settings'
import '@cn/design/settings.css'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { activeSkin, SKINS, skinOf } from '../../../notes/src/shared/appearance'
import type { RemList } from '../shared/api'
import type { TodaySettings } from '../shared/settings'
import { updateError, updateLine } from '../shared/update'
import { nowMs, reloadState, saveSettings, useData, useLang } from './store'
import { useT } from './ui'

export type SettingsPage = 'general' | 'look' | 'calrem' | 'vault'

const SKIN_EN: Record<string, string> = { mint: 'Mint', sky: 'Sky', sakura: 'Sakura', lilac: 'Lilac', stone: 'Stone', pine: 'Pine', petrol: 'Deep lake', cocoa: 'Cocoa', ink: 'Ink', graphite: 'Graphite' }

const PAGES: { id: SettingsPage; icon: CodiconName; name: 'sGeneral' | 'sLook' | 'sCalRem' | 'sVault'; desc: 'sGeneralDesc' | 'sLookDesc' | 'sCalRemDesc' | 'sVaultDesc' }[] = [
  { id: 'general', icon: 'settings-gear', name: 'sGeneral', desc: 'sGeneralDesc' },
  { id: 'look', icon: 'symbol-color', name: 'sLook', desc: 'sLookDesc' },
  { id: 'calrem', icon: 'calendar', name: 'sCalRem', desc: 'sCalRemDesc' },
  { id: 'vault', icon: 'library', name: 'sVault', desc: 'sVaultDesc' },
]

export function SettingsDialog({ page: first = 'general', onClose, onImport }: { page?: SettingsPage; onClose: () => void; onImport: () => void }) {
  const t = useT()
  const [page, setPage] = useState<SettingsPage>(first)
  const cur = PAGES.find((p) => p.id === page)!
  const text = useMemo(() => ({ title: t('settings'), nav: t('sNav'), close: t('sCloseSet'), closeTip: t('sCloseTip'), saved: (hint: string) => t('sSaved', hint), undo: t('sUndo') }), [t])
  const sections = [{ pages: PAGES.map((p) => ({ id: p.id, name: t(p.name), icon: <Codicon name={p.icon} /> })) }]
  return (
    <SettingsShell text={text} sections={sections} page={page} onPage={(id) => setPage(id as SettingsPage)} onClose={onClose}>
      <PageHead icon={<Codicon name={cur.icon} size={18} />} title={t(cur.name)} desc={t(cur.desc)} />
      {page === 'general' && <GeneralPage />}
      {page === 'look' && <LookPage />}
      {page === 'calrem' && <CalRemPage onImport={onImport} />}
      {page === 'vault' && <VaultPage />}
    </SettingsShell>
  )
}

/** 改一项：马上存，底下提示条说一句会怎样，带「撤回」（存回原来的） */
function useChange() {
  const said = useSaid()
  return (patch: Partial<TodaySettings>, back: Partial<TodaySettings>, hint: string) => {
    void saveSettings(patch)
    said.saved(hint, () => void saveSettings(back))
  }
}

function GeneralPage() {
  const t = useT()
  const change = useChange()
  const s = useData().state!.settings
  const flip = (key: 'tray' | 'autoUpdate', label: string) => change({ [key]: !s[key] }, { [key]: s[key] }, !s[key] ? t('sTurnedOn', label) : t('sTurnedOff', label))
  return (
    <>
      <Group title={t('sLang')}>
        {/* 换了语言整个界面马上换，提示条不说（说的话还是换之前那种语言） */}
        <Row id="lang" label={t('sLangRow')}>
          <Seg
            label={t('sLang')}
            value={s.lang}
            options={[
              ['zh', '简体中文'],
              ['en', 'English'],
            ]}
            onChange={(lang) => void saveSettings({ lang })}
          />
        </Row>
      </Group>
      <Group title={t('sTray')}>
        <Row id="tray" label={t('sTrayRow')} desc={t('sTrayDesc')}>
          <Toggle on={s.tray} label={t('sTrayRow')} onChange={() => flip('tray', t('sTrayRow'))} />
        </Row>
      </Group>
      <Group title={t('sAbout')}>
        <UpdateRow onFlip={() => flip('autoUpdate', t('uAuto'))} />
      </Group>
    </>
  )
}

function LookPage() {
  const t = useT()
  const change = useChange()
  const { state, dark } = useData()
  const s = state!.settings
  const look = state!.look
  const own = s.appearance
  const lang = s.lang
  const active = skinOf(activeSkin({ ...look, homeStyle: 'a', homeWinBg: false, winBgFile: null }, dark))
  const skinName = (id: string) => (lang === 'zh' ? (SKINS.find((k) => k.id === id)?.name ?? id) : (SKIN_EN[id] ?? id))
  const frameName = (f: 'a' | 'b') => (f === 'a' ? t('frameA') : t('frameB'))
  const bgName = (b: string) => (b === 'cave' ? t('bgCave') : b === 'none' ? t('bgNone') : t('bgAurora'))
  const pickSkin = (id: string, tone: 'light' | 'dark') => {
    const next = own.followSystem ? (tone === 'light' ? { ...own, day: id } : { ...own, night: id }) : { ...own, skin: id }
    change({ appearance: next }, { appearance: own }, t('sSetTo', t('sTheme'), skinName(id)))
  }
  return (
    <>
      <Group title={t('sLook')}>
        <Row id="followNotes" label={t('sFollowNotes')} desc={s.followNotes ? `${t('sFollowNotesSub')} · ${t('sNow', skinName(active.id), frameName(look.frame))}` : t('sFollowNotesSub')}>
          <Toggle on={s.followNotes} label={t('sFollowNotes')} onChange={(v) => change({ followNotes: v }, { followNotes: !v }, v ? t('sTurnedOn', t('sFollowNotes')) : t('sTurnedOff', t('sFollowNotes')))} />
        </Row>
        {!s.followNotes && (
          <>
            <Row id="frame" label={t('sFrame')}>
              <Seg
                label={t('sFrame')}
                value={own.frame}
                options={[
                  ['a', t('frameA')],
                  ['b', t('frameB')],
                ]}
                onChange={(frame) => change({ appearance: { ...own, frame } }, { appearance: own }, t('sSetTo', t('sFrame'), frameName(frame)))}
              />
            </Row>
            <Row id="followSystem" label={t('sFollowSystem')}>
              <Toggle on={own.followSystem} label={t('sFollowSystem')} onChange={(v) => change({ appearance: { ...own, followSystem: v } }, { appearance: own }, v ? t('sTurnedOn', t('sFollowSystem')) : t('sTurnedOff', t('sFollowSystem')))} />
            </Row>
            <Row id="winBg" label={t('sWinBg')}>
              <Sel
                label={t('sWinBg')}
                value={own.winBg === 'custom' ? 'aurora' : own.winBg}
                options={[
                  ['aurora', t('bgAurora')],
                  ['cave', t('bgCave')],
                  ['none', t('bgNone')],
                ]}
                onChange={(winBg) => change({ appearance: { ...own, winBg } }, { appearance: own }, t('sSetTo', t('sWinBg'), bgName(winBg)))}
              />
            </Row>
          </>
        )}
      </Group>
      {!s.followNotes && (
        <>
          <div className="sa-grph">{t('sTheme')}</div>
          <div className="skins" role="radiogroup" aria-label={t('sTheme')}>
            {SKINS.map((k) => {
              const on = own.followSystem ? (k.tone === 'light' ? own.day === k.id : own.night === k.id) : own.skin === k.id
              return (
                <button key={k.id} className={on ? 'on' : ''} role="radio" aria-checked={on} onClick={() => !on && pickSkin(k.id, k.tone)}>
                  <i data-skin={k.id} />
                  <span>{skinName(k.id)}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function CalRemPage({ onImport }: { onImport: () => void }) {
  const t = useT()
  return (
    <>
      <Group title={t('sCalGroup')}>
        <CalRow />
      </Group>
      <Group title={t('sRemGroup')}>
        <RemRows onImport={onImport} />
      </Group>
    </>
  )
}

function VaultPage() {
  const t = useT()
  const v = useData().state!.vault
  return (
    <Group title={t('sVaultNow')}>
      <Row
        id="vault"
        label={v?.name}
        desc={
          <>
            <span className="sa-path mono" title={v?.path}>
              {v?.path}
            </span>
            <span className="sa-line">{t('sVaultSub')}</span>
          </>
        }
      >
        <button className="sa-btn" onClick={() => void window.ct.chooseVault().then(() => reloadState())}>
          {t('sVaultChange')}
        </button>
      </Row>
    </Group>
  )
}

/** 说明后面的一步（「断开」「打开系统设置」「现在查一次」）：前面一个 · */
const step = (label: string, run: () => void) => (
  <>
    {' · '}
    <button className="sa-lnk" onClick={run}>
      {label}
    </button>
  </>
)

/**
 * 提醒事项（task-b9y8i）：第一行是镜像开关和现在的样子（没连：「连接提醒事项」；没授权：说清楚、能打开系统设置；没开 iCloud：怎么打开、再试一次；
 * 连着：iCloud「画布今日」里几条、断开），连着时再有「放进哪个列表」「导入提醒事项」两行。动作照「版本和更新」那一行写成说明后面的链接
 */
function RemRows({ onImport }: { onImport: () => void }) {
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
  const connectBtn = (label: string) => (
    <button className="sa-btn" disabled={busy || r.asking} onClick={() => void run(() => window.ct.remConnect())}>
      {label}
    </button>
  )
  let sub: ReactNode
  let right: ReactNode = null
  if (!r.available) sub = t('remUnavailable')
  else if (r.asking) {
    sub = t('remAsking')
    right = connectBtn(t('remConnect'))
  } else if (r.auth === 'denied' || r.auth === 'restricted') {
    sub = (
      <>
        {t('remDeniedSub')}
        {step(t('remOpenPrivacy'), () => void window.ct.remOpenPrivacy())}
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
        {step(t('remHow'), () => void window.ct.remOpenICloud())}
      </>
    )
    right = connectBtn(t('remRetry'))
  } else {
    sub = (
      <>
        {!r.mirror ? t('remPausedSub') : r.error ? t('remErrorSub', r.error) : t('remOnSub', listName, r.mirrored)}
        {step(t('remDisconnect'), () => void run(() => window.ct.remDisconnect()))}
      </>
    )
    right = <Toggle on={r.mirror} label={t('remRow')} onChange={() => !busy && void run(() => window.ct.remSetMirror(!r.mirror))} />
  }
  // 放进哪个列表：iCloud 里能写的列表；我们的「画布今日」还没建时也列出来（选了才建）
  const own = lang === 'zh' ? '画布今日' : 'Canvas Today'
  const choices = lists.filter((l) => l.icloud && l.writable).map((l) => l.title)
  if (!choices.includes(listName)) choices.unshift(listName)
  const fresh = !choices.includes(own)
  return (
    <>
      <Row id="rem" label={t('remRow')} desc={<span className={r.error && r.mirror && r.connected ? 'uerr' : undefined}>{sub}</span>}>
        {right}
      </Row>
      {ok && r.icloud && r.mirror && (
        <Row id="remList" label={t('remListRow')}>
          <Sel
            label={t('remListRow')}
            value={listName}
            disabled={busy}
            options={[...choices.map((c) => [c, c] as const), ...(fresh ? [[own, t('remListNew', own)] as const] : [])]}
            onChange={(v) => void run(() => window.ct.remSetList(v))}
          />
        </Row>
      )}
      {ok && (
        <Row id="remImport" label={t('remImportRow')} desc={t('remImportSub')}>
          <button className="sa-btn" onClick={onImport}>
            {t('remImportBtn')}
          </button>
        </Row>
      )}
    </>
  )
}

/** 版本和更新：一行。左边「自动检查更新」，说明是版本、检查更新的状态和能点的那一步（现在查一次 / 再查一次 / 重启更新、看看改了什么），右边是开关 */
function UpdateRow({ onFlip }: { onFlip: () => void }) {
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
  const canCheck = !checking && (st?.phase === 'idle' || st?.phase === 'latest' || st?.phase === 'error')
  return (
    <Row
      id="update"
      label={t('uAuto')}
      desc={
        <>
          <span className={err && !err.soft ? 'uerr' : undefined} data-testid="update-line">
            {t('sVersion', state!.version)}
            {st && ` · ${updateLine(st, s.autoUpdate, lang, nowMs())}`}
            {canCheck && step(err ? t('uRetry') : t('uCheckNow'), () => void check())}
            {st?.phase === 'ready' && step(t('uInstall'), () => void window.ct.installUpdate())}
            {st?.phase === 'ready' && step(t('uWhatsNew'), () => void window.ct.openRelease())}
          </span>
          {st?.phase === 'downloading' && (
            <i className="ubar" aria-hidden>
              <i style={{ width: `${st.percent}%` }} />
            </i>
          )}
        </>
      }
    >
      <Toggle on={s.autoUpdate} label={t('uAuto')} onChange={onFlip} />
    </Row>
  )
}

/** 日历（task-ykkoz）：「显示系统日历的日程」开关和现在的样子；第一次打开时系统问一次，没给就说清楚、能打开系统设置 */
function CalRow() {
  const t = useT()
  const { cal: c } = useData()
  const [busy, setBusy] = useState(false)
  if (!c) return null
  const flip = async () => {
    if (busy) return
    setBusy(true)
    try {
      await window.ct.calShow(!c.show || c.auth !== 'full')
    } finally {
      setBusy(false)
    }
  }
  let sub: ReactNode
  if (!c.available) sub = t('calUnavailable')
  else if (c.asking) sub = t('calAsking')
  else if (c.auth === 'denied' || c.auth === 'restricted')
    sub = (
      <>
        {t('calDeniedRowSub')}
        {step(t('remOpenPrivacy'), () => void window.ct.calOpenPrivacy())}
      </>
    )
  else sub = c.active ? t('calOnSub', c.calendars.length) : t('calOffSub')
  return (
    <Row id="cal" label={t('calRow')} desc={sub}>
      <Toggle on={c.active} label={t('calRow')} onChange={() => c.available && void flip()} />
    </Row>
  )
}
