/**
 * 设置（2026-11-22 用户：「这里的设置你也改的和canvas note一样的结构. 可以把框架的代码直接拿来用吧我觉得.」）：
 * 用画布笔记设置的框架 @cn/design/settings（居中弹窗，左边分页，右边一页一个头、按组一张细线表、一行左边名字和说明右边 220 一列，
 * 改了马上存、底下提示条一句说会怎样、带「撤回」），只放画布今日自己的设置：
 * 一般（语言、菜单栏、版本和更新）、外观（和画布笔记一样；不跟时界面风格、跟着系统换浅深、窗口背景、主题）、日历和提醒事项、库，
 * 软件家族（task-59o3v，和画布笔记同一个 FamilyPage，family.tsx）。
 */
import { Codicon, type CodiconName } from '@cn/design'
import aurora from '@notes-assets/covers/aurora.jpg'
import cave from '@notes-assets/covers/ice-cave.jpg'
import { AppearancePage, Group, type LookSkin, PageHead, Row, Sel, SettingsShell, Toggle, useSaid } from '@cn/design/settings'
import { FamilySettings } from './family'
import '@cn/design/settings.css'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { activeSkin, allSkins, panelsGlass, SKINS, skinOf } from '../../../notes/src/shared/appearance'
import { themeInfo } from '../../../notes/src/shared/vscode-theme'
import type { JournalInfo, QuickKeyState, RemList } from '../shared/api'
import { comboOf, DEFAULT_QUICK_KEY, QUICK_KEY_SUGGEST, quickKeyOften, quickKeyProblem } from '../shared/quick'
import type { TodayAppearance, TodaySettings } from '../shared/settings'
import { updateError, updateLine } from '../shared/update'
import { nowMs, refreshAi, reloadState, saveSettings, setLook, useData, useLang } from './store'
import { type ApiId, SOURCE_LABEL } from '@cn/ai-engines/shared'
import { EngineLogo, useT } from './ui'

export type SettingsPage = 'general' | 'plan' | 'look' | 'calrem' | 'ai' | 'vault' | 'family'

const SKIN_EN: Record<string, string> = { mint: 'Mint', sky: 'Sky', sakura: 'Sakura', lilac: 'Lilac', stone: 'Stone', pine: 'Pine', petrol: 'Deep lake', cocoa: 'Cocoa', ink: 'Ink', graphite: 'Graphite' }
/** 主题卡悬停那句的英文（中文在 SKINS 里；和画布笔记的英文表一样） */
const SKIN_NOTE_EN: Record<string, string> = {
  mint: 'Pale green layers; a green line on top of the current tab',
  sky: 'Cyan status bar; cards are outlined only',
  sakura: 'Pale pink; current tab filled with color; soft card shadows',
  lilac: 'Pale purple with plum accents',
  stone: 'Dispatch white: no dividers, only shades of background',
  pine: 'Warm dark green with beige text, after Everforest',
  petrol: 'After Solarized; dark cyan status bar; cards outlined only',
  cocoa: 'Warm brown with coral accents, after Monokai Pro',
  ink: 'Near-black blue with orange accents, after Ayu Dark',
  graphite: 'Dispatch black: no dividers, white buttons on black',
}

const PAGES: { id: SettingsPage; icon: CodiconName; name: 'sGeneral' | 'sPlan' | 'sLook' | 'sCalRem' | 'sAi' | 'sVault' | 'sFamily'; desc: 'sGeneralDesc' | 'sPlanDesc' | 'sLookDesc' | 'sCalRemDesc' | 'sAiDesc' | 'sVaultDesc' | 'sFamilyDesc' }[] = [
  { id: 'general', icon: 'settings-gear', name: 'sGeneral', desc: 'sGeneralDesc' },
  { id: 'look', icon: 'symbol-color', name: 'sLook', desc: 'sLookDesc' },
  { id: 'calrem', icon: 'calendar', name: 'sCalRem', desc: 'sCalRemDesc' },
  { id: 'ai', icon: 'sparkle', name: 'sAi', desc: 'sAiDesc' },
  { id: 'vault', icon: 'library', name: 'sVault', desc: 'sVaultDesc' },
  { id: 'plan', icon: 'rocket', name: 'sPlan', desc: 'sPlanDesc' },
  { id: 'family', icon: 'multiple-windows', name: 'sFamily', desc: 'sFamilyDesc' },
]

/**
 * onPage：换了页告诉外面（A 里设置是中间一个标签，从弹窗换成标签、退到后面再点回来时开在同一页）；外面给的 page 变了（底栏「日历已连接」）就翻过去
 */
export function SettingsDialog({ page: first = 'general', onClose, onImport, appNotice, asTab, onPage }: { page?: SettingsPage; onClose: () => void; onImport: () => void; appNotice?: string | null; asTab?: boolean; onPage?: (p: SettingsPage) => void }) {
  const t = useT()
  const [page, setPageState] = useState<SettingsPage>(first)
  useEffect(() => setPageState(first), [first])
  const setPage = (p: SettingsPage) => {
    setPageState(p)
    onPage?.(p)
  }
  /** 从软件家族「去库 ›」「去外观 ›」跳过去：翻到那一行、闪一下 */
  const [focus, setFocus] = useState<{ row: string; seq: number } | null>(null)
  const goRow = (row: string) => {
    const to: SettingsPage = row === 'followNotes' ? 'look' : 'vault'
    setPage(to)
    setFocus({ row, seq: Date.now() })
  }
  const cur = PAGES.find((p) => p.id === page)!
  // AI 那一页的图标画正在用的那一家（偏好「AI 图标用引擎标志」，task-587os）
  const aiNow = useData().ai
  const iconOf = (p: (typeof PAGES)[number], s: number) => (p.id === 'ai' ? <EngineLogo id={aiNow?.engine} s={s} /> : <Codicon name={p.icon} size={s} />)
  const text = useMemo(() => ({ title: t('settings'), nav: t('sNav'), close: t('sCloseSet'), closeTip: t('sCloseTip'), saved: (hint: string) => t('sSaved', hint), undo: t('sUndo') }), [t])
  const sections = [{ pages: PAGES.map((p) => ({ id: p.id, name: t(p.name), icon: iconOf(p, 16) })) }]
  return (
    <SettingsShell asTab={asTab} text={text} sections={sections} page={page} onPage={(id) => setPage(id as SettingsPage)} onClose={onClose} appNotice={appNotice} focus={focus}>
      <PageHead icon={iconOf(cur, 18)} title={t(cur.name)} desc={t(cur.desc)} />
      {page === 'general' && <GeneralPage />}
      {page === 'plan' && <PlanPage />}
      {page === 'look' && <LookPage />}
      {page === 'calrem' && <CalRemPage onImport={onImport} />}
      {page === 'ai' && <AiPage />}
      {page === 'vault' && <VaultPage />}
      {page === 'family' && <FamilySettings onGoRow={goRow} />}
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
        {/* 换了语言整个界面马上换，提示条不说（说的话还是换之前那种语言）；下拉同画布笔记「界面语言」那一行 */}
        <Row id="lang" label={t('sLangRow')}>
          <Sel
            label={t('sLangRow')}
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
        <QuickKeyRow />
      </Group>
      <Group title={t('sAbout')}>
        <UpdateRow onFlip={() => flip('autoUpdate', t('uAuto'))} />
        {/* 软件家族的名单每天从总站看一次（画布笔记在「隐私和联网」里，画布今日没有那一页，放在这里） */}
        <Row id="familyFetch" label={t('sFamilyFetch')} desc={t('sFamilyFetchDesc')}>
          <Toggle
            on={s.familyFetch}
            label={t('sFamilyFetch')}
            onChange={(v) => change({ familyFetch: v }, { familyFetch: !v }, v ? t('sFamilyFetchOn') : t('sFamilyFetchOff'))}
          />
        </Row>
      </Group>
    </>
  )
}

/** 排一天：打开时先排一天、菜单栏写正在做的那一块、收工写进哪里的日记（库里认出来的几种、Obsidian 日记插件的、「周记」旁边） */
function PlanPage() {
  const t = useT()
  const change = useChange()
  const s = useData().state!.settings
  const p = s.plan
  const [j, setJ] = useState<JournalInfo | null>(null)
  useEffect(() => {
    void window.ct.journal().then(setJ)
  }, [p.journal])
  const flip = (key: 'onOpen' | 'tray', label: string) => change({ plan: { ...p, [key]: !p[key] } }, { plan: p }, !p[key] ? t('sTurnedOn', label) : t('sTurnedOff', label))
  const how = (x: { how: string; count: number }) => (x.how === 'obsidian' ? t('sPlanHowObsidian') : x.how === 'found' ? t('sPlanHowFound', x.count) : x.how === 'chosen' ? t('sPlanHowChosen') : t('sPlanHowDefault'))
  const show = (pattern: string) => pattern.replace('{date}', 'YYYY-MM-DD').replace(/\{YYYY\}/g, 'YYYY').replace(/\{MM\}/g, 'MM').replace(/\{DD\}/g, 'DD')
  return (
    <>
      <Group title={t('sPlan')}>
        <Row id="planOpen" label={t('sPlanOpen')} desc={t('sPlanOpenDesc')}>
          <Toggle on={p.onOpen} label={t('sPlanOpen')} onChange={() => flip('onOpen', t('sPlanOpen'))} />
        </Row>
        <Row id="planTray" label={t('sPlanTray')} desc={t('sPlanTrayDesc')}>
          <Toggle on={p.tray} label={t('sPlanTray')} onChange={() => flip('tray', t('sPlanTray'))} />
        </Row>
        {j && (
          <Row id="planJournal" label={t('sPlanJournal')} desc={t('sPlanJournalDesc', how(j))}>
            <Sel
              label={t('sPlanJournal')}
              value={p.journal ?? ''}
              options={[['', t('sPlanJournalAuto', show(j.auto.pattern))], ...j.options.filter((o) => o !== j.auto.pattern || p.journal === o).map((o) => [o, show(o)] as [string, string])]}
              onChange={(v) => change({ plan: { ...p, journal: v || null } }, { plan: p }, t('sSetTo', t('sPlanJournal'), v ? show(v) : t('sPlanJournalAuto', show(j.auto.pattern))))}
            />
          </Row>
        )}
      </Group>
    </>
  )
}

/**
 * 全局快速加一条的键（画布今日特色第一条线）：点了按一组新的（esc 取消）；系统和两个软件自己用着的不给，常被别的软件占着的先说一声；
 * 注册不上（被别的软件占了）时说出来，给几组没人用的点一下就换（照方案页原型 A5）
 */
function QuickKeyRow() {
  const t = useT()
  const lang = useLang()
  const change = useChange()
  const s = useData().state!.settings
  const [rec, setRec] = useState(false)
  const [warn, setWarn] = useState<string | null>(null)
  const [st, setSt] = useState<QuickKeyState | null>(null)
  useEffect(() => {
    void window.ct.quickState().then(setSt)
    return window.ct.onQuickState(setSt)
  }, [])
  const put = (combo: string) => {
    setRec(false)
    const bad = quickKeyProblem(combo, lang)
    if (bad) return setWarn(bad)
    const who = quickKeyOften(combo, lang)
    setWarn(who ? t('sQuickOften', combo, who) : null)
    if (combo !== s.quickKey) change({ quickKey: combo }, { quickKey: s.quickKey }, t('sQuickSet', combo))
  }
  useEffect(() => {
    if (!rec) return
    const onKey = (e: KeyboardEvent) => {
      // 录键时这个键不交给软件别处（⌘K 不开搜索、esc 不关设置）
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') return setRec(false)
      if (['Meta', 'Shift', 'Alt', 'Control', 'CapsLock'].includes(e.key)) return
      const combo = comboOf(e)
      if (combo) put(combo)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rec, s.quickKey, lang])
  const taken = !!st && !st.registered && st.key === s.quickKey
  const more = warn ? (
    <div className="sa-kwarn" role="alert">
      <Codicon name="warning" size={12} />
      <span>{warn}</span>
    </div>
  ) : taken ? (
    <div className="sa-kwarn" role="alert">
      <Codicon name="warning" size={12} />
      <span>{t('sQuickTaken', s.quickKey)}</span>
      <span className="sa-ksug">
        {QUICK_KEY_SUGGEST.filter((k) => k !== s.quickKey).map((k) => (
          <button key={k} type="button" className="btn sm" onClick={() => put(k)}>
            {k === DEFAULT_QUICK_KEY ? t('sQuickRec', k) : k}
          </button>
        ))}
      </span>
    </div>
  ) : undefined
  return (
    <Row id="quickKey" label={t('sQuickKey')} desc={t('sQuickKeyDesc')} more={more}>
      <button
        type="button"
        className={'sa-keyb' + (rec ? ' rec' : taken ? ' bad' : '')}
        aria-label={t('sQuickKeyAria')}
        onClick={() => {
          setWarn(null)
          setRec(!rec)
        }}
      >
        {rec ? t('sQuickPress') : s.quickKey}
      </button>
    </Row>
  )
}

function LookPage() {
  const t = useT()
  const change = useChange()
  const said = useSaid()
  const { state, dark } = useData()
  const s = state!.settings
  const look = state!.look
  const own = s.appearance
  const lang = s.lang
  const user = state!.themes
  const all = allSkins(user.map(themeInfo))
  const name = (id: string) => {
    const k = all.find((x) => x.id === id)
    return !k ? id : k.imported || lang === 'zh' ? k.name : (SKIN_EN[k.id] ?? k.name)
  }
  // 自带的十套照界面语言（名字、悬停那句）；导入的用它自己的名字，悬停说从哪个文件导入的
  const skins: LookSkin[] = [
    ...SKINS.map((k) => ({ id: k.id, tab: k.tab, tone: k.tone, name: name(k.id), note: lang === 'zh' ? k.note : SKIN_NOTE_EN[k.id] })),
    ...user.map((th) => ({ id: th.id, tab: th.tab, tone: th.tone, name: th.name, note: t('sImportedFrom', th.source), imported: true })),
  ]
  const active = skinOf(activeSkin({ ...look, homeStyle: 'a', homeWinBg: false, winBgFile: null }, dark), all)
  const frameName = (f: 'a' | 'b') => (f === 'a' ? t('frameA') : t('frameB'))
  const bgName = (b: string) => (b === 'cave' ? t('bgCave') : b === 'none' ? t('bgNone') : b === 'wall' ? t('bgWall') : t('bgAurora'))
  const now = own.followSystem ? (dark ? own.night : own.day) : own.skin
  const setLookTo = (next: TodayAppearance, hint: string) => change({ appearance: next }, { appearance: own }, hint)
  const flipFollow = (v: boolean) =>
    // 关掉「跟着系统」时留住现在看到的那套，界面不跳（同画布笔记 setFollowSystem）
    setLookTo(v ? { ...own, followSystem: true } : { ...own, followSystem: false, skin: now }, v ? t('sTurnedOn', t('sFollowSystem')) : t('sTurnedOff', t('sFollowSystem')))
  const errText = (e: unknown) => String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  return (
    <>
      <Group title="" label={t('sLookWho')}>
        <Row id="followNotes" label={t('sFollowNotes')} desc={s.followNotes ? `${t('sFollowNotesSub')} · ${t('sNow', name(active.id), frameName(look.frame))}` : t('sFollowNotesSub')}>
          <Toggle on={s.followNotes} label={t('sFollowNotes')} onChange={(v) => change({ followNotes: v }, { followNotes: !v }, v ? t('sTurnedOn', t('sFollowNotes')) : t('sTurnedOff', t('sFollowNotes')))} />
        </Row>
      </Group>
      {/* 不跟画布笔记时：外观整页和画布笔记是同一份（@cn/design/settings AppearancePage），画布今日没有首页、不能从电脑选窗口背景，这两样不出 */}
      {!s.followNotes && (
        <div className="sa-keep">
          <AppearancePage
            text={{
              theme: t('sTheme'),
              themeHint: t('sThemeHint'),
              themeHintSys: t('sThemeHintSys'),
              light: t('sLight'),
              dark: t('sDark'),
              imported: t('sImported'),
              day: t('sDay'),
              night: t('sNight'),
              follow: t('sFollowSystem'),
              dayUse: t('sDayUse'),
              nightUse: t('sNightUse'),
              frame: t('sFrame'),
              frameHint: t('sFrameHint'),
              winBg: t('sWinBg'),
              winBgHintA: t('sWinBgHintA'),
              winBgHintB: t('sWinBgHintB'),
            }}
            skins={skins}
            current={now}
            followSystem={own.followSystem}
            day={own.day}
            night={own.night}
            onPick={(k) => {
              if (now === k.id) return
              const next = own.followSystem ? (k.tone === 'light' ? { ...own, day: k.id } : { ...own, night: k.id }) : { ...own, skin: k.id }
              setLookTo(next, t('sSetTo', t('sTheme'), k.name))
            }}
            onFollow={flipFollow}
            onDay={(day) => setLookTo({ ...own, day }, t('sSetTo', t('sDayUse'), name(day)))}
            onNight={(night) => setLookTo({ ...own, night }, t('sSetTo', t('sNightUse'), name(night)))}
            frame={{
              value: own.frame,
              pv: `url("${aurora}")`,
              a: { name: t('frameAName'), note: t('frameANote') },
              b: { name: t('frameBName'), note: t('frameBNote') },
              onChange: (frame) => setLookTo({ ...own, frame }, t('sSetTo', t('sFrame'), frameName(frame))),
            }}
            winBg={{
              value: own.winBg === 'custom' ? 'aurora' : own.winBg,
              options: [
                { id: 'wall', name: t('bgWall'), bg: 'var(--wall-glow), var(--wall-base)' },
                { id: 'none', name: t('bgNone'), bg: 'var(--title)' },
                { id: 'aurora', name: t('bgAurora'), bg: `url("${aurora}") center/cover` },
                { id: 'cave', name: t('bgCave'), bg: `url("${cave}") center/cover` },
              ],
              onChange: (winBg) => setLookTo({ ...own, winBg }, t('sSetTo', t('sWinBg'), bgName(winBg))),
            }}
            wall={
              own.winBg === 'wall'
                ? {
                    mix: own.wallMix,
                    move: own.wallMove,
                    speed: own.wallSpeed,
                    onMix: (wallMix) => setLookTo({ ...own, wallMix }, t('sSetTo', t('wallMix'), t(wallMix === 'soft' ? 'wallSoft' : wallMix === 'rich' ? 'wallRich' : 'wallNormal'))),
                    onMove: (wallMove) => setLookTo({ ...own, wallMove }, wallMove ? t('sTurnedOn', t('wallMove')) : t('sTurnedOff', t('wallMove'))),
                    onSpeed: (wallSpeed) => setLookTo({ ...own, wallSpeed }, t('sSetTo', t('wallSpeed'), t(wallSpeed === 'slow' ? 'wallSlow' : wallSpeed === 'fast' ? 'wallFast' : 'wallMid'))),
                    text: {
                      move: t('wallMove'),
                      speed: t('wallSpeed'),
                      slow: t('wallSlow'),
                      mid: t('wallMid'),
                      fast: t('wallFast'),
                      mix: t('wallMix'),
                      soft: t('wallSoft'),
                      normal: t('wallNormal'),
                      rich: t('wallRich'),
                      reduced: t('wallReduced'),
                      still: t('wallStill'),
                    },
                  }
                : undefined
            }
            glass={{
              text: {
                label: t('sGlass'),
                solid: t('sGlassSolid'),
                clear: t('sGlassClear'),
                value: (n) => t('sGlassValue', n),
                def: t('sGlassDef'),
                reset: t('sGlassReset'),
                on: t('sGlassOn'),
                off: t('sGlassOff'),
              },
              value: own.glassLevel,
              enabled: panelsGlass(own),
              onChange: (glassLevel) => setLookTo({ ...own, glassLevel }, t('sSetTo', t('sGlass'), t('sGlassValue', glassLevel))),
            }}
            importTheme={{
              label: t('sImportTheme'),
              note: t('sImportThemeNote'),
              run: async () => {
                try {
                  const r = await window.ct.importTheme()
                  if (!r) return
                  setLook(r.state)
                  said.say(r.added.length > 1 ? t('sImportedMany', r.added.length, r.added.map((x) => x.name).join(lang === 'zh' ? '、' : ', ')) : t('sImportedOne', r.added[0]!.name))
                } catch (e) {
                  said.say(t('sImportFail', errText(e)))
                }
              },
              removeLabel: (n) => t('sRemoveTheme', n),
              removeTip: t('sRemoveThemeTip'),
              remove: async (k) => {
                setLook(await window.ct.removeTheme(k.id))
                said.say(t('sRemovedTheme', k.name))
              },
            }}
          />
        </div>
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

/**
 * 设置 › AI（task-587os，设计页第 4 节「画布今日 设置 › AI」，结构照画布笔记设置）：用哪家跟画布笔记「小活」那一行；
 * Key 借用：画布笔记有、画布今日还没有的那一家，按钮「用它」（同意后存一份到画布今日自己的钥匙串项）；已经存过写后 4 位
 */
function AiPage() {
  const t = useT()
  const said = useSaid()
  const ai = useData().ai
  const [keys, setKeys] = useState<{ id: ApiId; tail: string | null; notes: boolean }[] | null>(null)
  const load = () => void window.ct.aiKeys().then(setKeys)
  useEffect(load, [])
  const shown = (keys ?? []).filter((k) => k.notes || k.tail)
  return (
    <Group title={null}>
      <Row id="aiFollow" label={t('sAiFollow')} desc={ai ? t('sAiFollowDesc', ai.full) : t('sAiNoNotes')} />
      {shown.length === 0 && keys && <Row id="aiKey" label={t('sAiKey', 'API Key')} desc={t('sAiKeyNone')} />}
      {shown.map((k) => (
        <Row key={k.id} id={`aiKey-${k.id}`} label={t('sAiKey', SOURCE_LABEL[k.id])} desc={k.tail ? t('sAiKeyHave', k.tail) : t('sAiKeyDesc')}>
          {k.tail ? (
            <button
              className="sa-btn"
              data-testid={`ai-drop-${k.id}`}
              onClick={() =>
                void window.ct.aiKeyDrop(k.id).then(() => {
                  load()
                  said.say(t('sAiKeyDropped', SOURCE_LABEL[k.id]))
                })
              }
            >
              {t('sAiKeyDrop')}
            </button>
          ) : (
            <button
              className="sa-btn"
              data-testid={`ai-borrow-${k.id}`}
              onClick={() =>
                void window.ct.aiBorrow(k.id).then((r) => {
                  if (r.ok) {
                    load()
                    void refreshAi()
                  } else said.say(t('aiBorrowFail', r.message ?? ''))
                })
              }
            >
              {t('sAiKeyUse')}
            </button>
          )}
        </Row>
      ))}
    </Group>
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
  const dev = st?.phase === 'off'
  return (
    <Row
      id="update"
      dim={dev}
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
      <Toggle on={s.autoUpdate && !dev} label={t('uAuto')} disabled={dev} onChange={onFlip} />
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
  else sub = c.active ? t('calOnSub', c.calendars.filter((x) => !x.hidden).length) : t('calOffSub')
  return (
    <Row id="cal" label={t('calRow')} desc={sub}>
      <Toggle on={c.active} label={t('calRow')} onChange={() => c.available && void flip()} />
    </Row>
  )
}
