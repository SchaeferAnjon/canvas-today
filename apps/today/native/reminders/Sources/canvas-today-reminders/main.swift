// canvas-today-reminders：画布今日读写系统「提醒事项」的小助手（规矩见 RemindersCore/Server.swift）。
//   canvas-today-reminders                 真的提醒事项（EventKit）
//   canvas-today-reminders --memory <文件>  内存里的假提醒事项，存在那个文件里（测试模式用，不碰真的提醒事项）
// stdin 关了（画布今日退出了）就退出。
import Foundation
import RemindersCore

setvbuf(stdout, nil, _IOLBF, 0)

let outLock = NSLock()
func emit(_ line: String) {
  outLock.lock()
  FileHandle.standardOutput.write(Data((line + "\n").utf8))
  outLock.unlock()
}

let args = CommandLine.arguments
let work = DispatchQueue(label: "canvas-today-reminders.work")
let store: ReminderStore
if let i = args.firstIndex(of: "--memory") {
  guard i + 1 < args.count else {
    FileHandle.standardError.write(Data("--memory 后面要跟存假提醒事项的文件\n".utf8))
    exit(2)
  }
  store = MemoryStore(path: args[i + 1])
} else {
  store = EKStore()
}
let server = Server(store: store, emit: emit)

if let ek = store as? EKStore {
  // 外面改了：0.3 秒里连着好几次只说一次
  var pending = false
  ek.onChange = {
    if pending { return }
    pending = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      pending = false
      work.async { server.changed() }
    }
  }
}

Thread.detachNewThread {
  while let line = readLine(strippingNewline: true) {
    if line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
    work.async { server.handle(line) }
  }
  work.async { exit(0) }
}

dispatchMain()
