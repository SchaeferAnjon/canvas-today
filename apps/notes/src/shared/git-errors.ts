/**
 * 同步时 git 报的英文错（stderr）换成一句中文：说清是地址不对、连不上，还是没有权限（CN-45）。
 * 认不出的照样给原话第一行，前面加一句「同步没成功」。不碰 Electron，单元测试测。
 */
export function syncErrorText(raw: string): string {
  const s = raw.replace(/^git \w+ 失败：/, '').trim()
  if (/does not appear to be a git repository|Repository not found|not a git repository|No such file or directory/i.test(s)) return '这个地址找不到仓库，检查一下远程地址'
  if (/Could not resolve host|unable to access|Connection (refused|timed out)|Network is unreachable|Operation timed out|没有回音/i.test(s)) return '连不上远程仓库，检查网络后再点「现在同步」'
  if (/Permission denied|Authentication failed|could not read Username|access denied/i.test(s)) return '远程仓库不让读写，检查登录或SSH钥匙'
  if (/\[rejected\]|non-fast-forward|failed to push/i.test(s)) return '推不上去，远程有别处的新提交，再点一次「现在同步」先拉下来'
  return `同步没成功：${s.split('\n')[0]}`
}

/**
 * 提交时 git 报的错（「现在提交」、AI 改完提交、自动提交）换成一句中文原因，不露 git 的原话和路径。
 * 系统里的 git 可能是中文版，英文、中文两种原话都认；认不出的给第一行，前面写「提交没成功」。
 */
export function commitErrorText(raw: string): string {
  const s = raw.replace(/^git \w+ 失败：/, '').trim()
  if (/Author identity unknown|Please tell me who you are|unable to auto-detect email|empty ident name|作者身份未知|请告诉我您是谁|无法自动探测/i.test(s)) return 'Git不知道用什么署名提交：去设置 › Git和同步填上「提交署名」'
  if (/index\.lock|Unable to create .*\.lock|another git process|无法创建.*\.lock|另一个? ?git ?进程/i.test(s)) return '库里留着一个Git锁文件（.git/index.lock，多半是上次Git没退干净）：确认没有别的Git程序在用这个库，删掉它再提交'
  if (/No space left|磁盘空间不足|设备上没有空间/i.test(s)) return '磁盘满了，提交不了：腾出点地方再提交'
  if (/Permission denied|Operation not permitted|权限不够|不允许的操作/i.test(s)) return '库里的.git文件夹不让写：检查这个文件夹的权限'
  if (/没有回音/.test(s)) return 'Git半天没回应，这次没提交上：再点一次「现在提交」'
  return `提交没成功：${s.split('\n')[0]!.replace(/^(fatal|error|致命错误|错误)[:：]\s*/i, '')}`
}

/**
 * 打开库时建不了 Git 仓库（2026-11-26 收件箱「新 Mac、空文件夹当库」）：以前整窗出错页只写「这一块出错了」，原话里是 git 的英文。
 * 画布笔记用的是这台 Mac 上的 git（安装包里没带）：没装苹果的命令行工具时 /usr/bin/git 只是个占位程序，一跑就报 xcrun 的错；
 * 文件夹不让写（只读、系统不给权限）时 git init 报权限。认得出的换成一句说清怎么办，认不出的给原话第一行
 */
export function initErrorText(raw: string): string {
  const s = raw.replace(/^git \w+ 失败：/, '').trim()
  if (/xcrun|active developer path|command line developer tools|xcode-select|DEVELOPER_DIR/i.test(s)) return '这台 Mac 上的 Git 还用不了：苹果的命令行工具还没装。打开「终端」运行 xcode-select --install，装好后重新打开画布笔记'
  if (/spawn git ENOENT|command not found/i.test(s)) return '这台 Mac 上找不到 Git：打开「终端」运行 xcode-select --install 装上苹果的命令行工具，装好后重新打开画布笔记'
  if (/Permission denied|Operation not permitted|Read-only file system|权限不够|不允许的操作|只读/i.test(s)) return '这个文件夹画布笔记写不进去（没有权限，或是只读的）：换一个文件夹当库，或在系统设置 › 隐私与安全性 › 文件和文件夹里允许画布笔记'
  return `这个文件夹建不了库：${s.split('\n')[0]!.replace(/^(fatal|error|致命错误|错误)[:：]\s*/i, '')}`
}
