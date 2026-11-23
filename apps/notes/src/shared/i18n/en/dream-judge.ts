/** 英文表：梦游的 AI 判断（task-h7oy8）：设置 › 梦游「AI判断补双链」、报告里拿不准和复查两组、两边原话、这晚判断的账 */
import { count, type Table } from '../core'

export const DREAM_JUDGE: Table = {
  // ---------- 报告（renderer/dream/evidence.tsx、useDream.ts） ----------
  '同一内容': 'same content',
  '同一主题': 'same topic',
  '只是沾边': 'only loosely related',
  '无关': 'unrelated',
  '拿不准': 'unsure',
  '去掉这行': 'Remove this line',
  '留着': 'Keep',
  '丢掉': 'Drop',
  '{by}判的': 'Judged by {by}',
  '本地比对 + {by}': 'Local comparison + {by}',
  '本地比对，没用AI': 'Local comparison, no AI',
  '这篇': 'This note',
  '判成{level} · 把握 {c}': 'Judged {level} · confidence {c}',
  '判成{level} · 把握 {c} · 原话软件逐字核对过': 'Judged {level} · confidence {c} · quotes checked word for word',
  '补双链：{by}判了{n}篇、问了{asked}次AI': (p) => `Links: ${p.by} judged ${count(p.n, 'note')} with ${count(p.asked, 'AI call')}`,
  '，{n}篇用的是以前判过的结果': (p) => `, reused earlier results for ${count(p.n, 'note')}`,
  '；到了每晚{cap}篇的上限，还剩{left}篇明晚接着': (p) => `; reached the nightly limit of ${count(p.cap, 'note')}, ${p.left} left for tomorrow night`,
  '；还剩{left}篇下次接着': (p) => `; ${p.left} left for next time`,
  '。': '.',
  '判过没提的{n}对，比如「{a}」和「{b}」：{why}': (p) => `${count(p.n, 'pair')} judged and not suggested, e.g. “${p.a}” and “${p.b}”: ${p.why}`,
  '判过没提的{n}对': (p) => `${count(p.n, 'pair')} judged and not suggested`,
  '{n}对AI抄的原话在原文里找不到，作废了': (p) => `${count(p.n, 'pair')} dropped: the AI’s quotes were not in the notes`,
  '拿不准，你来定': 'Unsure: you decide',
  '旧「相关：」复查': 'Rechecked “Related:” lines',
  // ---------- 设置 › 梦游（renderer/settings-dream.tsx） ----------
  '归类、小结、可视化用哪家AI': 'AI for filing, weekly summary and visuals',
  '走订阅': 'Use your subscription',
  '用这台Mac上已登录的命令行（Claude Code、Codex等），算在你的订阅用量里，不另付钱；要先装好、登录一家（设置 › AI 最下面能看）':
    'Uses a command-line AI signed in on this Mac (Claude Code, Codex, …); counts toward your subscription, no extra cost. Install and sign in to one first (see the bottom of Settings › AI)',
  '软件自己在这台Mac上跑一个小模型，不联网、不花额度；只做初筛：判成相关的都放进「拿不准，你来定」，你点了才连。第一次用时下载一次，要Apple芯片和8GB以上内存':
    'Runs a small model on this Mac: offline, no usage cost. A first pass only: pairs it finds related go to “Unsure: you decide” and are linked only when you accept them. Downloaded once on first use; needs Apple silicon and 8 GB of memory or more',
  'AI判断补双链': 'AI judging for links',
  '补双链、拿不准的、复查旧「相关：」都由它判；准确第一，宁可少连': 'Judges new links, unsure pairs and existing “Related:” lines; accuracy first, fewer links rather than wrong ones',
  'AI判断走哪条路': 'How the AI judges',
  '哪家、哪个模型、想多久': 'Provider, model and effort',
  '默认Sonnet 5.5 · Medium（真库评测准确率97.5%）；换Haiku省额度，自动连的把握线提到0.85': 'Default Sonnet 5.5 · Medium (97.5% accurate on a real library); Haiku uses less quota and needs confidence 0.85 to link on its own',
  '判断用哪一家': 'Provider for judging',
  '梦游判断': 'Dream judging',
  '每晚最多判几篇': 'Notes judged per night',
  '一篇问一次AI；判过又没改过的不再问。第一次整库补全分几晚做完，报告末尾写还剩几篇明晚接着':
    'One AI call per note; unchanged notes are not asked again. A first pass over a whole library takes several nights; the report says how many are left',
  '上次梦游：{by}判了{n}篇、问了{asked}次AI，到了每晚{cap}篇的上限，还剩{left}篇明晚接着': (p) =>
    `Last dream: ${p.by} judged ${count(p.n, 'note')} with ${count(p.asked, 'AI call')}, reached the nightly limit of ${p.cap}; ${p.left} left for tomorrow night`,
  '上次梦游：{by}判了{n}篇、问了{asked}次AI，{cached}篇用的是以前判过的结果，全库都判过了': (p) =>
    `Last dream: ${p.by} judged ${count(p.n, 'note')} with ${count(p.asked, 'AI call')}, reused earlier results for ${p.cached}; the whole library has been judged`,
  '库里别的文件夹：勾上的也补双链': 'Other folders in this library: links are added in the ticked ones too',
  '库里别的文件夹': 'Other folders in this library',
  '看名字像「{cat}」': 'Looks like “{cat}”',
}
