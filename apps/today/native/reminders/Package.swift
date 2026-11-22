// swift-tools-version:5.9
// 画布今日读写系统「提醒事项」的小助手（task-b9y8i）：一个命令行程序，打包进 Canvas Today.app/Contents/MacOS，
// 和 Electron 主进程用一行一个 JSON 说话（stdin / stdout）。
//   RemindersCore：说话的规矩（Server）、日子和闹钟怎么换、内存里的假提醒事项（MemoryStore，测试和 --memory 用）；不碰 EventKit
//   canvas-today-reminders：main.swift 和 EKStore.swift（真的 EventKit，只有这一处）
// swift test 只测 RemindersCore（EventKit 没有内存里的 store，调用隔在 ReminderStore 这一层后面）。
import PackageDescription

let package = Package(
  name: "CanvasTodayReminders",
  platforms: [.macOS(.v12)],
  products: [.executable(name: "canvas-today-reminders", targets: ["canvas-today-reminders"])],
  targets: [
    .target(name: "RemindersCore", path: "Sources/RemindersCore"),
    .executableTarget(
      name: "canvas-today-reminders",
      dependencies: ["RemindersCore"],
      path: "Sources/canvas-today-reminders",
      linkerSettings: [.linkedFramework("EventKit")]
    ),
    .testTarget(name: "RemindersCoreTests", dependencies: ["RemindersCore"], path: "Tests/RemindersCoreTests"),
  ]
)
