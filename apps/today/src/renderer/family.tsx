/**
 * 设置 › 软件家族（task-59o3v）：和画布笔记同一个页面（@cn/design/settings FamilyPage）、同一份名单和排法（@cn/family），
 * 同一套主进程和读法（画布笔记的 main/family.ts、renderer/family-store.ts）；这里只接画布今日自己的字和去处：
 * 「去库 ›」翻到库那一页、「去外观 ›」翻到外观「和画布笔记一样」那一行闪一下。
 */
import { familyView } from '@cn/family'
import { FAMILY_ICONS } from '@cn/family/icons'
import { FamilyPage } from '@cn/design/settings'
import { useEffect, useMemo } from 'react'
import { loadFamily, recheckFamily, setFamilyLink, useFamily } from '../../../notes/src/renderer/family-store'
import { checkedLabel } from '../shared/update'
import { nowMs, useLang } from './store'
import { useT } from './ui'

/** 画布今日的代码会的联动（名单里新出现、这一版还不会的写「先更新画布今日」） */
export const TODAY_KNOWS = ['cn-open', 'mc-todo']

export function FamilySettings({ onGoRow }: { onGoRow(row: string): void }) {
  const t = useT()
  const lang = useLang()
  const s = useFamily()
  // 开着这一页时窗口拿到焦点（从浏览器下载、装好回来）：再问一次装了哪些
  useEffect(() => {
    void recheckFamily()
    const f = () => void recheckFamily()
    window.addEventListener('focus', f)
    return () => window.removeEventListener('focus', f)
  }, [])
  const view = useMemo(() => (s ? familyView({ host: 'canvas-today', hostVersion: s.version, list: s.list, installed: s.installed, links: s.links, knows: TODAY_KNOWS, lang, vault: s.vault }) : null), [s, lang])
  const text = useMemo(
    () => ({
      linked: t('famLinked'),
      linkedNote: t('famLinkedNote'),
      more: t('famMore'),
      moreNote: t('famMoreNote'),
      installed: (v: string | null) => t('famInstalled', v ?? ''),
      open: t('famOpen'),
      download: t('famDownload'),
      waiting: t('famWaiting'),
      recheck: t('famRecheck'),
      after: t('famAfter'),
      update: (name: string) => t('famUpdate', name),
      novault: t('famNoVault'),
      source: !s?.fetchOn ? t('famSourceOff') : s.checkedAt ? t('famSourceAt', checkedLabel(s.checkedAt, lang, nowMs())) : t('famSource'),
      hub: t('famHub'),
      opened: (name: string) => t('famOpened', name),
      openFailed: (name: string) => t('famOpenFailed', name),
      downloadOpened: (name: string, url: string) => t('famDownloadOpened', name, url),
      found: (name: string, version: string | null, linked: boolean) => (linked ? t('famFoundLinked', name, version ?? '') : t('famFound', name, version ?? '')),
      notYet: (name: string) => t('famNotYet', name),
    }),
    [t, lang, s?.fetchOn, s?.checkedAt],
  )
  if (!view) return null
  return (
    <FamilyPage
      view={view}
      icons={FAMILY_ICONS}
      text={text}
      onToggle={(id, on) => setFamilyLink(id, on)}
      onOpen={async (id) => {
        const ok = await window.cnFamily.open(id)
        if (!ok) await loadFamily()
        return ok
      }}
      onDownload={(id) => void window.cnFamily.download(id)}
      onRecheck={async (id) => (await recheckFamily()).installed[id] ?? null}
      onGo={onGoRow}
      onHub={() => void window.cnFamily.hub()}
    />
  )
}
