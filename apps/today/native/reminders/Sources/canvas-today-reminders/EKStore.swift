import CoreGraphics
import EventKit
import Foundation
import RemindersCore

/// 真的系统提醒事项（EventKit）。只有这一个文件碰 EventKit；规矩和假的那份（MemoryStore）一样，Server 不分是哪一份。
/// 授权：小助手是画布今日从自己包里开起来的子进程，系统把它记在画布今日名下（问的是「“Canvas Today”想访问你的提醒事项」，
/// 用途说明读 Canvas Today.app 的 Info.plist），所以单独在终端里跑它，问的是终端。
final class EKStore: ReminderStore, CalendarStore {
  private(set) var store = EKEventStore()
  /// 外面改了提醒事项（别的 App、iCloud 同步下来的）
  var onChange: (() -> Void)?
  private var observer: NSObjectProtocol?
  /// 自己刚存过：那一下 EKEventStoreChanged 不当成外面改的
  private var quietUntil = Date.distantPast

  var mode: String { "eventkit" }
  var tz: TimeZone { TimeZone.current }

  init() { observe() }

  private func observe() {
    if let o = observer { NotificationCenter.default.removeObserver(o) }
    observer = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { [weak self] _ in
      guard let self, Date() >= self.quietUntil else { return }
      self.onChange?()
    }
  }

  private func quiet() { quietUntil = Date().addingTimeInterval(2) }

  /// EKAuthorizationStatus 的原始值（避开 macOS 14 改名的 authorized / fullAccess）：0 没问过、1 受限、2 不允许、3 完全访问、4 只能写
  private func auth() -> String {
    switch EKEventStore.authorizationStatus(for: .reminder).rawValue {
    case 0: return "notDetermined"
    case 1: return "restricted"
    case 2: return "denied"
    case 3: return "full"
    case 4: return "writeOnly"
    default: return "denied"
    }
  }

  func status() -> Status {
    let a = auth()
    return Status(auth: a, icloud: a == "full" ? icloudSource() != nil : nil, mode: mode)
  }

  func requestAccess() -> Status {
    guard auth() == "notDetermined" else { return status() }
    let sem = DispatchSemaphore(value: 0)
    if #available(macOS 14.0, *) {
      store.requestFullAccessToReminders { _, _ in sem.signal() }
    } else {
      store.requestAccess(to: .reminder) { _, _ in sem.signal() }
    }
    sem.wait()
    // 刚给了权限：换一个新的 store 才看得到账户和列表
    store = EKEventStore()
    observe()
    return status()
  }

  /// iCloud 账户：CalDAV、名字里有 iCloud、里面有提醒事项列表（没开 iCloud 提醒事项时它只有日历）
  private func icloudSource() -> EKSource? {
    store.sources.first { $0.sourceType == .calDAV && $0.title.range(of: "icloud", options: .caseInsensitive) != nil && !$0.calendars(for: .reminder).isEmpty }
  }

  private func isICloud(_ s: EKSource) -> Bool { s.sourceType == .calDAV && s.title.range(of: "icloud", options: .caseInsensitive) != nil }

  private func hex(_ c: CGColor?) -> String? {
    guard let c, let srgb = CGColorSpace(name: CGColorSpace.sRGB), let s = c.converted(to: srgb, intent: .defaultIntent, options: nil), let p = s.components, p.count >= 3 else { return nil }
    return String(format: "#%02X%02X%02X", Int((p[0] * 255).rounded()), Int((p[1] * 255).rounded()), Int((p[2] * 255).rounded()))
  }

  private func fetchSync(_ p: NSPredicate) throws -> [EKReminder] {
    let sem = DispatchSemaphore(value: 0)
    var out: [EKReminder] = []
    store.fetchReminders(matching: p) { r in
      out = r ?? []
      sem.signal()
    }
    if sem.wait(timeout: .now() + 30) == .timedOut { throw StoreError("failed", "读提醒事项 30 秒没读完") }
    return out
  }

  private func calendar(_ id: String) throws -> EKCalendar {
    guard let c = store.calendar(withIdentifier: id), c.allowedEntityTypes.contains(.reminder) else { throw StoreError("listGone", "没有这个列表：\(id)") }
    return c
  }

  private func info(_ c: EKCalendar, _ all: [EKReminder]) -> ListInfo {
    let mine = all.filter { $0.calendar?.calendarIdentifier == c.calendarIdentifier }
    return ListInfo(id: c.calendarIdentifier, title: c.title, source: c.source?.title ?? "", icloud: c.source.map(isICloud) ?? false, color: hex(c.cgColor), open: mine.filter { !$0.isCompleted }.count, done: mine.filter(\.isCompleted).count, writable: c.allowsContentModifications)
  }

  func lists() throws -> [ListInfo] {
    let cals = store.calendars(for: .reminder)
    let all = cals.isEmpty ? [] : try fetchSync(store.predicateForReminders(in: cals))
    return cals.map { info($0, all) }
  }

  func ensureList(title: String) throws -> ListInfo? {
    guard let src = icloudSource() else { return nil }
    if let c = store.calendars(for: .reminder).first(where: { $0.title == title && $0.source?.sourceIdentifier == src.sourceIdentifier }) {
      return info(c, try fetchSync(store.predicateForReminders(in: [c])))
    }
    let c = EKCalendar(for: .reminder, eventStore: store)
    c.title = title
    c.source = src
    // 天青的强调色（画布今日的图标色）
    c.cgColor = CGColor(srgbRed: 10 / 255, green: 126 / 255, blue: 164 / 255, alpha: 1)
    try store.saveCalendar(c, commit: true)
    quiet()
    return info(c, [])
  }

  private func alarm(_ a: EKAlarm) -> Alarm {
    if let loc = a.structuredLocation, a.proximity != .none { return Alarm(place: loc.title ?? "某地") }
    if let d = a.absoluteDate { return Alarm(at: Dates.local(d, tz: tz)) }
    return Alarm(offset: Int(a.relativeOffset.rounded()))
  }

  private func rule(_ r: EKRecurrenceRule) -> Rule {
    let freq: String
    switch r.frequency {
    case .daily: freq = "daily"
    case .weekly: freq = "weekly"
    case .monthly: freq = "monthly"
    case .yearly: freq = "yearly"
    @unknown default: freq = "daily"
    }
    var end: RuleEnd?
    if let e = r.recurrenceEnd {
      end = e.endDate.map { RuleEnd(date: String(Dates.local($0, tz: tz).prefix(10))) } ?? RuleEnd(count: e.occurrenceCount)
    }
    return Rule(
      freq: freq, interval: r.interval, days: r.daysOfTheWeek?.map { RuleDay(day: $0.dayOfTheWeek.rawValue, week: $0.weekNumber) }, monthDays: r.daysOfTheMonth?.map(\.intValue),
      months: r.monthsOfTheYear?.map(\.intValue), setPositions: r.setPositions?.map(\.intValue), end: end)
  }

  private func item(_ r: EKReminder, rules: Bool) -> Item {
    Item(
      rid: r.calendarItemIdentifier, title: r.title ?? "", notes: r.notes, url: r.url?.absoluteString, due: r.dueDateComponents.flatMap { Dates.dueString($0, tz: tz) }, completed: r.isCompleted,
      completedAt: r.completionDate.map { Dates.local($0, tz: tz) }, priority: r.priority, alarms: (r.alarms ?? []).map(alarm), rules: rules ? (r.recurrenceRules ?? []).map(rule) : nil,
      created: Dates.ms(r.creationDate), modified: Dates.ms(r.lastModifiedDate), list: r.calendar?.calendarIdentifier)
  }

  func fetch(list: String, rules: Bool, completed: Bool) throws -> [Item] {
    let c = try calendar(list)
    let p = completed ? store.predicateForReminders(in: [c]) : store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: [c])
    return try fetchSync(p).map { item($0, rules: rules) }
  }

  /// 照给了的那几项改（规矩同 MemoryStore.apply）
  private func apply(_ f: [String: JSONValue], to r: EKReminder) throws {
    for (k, v) in f {
      switch k {
      case "title":
        guard let s = v.string else { throw StoreError("badRequest", "title 要是字") }
        r.title = s
      case "notes":
        r.notes = v.string
      case "url":
        r.url = v.string.flatMap { URL(string: $0) }
      case "due":
        if v.isNull {
          r.dueDateComponents = nil
        } else if let s = v.string, let c = Dates.dueComponents(s, tz: tz) {
          r.dueDateComponents = c
        } else {
          throw StoreError("badRequest", "due 写法不对")
        }
      case "completed":
        guard let b = v.bool else { throw StoreError("badRequest", "completed 要是 true / false") }
        r.isCompleted = b
      case "priority":
        guard let p = v.int, (0...9).contains(p) else { throw StoreError("badRequest", "priority 是 0–9") }
        r.priority = p
      case "alarms":
        guard let a = v.array else { throw StoreError("badRequest", "alarms 要是数组") }
        r.alarms = try a.compactMap { j -> EKAlarm? in
          guard let al = Alarm(json: j) else { throw StoreError("badRequest", "闹钟写法不对") }
          if let at = al.at {
            guard let d = Dates.date(local: at, tz: tz) else { throw StoreError("badRequest", "闹钟钟点写法不对") }
            return EKAlarm(absoluteDate: d)
          }
          if let off = al.offset { return EKAlarm(relativeOffset: TimeInterval(off)) }
          return nil
        }
      default:
        throw StoreError("badRequest", "不认识的项：\(k)")
      }
    }
  }

  func create(list: String, fields: [String: JSONValue]) throws -> String {
    let r = EKReminder(eventStore: store)
    r.calendar = try calendar(list)
    try apply(fields, to: r)
    try store.save(r, commit: false)
    return r.calendarItemIdentifier
  }

  func update(rid: String, fields: [String: JSONValue]) throws -> Bool {
    guard let r = store.calendarItem(withIdentifier: rid) as? EKReminder else { return false }
    try apply(fields, to: r)
    try store.save(r, commit: false)
    return true
  }

  func remove(rids: [String]) throws -> Int {
    var n = 0
    for id in rids {
      guard let r = store.calendarItem(withIdentifier: id) as? EKReminder else { continue }
      try store.remove(r, commit: false)
      n += 1
    }
    return n
  }

  func move(rids: [String], to list: String) throws -> Int {
    let c = try calendar(list)
    var n = 0
    for id in rids {
      guard let r = store.calendarItem(withIdentifier: id) as? EKReminder else { continue }
      r.calendar = c
      try store.save(r, commit: false)
      n += 1
    }
    return n
  }

  func commit() throws {
    try store.commit()
    quiet()
  }

  // ---------- 系统日历（只读，task-ykkoz） ----------

  /// 日历的授权（EKAuthorizationStatus 原始值，同 auth()）
  private func calAuth() -> String {
    switch EKEventStore.authorizationStatus(for: .event).rawValue {
    case 0: return "notDetermined"
    case 1: return "restricted"
    case 2: return "denied"
    case 3: return "full"
    case 4: return "writeOnly"
    default: return "denied"
    }
  }

  func calendarStatus() -> Status { Status(auth: calAuth(), icloud: nil, mode: mode) }

  func requestCalendarAccess() -> Status {
    guard calAuth() == "notDetermined" else { return calendarStatus() }
    let sem = DispatchSemaphore(value: 0)
    if #available(macOS 14.0, *) {
      store.requestFullAccessToEvents { _, _ in sem.signal() }
    } else {
      store.requestAccess(to: .event) { _, _ in sem.signal() }
    }
    sem.wait()
    // 刚给了权限：换一个新的 store 才看得到日历
    store = EKEventStore()
    observe()
    return calendarStatus()
  }

  func calendars() throws -> [CalInfo] {
    store.calendars(for: .event).map { CalInfo(id: $0.calendarIdentifier, title: $0.title, color: hex($0.cgColor), source: $0.source?.title ?? "") }
  }

  func events(from: String, to: String) throws -> [EventItem] {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    guard let a = Dates.date(local: from + "T00:00", tz: tz), let last = Dates.date(local: to + "T00:00", tz: tz), let b = cal.date(byAdding: .day, value: 1, to: last) else {
      throw StoreError("badRequest", "日子写法不对")
    }
    let cals = store.calendars(for: .event)
    if cals.isEmpty { return [] }
    return store.events(matching: store.predicateForEvents(withStart: a, end: b, calendars: cals)).map { e in
      let start = Dates.local(e.startDate, tz: tz)
      let id = "\(e.calendarItemIdentifier)@\(start)"
      if e.isAllDay {
        // 全天的：结束时刻往前一秒是最后一天（EventKit 有的给当天 23:59:59，有的给第二天零点）
        let first = String(start.prefix(10))
        let end = String(Dates.local(e.endDate.addingTimeInterval(-1), tz: tz).prefix(10))
        return EventItem(id: id, title: e.title ?? "", calendar: e.calendar?.calendarIdentifier ?? "", allDay: true, start: first, end: max(first, end))
      }
      return EventItem(id: id, title: e.title ?? "", calendar: e.calendar?.calendarIdentifier ?? "", allDay: false, start: start, end: Dates.local(e.endDate, tz: tz))
    }
  }
}
