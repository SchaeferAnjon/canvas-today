/** 笔记的文件名：主进程按它存文件，界面按它说清存成了什么 */

/** 文件名里不能有的字符 */
const BAD = /[\\/:*?"<>|\u0000-\u001f]/g

/** 文件名里不能有的字符换掉；空的叫「未命名」 */
export function safeName(name: string): string {
  const s = name
    .replace(BAD, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
  return s || '未命名'
}

/**
 * 起名（标题跟着改名、数据库名字格、标签上改名）之后底部说的那句；名字原样存下了返回 null。
 * asked：人打的名字；got：真存成的文件名（不带 .md）；unit：「篇」（笔记）或「条」（数据库条目）；
 * clean：不撞名时该存成的名字（标题跟着改名时 / : 先换成了「-」，见 title-follow.ts）。
 * 只是去掉、换掉了不能当文件名的字：说「「?」不能用在文件名里，已换成「为什么」」，不说重名；真撞了名才说「已经有」。
 */
export function nameNotice(asked: string, got: string, unit: '篇' | '条', clean = safeName(asked)): string | null {
  const bad = [...new Set(asked.match(BAD) ?? [])].filter((c) => c >= ' ')
  if (bad.length) {
    const said = `${bad.map((c) => `「${c}」`).join('')}不能用在文件名里，已换成「${got}」`
    return got === clean ? said : `${said}（「${clean}」已经有了）`
  }
  return got === clean ? null : `已经有一${unit}叫「${clean}」了，这${unit}存成「${got}」`
}
