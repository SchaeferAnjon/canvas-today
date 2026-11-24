/**
 * 日历和提醒事项的设置引导（2026-11-24 用户：「用我们的软件当做日历，用提醒事项其实更好，我只不过是担心有些人可能三者都用」）：
 * 系统日历、提醒事项、画布今日三样都用的人照着点一遍，同一件事不出现两遍。第一次连上提醒事项或系统日历时自动出一次（App.tsx），
 * 关掉记 calGuideSeen、不再自动出；设置 › 日历和提醒事项里能再打开。
 * 一张小卡四步，每步一行字，能跳的带一颗按钮：iCloud 打开系统设置的 Apple 账户（x-apple.systempreferences:，同 remOpenICloud），
 * 画布今日自己的设置直接翻到「日历和提醒事项」，系统「日历」App 直接打开（测试模式都只记下来）。
 * 「我只用画布今日」：画布今日这边照最简的设好（提醒所有带钟点的待办、镜像、显示日程，没连的不去连、不弹系统询问），
 * 系统日历里「已安排的提醒事项」那项不勾，提示一句。
 */
import { INBOX_NOTE } from '../shared/brand'
import { getData, saveSettings, useData, useLang } from './store'
import { Ic, useT } from './ui'

export function CalGuide({ onClose, onSettings, onOnly }: { onClose: () => void; onSettings: () => void; onOnly: () => void }) {
  const t = useT()
  const lang = useLang()
  const { rem } = useData()
  const list = rem?.list?.title ?? (lang === 'zh' ? '画布今日' : 'Canvas Today')
  const steps: { text: string; btn?: [string, () => void] }[] = [
    { text: t('guideStep1'), btn: [t('guideOpen'), () => void window.ct.remOpenICloud()] },
    { text: t('guideStep2', list), btn: [t('guideOpen'), onSettings] },
    { text: t('guideStep3'), btn: [t('guideOpenCal'), () => void window.ct.openCalendarApp()] },
    { text: t('guideStep4', list, INBOX_NOTE) },
  ]
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="askw guidew" role="dialog" aria-label={t('guideTitle')} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="guideh">
          <b>{t('guideTitle')}</b>
          <button className="ib" aria-label={t('close')} onClick={onClose}>
            <Ic n="close" s={14} />
          </button>
        </div>
        <p>{t('guideSub')}</p>
        <ol className="guides">
          {steps.map((s, i) => (
            <li key={i} data-step={i + 1}>
              <span className="guiden">{i + 1}</span>
              <span className="guidet">{s.text}</span>
              {s.btn && (
                <button className="btn sm" onClick={s.btn[1]}>
                  {s.btn[0]}
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className="impfoot">
          <button className="btn" onClick={onOnly}>
            {t('guideOnly')}
          </button>
          <button className="btn pri" onClick={onClose} autoFocus>
            {t('guideDone')}
          </button>
        </div>
      </div>
    </>
  )
}

/** 「我只用画布今日」：画布今日这边照最简的设好；没连的不去连（不弹系统询问） */
export async function onlyCanvasToday() {
  const { rem, cal, state } = getData()
  if (!state!.settings.remindAll) await saveSettings({ remindAll: true })
  if (rem?.connected && !rem.mirror) await window.ct.remSetMirror(true)
  if (cal?.auth === 'full' && !cal.show) await window.ct.calShow(true)
}
