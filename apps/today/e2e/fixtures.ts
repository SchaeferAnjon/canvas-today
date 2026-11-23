/**
 * 测试用的库：照用户真库的样子（收件箱、课程、阅读、写作、周记、生活、项目这些文件夹），「今天」是 2026-11-22（周日）。
 * PROTO 是 v2 原型里那几篇（并排对照图用，和原型一条一条对得上）；VAULT 在它上面再加几篇，一共四十多条。
 */
export const NOW = '2026-11-22T10:20:00'

export const PROTO: Record<string, string> = {
  '收件箱/待办.md': '# 待办\n\n- [ ] 回导师邮件 🔽\n- [ ] 买打印纸\n- [ ] 看《杀死一只知更鸟》第二章\n- [ ] 取快递 📅 2026-11-22\n- [ ] 给猫买粮\n',
  '写作/小论文计划.md':
    '# 小论文计划\n\n截稿前把实验和初稿弄完，周五交给导师。\n\n## 这周\n\n- [ ] 读完三篇相关论文 📅 2026-11-22 🔼\n    - [x] Attention Is All You Need\n    - [ ] BERT\n    - [ ] ViT\n- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫\n- [x] 和导师约时间 ✅ 2026-11-21\n\n## 下周\n\n- [ ] 补实验图 📅 2026-11-25 🔼\n- [ ] 改摘要\n',
  '课程/ecp/Lecture05 笔记.md': '# Lecture05 笔记\n\n第 1 页讲生物神经元长什么样：树突收信号，轴突把信号往下传。\n\n## 要做的\n\n- [ ] 复习 Lecture05 的神经元结构图 📅 2026-11-22 11:00\n- [ ] 交 ecp 作业 2 📅 2026-11-21 23:59 ⏫\n',
  '周记/第47周.md': '# 第47周\n\n## 做了什么\n\n读完《杀死一只知更鸟》前三章，写完小论文的实验部分。\n\n## 下周想做的\n\n- [ ] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日\n',
  '生活/冰岛行程.md': '# 冰岛行程\n\n第一天去雷克雅未克。\n\n## 出发前\n\n- [ ] 订冰岛租车 📅 2026-11-24 20:00 🔔 准时\n',
}

/** 再加的几篇：课程、阅读、项目、生活里的重复任务、Windows 换行的一篇、代码块里不算的 */
export const MORE: Record<string, string> = {
  '课程/ecp/Lecture06 笔记.md': '# Lecture06 笔记\n\n反向传播。\n\n- [ ] 推一遍链式法则 📅 2026-11-26\n- [ ] 做第 6 讲的练习 📅 2026-11-27 🔼\n- [x] 下载讲义 ✅ 2026-11-20\n',
  '课程/线性代数/作业.md': '# 作业\n\n- [ ] 第三章习题 1–10 📅 2026-11-24 ⏫\n- [ ] 复习特征值 📅 2026-11-28\n    - [ ] 看第 5 讲视频\n    - [ ] 做例题\n- [ ] 交期中报告 📅 2026-12-05 23:00 🔔 前一天20:00 ⏫\n',
  '阅读/杀死一只知更鸟.md': '# 杀死一只知更鸟\n\n> 你永远也不可能真正了解一个人，除非你穿上他的鞋子走来走去。\n\n- [ ] 读第三章 📅 2026-11-23\n- [ ] 读第四章\n- [ ] 写读书笔记 🔽\n',
  '阅读/人类简史.md': '# 人类简史\n\n- [ ] 读完认知革命那一部分 📅 2026-11-29\n- [x] 买书 ✅ 2026-11-15\n',
  '生活/家务.md': '# 家务\n\n- [ ] 打扫卫生 📅 2026-11-28 🔁 每周六\n- [ ] 交房租 📅 2026-12-01 🔔 准时 🔁 每月1日 ⏫\n- [ ] 浇花 📅 2026-11-22 🔁 每3天（做完后）\n- [ ] 换床单\n',
  '项目/画布今日.md': '# 画布今日\n\n```\n- [ ] 代码块里的不算\n```\n\n- [ ] 写第一批交回 📅 2026-11-22 18:00 ⏫\n- [ ] 和设计对一遍截图 📅 2026-11-23 🔼\n- [-] 不做的那一条\n',
  '写作/周报.md': '# 周报\r\n\r\n- [ ] 写本周周报 📅 2026-11-22 21:00 🔁 每周日\r\n- [ ] 发给导师 📅 2026-11-23 09:00\r\n',
  '周记/第46周.md': '# 第46周\n\n全写完了。\n\n- [x] 交 ecp 作业 1 ✅ 2026-11-14\n',
}

export const VAULT: Record<string, string> = { ...PROTO, ...MORE }

/**
 * 习惯（v2 原型 habitView 那三个，打卡照原型的最近六天：背单词周四漏了、跑步周一三五、早睡周一周五漏了）。
 * 名字就是文件名；原型里第三个叫「23:30 前睡」（文件 习惯/早睡.md），文件名不能带冒号，这里叫「早睡」
 */
export const HABITS: Record<string, string> = {
  '习惯/背 30 个单词.md': '---\n重复: 每天\n开始: 2026-11-01\n---\n# 背 30 个单词\n\n- 2026-11-16 ✓\n- 2026-11-17 ✓\n- 2026-11-18 ✓\n- 2026-11-20 ✓\n- 2026-11-21 ✓\n',
  '习惯/跑步 3 公里.md': '---\n重复: 每周一、三、五\n开始: 2026-11-16\n---\n# 跑步 3 公里\n\n- 2026-11-16 ✓\n- 2026-11-18 ✓\n- 2026-11-20 ✓\n',
  '习惯/早睡.md': '---\n重复: 每天\n开始: 2026-11-01\n---\n# 早睡\n\n- 2026-11-15 ✓\n- 2026-11-17 ✓\n- 2026-11-18 ✓\n- 2026-11-19 ✓\n- 2026-11-21 ✓\n',
}

/** 假日历（小助手 --memory 的种子）：和原型 EV、CALS 一样的几个日程（11 月 22 日是周日） */
export const CAL_SEED = {
  calendars: [
    { id: 'C-work', title: '工作', color: '#4F7CAC', source: 'iCloud' },
    { id: 'C-home', title: '家里', color: '#B0805A', source: 'iCloud' },
    { id: 'C-class', title: '课程表', color: '#7C6FAE', source: 'iCloud' },
  ],
  events: [
    { id: 'ev-1', title: '和爸妈视频', calendar: 'C-home', allDay: false, start: '2026-11-22T16:00', end: '2026-11-22T17:00' },
    { id: 'ev-2', title: '组会', calendar: 'C-work', allDay: false, start: '2026-11-23T09:30', end: '2026-11-23T10:30' },
    { id: 'ev-3', title: 'ecp 课', calendar: 'C-class', allDay: false, start: '2026-11-24T14:00', end: '2026-11-24T15:30' },
    { id: 'ev-4', title: '和小林吃饭', calendar: 'C-home', allDay: false, start: '2026-11-25T19:00', end: '2026-11-25T20:00' },
    { id: 'ev-5', title: '牙医', calendar: 'C-home', allDay: false, start: '2026-11-27T10:00', end: '2026-11-27T11:00' },
    { id: 'ev-6', title: '交房租', calendar: 'C-home', allDay: true, start: '2026-11-23', end: '2026-11-23' },
  ],
}

/**
 * 系统日历里多一个「提醒事项」（task-ov5bb，用户截图里的样子）：系统把排了时间的提醒画成日程，
 * 画布今日镜像进提醒事项的待办在这里又出来一遍（和白块重复），再加几条别的提醒；30 号只有提醒（小月历的点）
 */
export const REM_CAL = { id: 'C-rem', title: '提醒事项', color: '#FF3B30', source: 'iCloud' }
export const CAL_REM_SEED = {
  ...CAL_SEED,
  calAuth: 'full',
  calendars: [REM_CAL, ...CAL_SEED.calendars],
  events: [
    ...CAL_SEED.events,
    { id: 'r-1', title: '复习 Lecture05 的神经元结构图', calendar: 'C-rem', allDay: false, start: '2026-11-22T11:00', end: '2026-11-22T12:00' },
    { id: 'r-2', title: '写第一批交回', calendar: 'C-rem', allDay: false, start: '2026-11-22T18:00', end: '2026-11-22T19:00' },
    { id: 'r-3', title: '发给导师', calendar: 'C-rem', allDay: false, start: '2026-11-23T09:00', end: '2026-11-23T10:00' },
    { id: 'r-4', title: '交论文初稿', calendar: 'C-rem', allDay: false, start: '2026-11-23T15:00', end: '2026-11-23T16:00' },
    { id: 'r-5', title: '交实验报告', calendar: 'C-rem', allDay: false, start: '2026-11-24T10:00', end: '2026-11-24T12:00' },
    { id: 'r-6', title: '订冰岛租车', calendar: 'C-rem', allDay: false, start: '2026-11-24T20:00', end: '2026-11-24T21:00' },
    { id: 'r-7', title: '取干洗的衣服', calendar: 'C-rem', allDay: false, start: '2026-11-25T13:00', end: '2026-11-25T14:00' },
    { id: 'r-8', title: '给房东回邮件', calendar: 'C-rem', allDay: false, start: '2026-11-26T09:00', end: '2026-11-26T11:00' },
    { id: 'r-9', title: '续签证材料', calendar: 'C-rem', allDay: true, start: '2026-11-26', end: '2026-11-26' },
    { id: 'r-10', title: '打电话给银行', calendar: 'C-rem', allDay: false, start: '2026-11-27T14:00', end: '2026-11-27T15:00' },
    { id: 'r-11', title: '买牛奶', calendar: 'C-rem', allDay: false, start: '2026-11-30T18:00', end: '2026-11-30T18:30' },
  ],
}
