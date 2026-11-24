/**
 * MeetCaption 联动（画布今日这一侧）的样本库：MeetCaption 连库时写的 .canvas-notes/meetcaption.json（ECP 每周三 09:00），
 * 上周三那节课的上课记录（@cn/format 的 writeMcRecord 写，和 MeetCaption 下课写进库的一样）：两件作业，一件定在今天（11-25 周三）、一件没定日子。
 * 单测（test/mc.test.ts）和 e2e（e2e/t24-meetcaption.spec.ts）共用。
 */
import { writeMcRecord } from '@cn/format'

export const MC_FOLDER = '课程/ECP-Emerging-Computing-Paradigms'
export const MC_MAP = {
  projects: [{ id: 'ecp', folder: MC_FOLDER, mode: 'class', name: 'ECP', schedule: [{ weekday: 3, time: '09:00' }] }],
}
export const MC_RECORD = `${MC_FOLDER}/上课记录/2026-11-18 近似加法器与乘法器.md`
export const MC_SESSION = '2026-11-18 09.00'

export const MC_RECORD_TEXT = writeMcRecord({
  path: MC_RECORD,
  title: '2026-11-18 近似加法器与乘法器',
  course: 'ecp',
  mode: 'class',
  sessions: [MC_SESSION],
  duration: '1:30',
  overview: { text: '近似加法器的动机和三种误差指标。', engine: 'DeepSeek' },
  todos: [
    // 09:43（开始后 2580 秒）
    { text: '列出近似加法器的三种误差指标', session: MC_SESSION, t: 2580, due: '2026-11-25' },
    { text: '读 lec03 第 2 节', session: MC_SESSION, t: 3300 },
  ],
  parts: [{ session: MC_SESSION, sections: [{ title: '近似计算的动机', t: 0, points: [{ text: '误差换功耗', t: 600 }] }] }],
})

/** 今天（11-25）这一节正在写的记录：MeetCaption 上课时每 2 分钟补一次，作业先写进来（还没定日子） */
export const MC_TODAY_RECORD = `${MC_FOLDER}/上课记录/2026-11-25 近似乘法器.md`
export const MC_TODAY_SESSION = '2026-11-25 09.00'
export const MC_TODAY_TEXT = writeMcRecord({
  path: MC_TODAY_RECORD,
  title: '2026-11-25 近似乘法器',
  course: 'ecp',
  mode: 'class',
  sessions: [MC_TODAY_SESSION],
  todos: [{ text: '把 CDM8 乘法器的误差表补完', session: MC_TODAY_SESSION, t: 1500 }],
})

export const MC_FILES: Record<string, string> = {
  '.canvas-notes/meetcaption.json': JSON.stringify(MC_MAP, null, 2) + '\n',
  [MC_RECORD]: MC_RECORD_TEXT,
  '收件箱/待办.md': '# 待办\n\n- [ ] 买牛奶 📅 2026-11-25\n',
  // 设置 › 软件家族「MeetCaption说到的待办进清单」拨开了（名单里默认关）
  '.canvas-notes/联动.json': '{\n  "mc-todo": true\n}\n',
}
