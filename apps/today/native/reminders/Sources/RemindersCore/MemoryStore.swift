import Foundation

/// 内存里的假提醒事项（测试模式 --memory <文件> 和 swift test 用）：样子照 EventKit，存在一个 JSON 文件里（软件重开还在，e2e 能读能写种子），
/// 记下收到过的每个命令（calls）。test.* 命令像人在提醒事项 App 里那样改（勾掉、改时间、改标题、删掉），改完发一行 {"event":"changed"}。
public struct MemList: Codable, Equatable {
  public var id: String
  public var title: String
  public var icloud: Bool
  public var color: String?
  public init(id: String, title: String, icloud: Bool, color: String?) {
    self.id = id
    self.title = title
    self.icloud = icloud
    self.color = color
  }
}

public struct MemState: Codable {
  public var auth = "notDetermined"
  /// 开没开 iCloud 提醒事项
  public var icloud = true
  /// 系统问的时候点「不允许」
  public var denyRequest = false
  public var lists: [MemList] = []
  public var items: [Item] = []
  public var calls: [String] = []
  public var seq = 0
  /// 假日历（task-ykkoz）：授权、系统问的时候点「不允许」、日历、日程
  public var calAuth = "notDetermined"
  public var calDenyRequest = false
  public var calendars: [CalInfo] = []
  public var events: [EventItem] = []

  public init() {}

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    auth = try c.decodeIfPresent(String.self, forKey: .auth) ?? "notDetermined"
    icloud = try c.decodeIfPresent(Bool.self, forKey: .icloud) ?? true
    denyRequest = try c.decodeIfPresent(Bool.self, forKey: .denyRequest) ?? false
    lists = try c.decodeIfPresent([MemList].self, forKey: .lists) ?? []
    items = try c.decodeIfPresent([Item].self, forKey: .items) ?? []
    calls = try c.decodeIfPresent([String].self, forKey: .calls) ?? []
    seq = try c.decodeIfPresent(Int.self, forKey: .seq) ?? 0
    calAuth = try c.decodeIfPresent(String.self, forKey: .calAuth) ?? "notDetermined"
    calDenyRequest = try c.decodeIfPresent(Bool.self, forKey: .calDenyRequest) ?? false
    calendars = try c.decodeIfPresent([CalInfo].self, forKey: .calendars) ?? []
    events = try c.decodeIfPresent([EventItem].self, forKey: .events) ?? []
  }
}

public final class MemoryStore: ReminderStore, CalendarStore {
  public var state: MemState
  let path: String
  let now: () -> Int64
  let tz = TimeZone.current

  public var mode: String { "memory" }

  public init(path: String, now: @escaping () -> Int64 = { Dates.ms(Date()) }) {
    self.path = path
    self.now = now
    if let data = FileManager.default.contents(atPath: path), let s = try? JSONDecoder().decode(MemState.self, from: data) {
      state = s
    } else {
      state = MemState()
    }
  }

  func save() {
    let e = JSONEncoder()
    e.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    if let data = try? e.encode(state) { try? data.write(to: URL(fileURLWithPath: path), options: .atomic) }
  }

  /// 记下收到的命令（测试看「系统问了几次」「存了几次」）
  public func record(_ cmd: String) {
    state.calls.append(cmd)
    save()
  }

  func nextId(_ prefix: String) -> String {
    state.seq += 1
    return "\(prefix)-\(state.seq)"
  }

  public func status() -> Status {
    Status(auth: state.auth, icloud: state.auth == "full" ? state.icloud : nil, mode: mode)
  }

  public func requestAccess() -> Status {
    if state.auth == "notDetermined" {
      state.auth = state.denyRequest ? "denied" : "full"
      save()
    }
    return status()
  }

  public func lists() throws -> [ListInfo] {
    state.lists.map { l in
      let mine = state.items.filter { $0.list == l.id }
      return ListInfo(id: l.id, title: l.title, source: l.icloud ? "iCloud" : "在我的 Mac 上", icloud: l.icloud, color: l.color, open: mine.filter { !$0.completed }.count, done: mine.filter(\.completed).count, writable: true)
    }
  }

  public func ensureList(title: String) throws -> ListInfo? {
    guard state.icloud else { return nil }
    if !state.lists.contains(where: { $0.title == title && $0.icloud }) {
      state.lists.append(MemList(id: nextId("list"), title: title, icloud: true, color: "#0A7EA4"))
      save()
    }
    return try lists().first { $0.title == title && $0.icloud }
  }

  func needList(_ id: String) throws {
    guard state.lists.contains(where: { $0.id == id }) else { throw StoreError("listGone", "没有这个列表：\(id)") }
  }

  public func fetch(list: String, rules: Bool, completed: Bool) throws -> [Item] {
    try needList(list)
    return state.items.filter { $0.list == list && (completed || !$0.completed) }.map { i in
      var i = i
      if !rules { i.rules = nil }
      return i
    }
  }

  /// 照给了的那几项改（类型不对的报 badRequest）
  func apply(_ f: [String: JSONValue], to i: inout Item) throws {
    for (k, v) in f {
      switch k {
      case "title":
        guard let s = v.string else { throw StoreError("badRequest", "title 要是字") }
        i.title = s
      case "notes", "url":
        guard v.isNull || v.string != nil else { throw StoreError("badRequest", "\(k) 要是字或 null") }
        if k == "notes" { i.notes = v.string } else { i.url = v.string }
      case "due":
        if v.isNull {
          i.due = nil
        } else if let s = v.string, let c = Dates.dueComponents(s, tz: tz) {
          i.due = Dates.dueString(c, tz: tz)
        } else {
          throw StoreError("badRequest", "due 写法不对")
        }
      case "completed":
        guard let b = v.bool else { throw StoreError("badRequest", "completed 要是 true / false") }
        if b, !i.completed { i.completedAt = Dates.local(Date(timeIntervalSince1970: Double(now()) / 1000), tz: tz) }
        if !b { i.completedAt = nil }
        i.completed = b
      case "priority":
        guard let p = v.int, (0...9).contains(p) else { throw StoreError("badRequest", "priority 是 0–9") }
        i.priority = p
      case "alarms":
        guard let a = v.array else { throw StoreError("badRequest", "alarms 要是数组") }
        i.alarms = try a.map { j in
          guard let al = Alarm(json: j) else { throw StoreError("badRequest", "闹钟写法不对") }
          return al
        }
      default:
        throw StoreError("badRequest", "不认识的项：\(k)")
      }
    }
  }

  public func create(list: String, fields: [String: JSONValue]) throws -> String {
    try needList(list)
    let t = now()
    var i = Item(rid: nextId("rem"), title: "", completed: false, priority: 0, alarms: [], created: t, modified: t, list: list)
    try apply(fields, to: &i)
    state.items.append(i)
    return i.rid
  }

  public func update(rid: String, fields: [String: JSONValue]) throws -> Bool {
    guard let n = state.items.firstIndex(where: { $0.rid == rid }) else { return false }
    try apply(fields, to: &state.items[n])
    state.items[n].modified = now()
    return true
  }

  public func remove(rids: [String]) throws -> Int {
    let before = state.items.count
    state.items.removeAll { rids.contains($0.rid) }
    return before - state.items.count
  }

  public func move(rids: [String], to list: String) throws -> Int {
    try needList(list)
    var n = 0
    for k in state.items.indices where rids.contains(state.items[k].rid) {
      state.items[k].list = list
      state.items[k].modified = now()
      n += 1
    }
    return n
  }

  public func commit() throws { save() }

  // ---------- 假日历（只读） ----------

  public func calendarStatus() -> Status {
    Status(auth: state.calAuth, icloud: nil, mode: mode)
  }

  public func requestCalendarAccess() -> Status {
    if state.calAuth == "notDetermined" {
      state.calAuth = state.calDenyRequest ? "denied" : "full"
      save()
    }
    return calendarStatus()
  }

  public func calendars() throws -> [CalInfo] { state.calendars }

  public func events(from: String, to: String) throws -> [EventItem] {
    state.events.filter { $0.overlaps(from: from, to: to) }.sorted { $0.start < $1.start }
  }

  // ---------- 测试用：像人在提醒事项 App 里改 ----------

  func find(_ o: [String: JSONValue]) throws -> Int {
    if let rid = o["rid"]?.string, let n = state.items.firstIndex(where: { $0.rid == rid }) { return n }
    if let id = o["task"]?.string {
      let mark = "canvas-today://task/\(id)"
      if let n = state.items.firstIndex(where: { $0.url == mark || ($0.notes ?? "").contains(mark) }) { return n }
    }
    throw StoreError("badRequest", "提醒事项里没有这一条")
  }

  public func test(_ cmd: String, _ o: [String: JSONValue], emit: (String) -> Void) throws -> JSONValue {
    switch cmd {
    case "test.dump":
      return JSONValue.from(state)
    case "test.set":
      if let a = o["auth"]?.string { state.auth = a }
      if let b = o["icloud"]?.bool { state.icloud = b }
      if let b = o["denyRequest"]?.bool { state.denyRequest = b }
      if let a = o["calAuth"]?.string { state.calAuth = a }
      if let b = o["calDenyRequest"]?.bool { state.calDenyRequest = b }
      save()
      return status().json()
    case "test.external":
      let op = o["op"]?.string ?? ""
      var rid = ""
      switch op {
      case "add":
        guard let list = o["list"]?.string, let f = o["fields"]?.object else { throw StoreError("badRequest", "add 要 list 和 fields") }
        rid = try create(list: list, fields: f)
      case "addEvent":
        // 像在日历 App 里加了一个日程（只读的那一边，画布今日只看）
        guard let cal = o["calendar"]?.string, let title = o["title"]?.string, let start = o["start"]?.string, let end = o["end"]?.string else { throw StoreError("badRequest", "addEvent 要 calendar、title、start、end") }
        rid = nextId("ev")
        state.events.append(EventItem(id: rid, title: title, calendar: cal, allDay: o["allDay"]?.bool ?? false, start: start, end: end))
      default:
        let n = try find(o)
        rid = state.items[n].rid
        switch op {
        case "complete":
          state.items[n].completed = true
          state.items[n].completedAt = o["at"]?.string ?? Dates.local(Date(timeIntervalSince1970: Double(now()) / 1000), tz: tz)
        case "reopen":
          state.items[n].completed = false
          state.items[n].completedAt = nil
        case "setDue":
          try apply(["due": o["due"] ?? .null], to: &state.items[n])
        case "setTitle":
          try apply(["title": o["title"] ?? .string("")], to: &state.items[n])
        case "setPriority":
          try apply(["priority": o["priority"] ?? .int(0)], to: &state.items[n])
        case "delete":
          state.items.remove(at: n)
        default:
          throw StoreError("badRequest", "不认识的改法：\(op)")
        }
        if op != "delete" { state.items[n].modified = o["modified"].flatMap { $0.int }.map(Int64.init) ?? now() }
      }
      save()
      emit(Server.changedLine)
      return .object(["rid": .string(rid)])
    default:
      throw StoreError("unknown", "不认识的命令：\(cmd)")
    }
  }
}
