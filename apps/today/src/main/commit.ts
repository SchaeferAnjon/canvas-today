/**
 * 改动提交（照画布笔记的 Git 做法，用 @cn/git）：画布今日自己改的那几篇，停手 1.5 秒后提交一次，只提交这几篇（commitPaths），
 * 不碰别的没提交的改动（画布笔记那边正在写的照它自己的自动提交走）。说明写做了什么：「画布今日：勾掉「读完三篇相关论文」」。
 * 退出前把排着的提交掉。
 */
import * as git from '@cn/git'

export class Committer {
  private paths = new Set<string>()
  private says: string[] = []
  private timer: NodeJS.Timeout | null = null
  private running: Promise<unknown> = Promise.resolve()
  onDone: (hash: string | null) => void = () => {}
  onError: (e: Error) => void = () => {}

  constructor(
    private root: string,
    private delay = Number(process.env.CT_COMMIT_MS) || 1500,
  ) {}

  /** 拿着的时候只攒不提交（全局小框一次加几条：几篇一起一次提交） */
  private held = 0

  add(paths: string[], say: string) {
    paths.forEach((p) => this.paths.add(p))
    this.says.push(say)
    if (this.timer) clearTimeout(this.timer)
    if (!this.held) this.timer = setTimeout(() => void this.flush(), this.delay)
  }

  /** 跟着下一次一起提交的文件（不另写说明）：快速输入框贴的图跟着那一条待办 */
  addFiles(paths: string[]) {
    paths.forEach((p) => this.paths.add(p))
  }
  /** 先攒着，run 做完再照常等一会儿提交 */
  async batch<T>(run: () => Promise<T>): Promise<T> {
    this.held++
    try {
      return await run()
    } finally {
      this.held--
      if (!this.held && this.paths.size) this.timer = setTimeout(() => void this.flush(), this.delay)
    }
  }

  /** 现在就提交排着的（退出前、测试里） */
  flush(): Promise<unknown> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.paths.size) return this.running
    const paths = [...this.paths]
    const says = this.says
    this.paths.clear()
    this.says = []
    const msg = says.length === 1 ? says[0]! : `画布今日：${says.slice(0, 3).map((s) => s.replace(/^画布今日：/, '')).join('；')}${says.length > 3 ? ` 等${says.length}处` : ''}`
    this.running = this.running
      .then(() => git.commitPaths(this.root, paths, msg))
      .then(
        (h) => this.onDone(h),
        (e: Error) => this.onError(e),
      )
    return this.running
  }
}
