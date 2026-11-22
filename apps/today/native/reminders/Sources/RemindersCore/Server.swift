import Foundation

/// 小助手和 Electron 说话的规矩：stdin 一行一个请求 {"id":1,"cmd":"fetch","list":"…"}，stdout 一行一个回答
/// {"id":1,"ok":true,"result":{…}} 或 {"id":1,"ok":false,"code":"listGone","error":"…"}；提醒事项在外面改了发一行 {"event":"changed"}。
///
/// 命令：
///   status                         授权和账户（不弹窗）
///   request                        要访问提醒事项的权限（第一次系统问一次）
///   lists                          所有列表和各有几条、几条已完成
///   ensureList {title}             在 iCloud 下找这个列表，没有就建；没开 iCloud 提醒事项时 list 是 null
///   fetch {list}                   一个列表里的全部（含已完成）
///   read {lists, completed}        导入用：几个列表，带重复规则
///   save {list, create:[{key, fields}], update:[{rid, fields}]}   一批新建、改，一起存；回答 created {key: rid}、missing [rid]
///   remove {rids}   move {rids, list}
///   calStatus / calRequest         日历的授权（不弹窗）/ 要日历的权限（第一次系统问一次）
///   calendars                      系统里的日历（只读）
///   events {from, to}              这几天（本地日子，都含）的日程，重复的每一次各一条
///   test.dump / test.set / test.external   只有 --memory 的假提醒事项认
public final class Server {
  public static let changedLine = "{\"event\":\"changed\"}"
  let store: ReminderStore
  let emit: (String) -> Void

  public init(store: ReminderStore, emit: @escaping (String) -> Void) {
    self.store = store
    self.emit = emit
  }

  /// 外面改了提醒事项（EKEventStoreChanged）
  public func changed() { emit(Server.changedLine) }

  public func handle(_ line: String) {
    guard let req = JSONValue.parse(line)?.object else {
      emit(JSONValue.object(["id": .null, "ok": .bool(false), "code": .string("badRequest"), "error": .string("请求不是一行 JSON 对象")]).line())
      return
    }
    let id = req["id"] ?? .null
    do {
      guard let cmd = req["cmd"]?.string else { throw StoreError("badRequest", "没写 cmd") }
      let result = try run(cmd, req)
      emit(JSONValue.object(["id": id, "ok": .bool(true), "result": result]).line())
    } catch let e as StoreError {
      emit(JSONValue.object(["id": id, "ok": .bool(false), "code": .string(e.code), "error": .string(e.message)]).line())
    } catch {
      emit(JSONValue.object(["id": id, "ok": .bool(false), "code": .string("failed"), "error": .string("\(error)")]).line())
    }
  }

  func calendar() throws -> CalendarStore {
    guard let c = store as? CalendarStore else { throw StoreError("unknown", "这个小助手不读日历") }
    return c
  }

  func needCalendar() throws -> CalendarStore {
    let c = try calendar()
    guard c.calendarStatus().auth == "full" else { throw StoreError("noAccess", "没有访问日历的权限") }
    return c
  }

  func day(_ v: JSONValue?, _ name: String) throws -> String {
    let s = try need(v, name)
    guard Dates.dueComponents(s, tz: TimeZone(identifier: "UTC")!) != nil, s.count == 10 else { throw StoreError("badRequest", "\(name) 要是「2026-11-22」") }
    return s
  }

  func needAccess() throws {
    guard store.status().auth == "full" else { throw StoreError("noAccess", "没有访问提醒事项的权限") }
  }

  func strings(_ v: JSONValue?) throws -> [String] {
    guard let a = v?.array else { throw StoreError("badRequest", "要一个数组") }
    return try a.map {
      guard let s = $0.string else { throw StoreError("badRequest", "数组里要是字") }
      return s
    }
  }

  func need(_ v: JSONValue?, _ name: String) throws -> String {
    guard let s = v?.string, !s.isEmpty else { throw StoreError("badRequest", "没写 \(name)") }
    return s
  }

  func run(_ cmd: String, _ o: [String: JSONValue]) throws -> JSONValue {
    if cmd.hasPrefix("test.") {
      guard let mem = store as? MemoryStore else { throw StoreError("unknown", "测试用的命令只在 --memory 下认") }
      return try mem.test(cmd, o, emit: emit)
    }
    (store as? MemoryStore)?.record(cmd)
    switch cmd {
    case "status":
      return store.status().json()
    case "request":
      return store.requestAccess().json()
    case "lists":
      try needAccess()
      return .object(["lists": .array(try store.lists().map { $0.json() })])
    case "ensureList":
      try needAccess()
      let l = try store.ensureList(title: o["title"]?.string ?? "画布今日")
      return .object(["list": l?.json() ?? .null, "icloud": .bool(l != nil)])
    case "fetch":
      try needAccess()
      let items = try store.fetch(list: try need(o["list"], "list"), rules: false, completed: true)
      return .object(["items": .array(items.map { $0.json(rules: false) })])
    case "read":
      try needAccess()
      let all = try store.lists()
      let completed = o["completed"]?.bool ?? false
      let out: [JSONValue] = try strings(o["lists"]).map { id in
        guard let l = all.first(where: { $0.id == id }) else { throw StoreError("listGone", "没有这个列表：\(id)") }
        let items = try store.fetch(list: id, rules: true, completed: completed)
        return .object(["id": .string(id), "title": .string(l.title), "items": .array(items.map { $0.json(rules: true) })])
      }
      return .object(["lists": .array(out)])
    case "save":
      try needAccess()
      let list = try need(o["list"], "list")
      var created: [String: JSONValue] = [:]
      var missing: [JSONValue] = []
      for c in o["create"]?.array ?? [] {
        guard let key = c.object?["key"]?.string, let f = c.object?["fields"]?.object else { throw StoreError("badRequest", "create 里要 key 和 fields") }
        created[key] = .string(try store.create(list: list, fields: f))
      }
      for u in o["update"]?.array ?? [] {
        guard let rid = u.object?["rid"]?.string, let f = u.object?["fields"]?.object else { throw StoreError("badRequest", "update 里要 rid 和 fields") }
        if try !store.update(rid: rid, fields: f) { missing.append(.string(rid)) }
      }
      try store.commit()
      return .object(["created": .object(created), "missing": .array(missing)])
    case "remove":
      try needAccess()
      let n = try store.remove(rids: try strings(o["rids"]))
      try store.commit()
      return .object(["removed": .int(Int64(n))])
    case "move":
      try needAccess()
      let n = try store.move(rids: try strings(o["rids"]), to: try need(o["list"], "list"))
      try store.commit()
      return .object(["moved": .int(Int64(n))])
    case "calStatus":
      return try calendar().calendarStatus().json()
    case "calRequest":
      return try calendar().requestCalendarAccess().json()
    case "calendars":
      return .object(["calendars": .array(try needCalendar().calendars().map { $0.json() })])
    case "events":
      let c = try needCalendar()
      let from = try day(o["from"], "from")
      let to = try day(o["to"], "to")
      guard from <= to else { throw StoreError("badRequest", "from 要在 to 前面") }
      return .object(["events": .array(try c.events(from: from, to: to).map { $0.json() })])
    default:
      throw StoreError("unknown", "不认识的命令：\(cmd)")
    }
  }
}
