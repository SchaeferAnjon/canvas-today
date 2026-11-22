import Foundation
import XCTest

@testable import RemindersCore

/// 小助手说话的规矩：一行一个请求进来，一行一个回答出去；用内存里的假提醒事项（MemoryStore）测，不碰 EventKit
final class ServerTests: XCTestCase {
  var dir: URL!
  var lines: [String] = []
  var server: Server!
  var mem: MemoryStore!

  override func setUpWithError() throws {
    dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-rem-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    mem = MemoryStore(path: dir.appendingPathComponent("rem.json").path, now: { 1_795_300_000_000 })
    lines = []
    server = Server(store: mem, emit: { [unowned self] in self.lines.append($0) })
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: dir)
  }

  /// 发一个请求，拿回答（result 或 error）
  @discardableResult
  func ask(_ obj: [String: Any]) throws -> [String: Any] {
    let data = try JSONSerialization.data(withJSONObject: obj)
    let before = lines.count
    server.handle(String(data: data, encoding: .utf8)!)
    let answers = lines[before...].compactMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String: Any] }.filter { $0["id"] != nil }
    XCTAssertEqual(answers.count, 1, "一个请求一个回答：\(lines[before...])")
    return answers[0]
  }

  func result(_ obj: [String: Any]) throws -> [String: Any] {
    let a = try ask(obj)
    XCTAssertEqual(a["ok"] as? Bool, true, "没成：\(a)")
    return a["result"] as? [String: Any] ?? [:]
  }

  func connect() throws -> String {
    _ = try result(["id": 1, "cmd": "request"])
    let r = try result(["id": 2, "cmd": "ensureList", "title": "画布今日"])
    return (r["list"] as! [String: Any])["id"] as! String
  }

  func testStatusThenAskOnce() throws {
    var s = try result(["id": 1, "cmd": "status"])
    XCTAssertEqual(s["auth"] as? String, "notDetermined")
    XCTAssertEqual(s["mode"] as? String, "memory")
    s = try result(["id": 2, "cmd": "request"])
    XCTAssertEqual(s["auth"] as? String, "full")
    XCTAssertEqual(s["icloud"] as? Bool, true)
    XCTAssertEqual(mem.state.calls.filter { $0 == "request" }.count, 1)
  }

  func testDeniedStaysDenied() throws {
    mem.state.denyRequest = true
    let s = try result(["id": 1, "cmd": "request"])
    XCTAssertEqual(s["auth"] as? String, "denied")
    let e = try ask(["id": 2, "cmd": "fetch", "list": "x"])
    XCTAssertEqual(e["ok"] as? Bool, false)
    XCTAssertEqual(e["code"] as? String, "noAccess")
  }

  func testEnsureListOnceInICloud() throws {
    let id = try connect()
    let again = try result(["id": 3, "cmd": "ensureList", "title": "画布今日"])
    XCTAssertEqual((again["list"] as! [String: Any])["id"] as? String, id)
    XCTAssertEqual(mem.state.lists.filter { $0.title == "画布今日" }.count, 1)
    XCTAssertEqual(mem.state.lists.first { $0.id == id }?.icloud, true)
  }

  func testNoICloudNoList() throws {
    mem.state.icloud = false
    _ = try result(["id": 1, "cmd": "request"])
    let r = try result(["id": 2, "cmd": "ensureList", "title": "画布今日"])
    XCTAssertTrue(r["list"] is NSNull)
    XCTAssertEqual(r["icloud"] as? Bool, false)
    XCTAssertTrue(mem.state.lists.isEmpty, "没开 iCloud 提醒事项：不在本机建")
  }

  func testCreateFetchUpdateRemove() throws {
    let list = try connect()
    let fields: [String: Any] = [
      "title": "交论文初稿", "due": "2026-11-23 15:00", "completed": false, "priority": 1,
      "alarms": [["offset": -3600]], "notes": "来自《小论文计划》· 写作", "url": "canvas-today://task/a1b2c3",
    ]
    let saved = try result(["id": 3, "cmd": "save", "list": list, "create": [["key": "a1b2c3", "fields": fields]]])
    let rid = (saved["created"] as! [String: String])["a1b2c3"]!
    var items = try result(["id": 4, "cmd": "fetch", "list": list])["items"] as! [[String: Any]]
    XCTAssertEqual(items.count, 1)
    XCTAssertEqual(items[0]["rid"] as? String, rid)
    XCTAssertEqual(items[0]["title"] as? String, "交论文初稿")
    XCTAssertEqual(items[0]["due"] as? String, "2026-11-23 15:00")
    XCTAssertEqual(items[0]["priority"] as? Int, 1)
    XCTAssertEqual(items[0]["url"] as? String, "canvas-today://task/a1b2c3")
    XCTAssertEqual(items[0]["alarms"] as? [[String: Int]], [["offset": -3600]])
    XCTAssertEqual(items[0]["completed"] as? Bool, false)
    XCTAssertEqual(items[0]["created"] as? Int, 1_795_300_000_000)

    // 只改给了的那几样；due 给 null 是拿掉
    _ = try result(["id": 5, "cmd": "save", "list": list, "update": [["rid": rid, "fields": ["title": "交论文初稿（二）", "due": NSNull(), "completed": true]]]])
    items = try result(["id": 6, "cmd": "fetch", "list": list])["items"] as! [[String: Any]]
    XCTAssertEqual(items[0]["title"] as? String, "交论文初稿（二）")
    XCTAssertTrue(items[0]["due"] == nil || items[0]["due"] is NSNull)
    XCTAssertEqual(items[0]["completed"] as? Bool, true)
    XCTAssertNotNil(items[0]["completedAt"] as? String)
    XCTAssertEqual(items[0]["priority"] as? Int, 1, "没给的不动")
    XCTAssertEqual(items[0]["notes"] as? String, "来自《小论文计划》· 写作")

    // 找不到的 rid：说出来，不报错
    let miss = try result(["id": 7, "cmd": "save", "list": list, "update": [["rid": "nope", "fields": ["title": "x"]]]])
    XCTAssertEqual(miss["missing"] as? [String], ["nope"])

    let rm = try result(["id": 8, "cmd": "remove", "rids": [rid, "nope"]])
    XCTAssertEqual(rm["removed"] as? Int, 1)
    items = try result(["id": 9, "cmd": "fetch", "list": list])["items"] as! [[String: Any]]
    XCTAssertTrue(items.isEmpty)
  }

  func testFetchGoneList() throws {
    _ = try connect()
    let e = try ask(["id": 3, "cmd": "fetch", "list": "没有这个"])
    XCTAssertEqual(e["ok"] as? Bool, false)
    XCTAssertEqual(e["code"] as? String, "listGone")
  }

  func testListsWithCountsAndReadForImport() throws {
    _ = try connect()
    mem.state.lists.append(MemList(id: "L1", title: "购物", icloud: true, color: "#FF9500"))
    mem.state.items.append(Item(rid: "i1", title: "牛奶", completed: false, priority: 0, alarms: [], created: 1, modified: 1, list: "L1"))
    mem.state.items.append(Item(rid: "i2", title: "面包", completed: true, completedAt: "2026-11-20T08:00", priority: 0, alarms: [], created: 2, modified: 2, list: "L1"))
    mem.state.items.append(
      Item(rid: "i3", title: "交水电费", due: "2026-11-25", completed: false, priority: 5, alarms: [Alarm(place: "家")], rules: [Rule(freq: "monthly", interval: 1, monthDays: [25])], created: 3, modified: 3, list: "L1"))
    let lists = try result(["id": 3, "cmd": "lists"])["lists"] as! [[String: Any]]
    let shop = lists.first { $0["title"] as? String == "购物" }!
    XCTAssertEqual(shop["open"] as? Int, 2)
    XCTAssertEqual(shop["done"] as? Int, 1)
    XCTAssertEqual(shop["color"] as? String, "#FF9500")
    var read = try result(["id": 4, "cmd": "read", "lists": ["L1"], "completed": false])["lists"] as! [[String: Any]]
    var items = read[0]["items"] as! [[String: Any]]
    XCTAssertEqual(items.map { $0["title"] as! String }.sorted(), ["交水电费", "牛奶"])
    let bill = items.first { $0["title"] as? String == "交水电费" }!
    XCTAssertEqual((bill["rules"] as! [[String: Any]])[0]["monthDays"] as? [Int], [25])
    XCTAssertEqual(bill["alarms"] as? [[String: String]], [["place": "家"]])
    read = try result(["id": 5, "cmd": "read", "lists": ["L1"], "completed": true])["lists"] as! [[String: Any]]
    items = read[0]["items"] as! [[String: Any]]
    XCTAssertEqual(items.count, 3)
  }

  func testMoveToAnotherList() throws {
    let list = try connect()
    mem.state.lists.append(MemList(id: "L2", title: "提醒", icloud: true, color: nil))
    let saved = try result(["id": 3, "cmd": "save", "list": list, "create": [["key": "k", "fields": ["title": "甲", "url": "canvas-today://task/k"]]]])
    let rid = (saved["created"] as! [String: String])["k"]!
    XCTAssertEqual(try result(["id": 4, "cmd": "move", "rids": [rid], "list": "L2"])["moved"] as? Int, 1)
    XCTAssertTrue((try result(["id": 5, "cmd": "fetch", "list": list])["items"] as! [Any]).isEmpty)
    XCTAssertEqual((try result(["id": 6, "cmd": "fetch", "list": "L2"])["items"] as! [Any]).count, 1)
  }

  func testOutsideChangeTellsTheApp() throws {
    let list = try connect()
    let saved = try result(["id": 3, "cmd": "save", "list": list, "create": [["key": "a1b2c3", "fields": ["title": "交论文初稿", "url": "canvas-today://task/a1b2c3"]]]])
    XCTAssertFalse(lines.contains { $0.contains("\"event\"") }, "自己存的不算外面改的")
    let rid = (saved["created"] as! [String: String])["a1b2c3"]!
    // 像在提醒事项 App 里勾掉：那一条变完成，发一行 {"event":"changed"}
    _ = try result(["id": 4, "cmd": "test.external", "op": "complete", "task": "a1b2c3", "at": "2026-11-23T15:02"])
    XCTAssertTrue(lines.contains("{\"event\":\"changed\"}"))
    let item = mem.state.items.first { $0.rid == rid }!
    XCTAssertTrue(item.completed)
    XCTAssertEqual(item.completedAt, "2026-11-23T15:02")
    _ = try result(["id": 5, "cmd": "test.external", "op": "setDue", "task": "a1b2c3", "due": "2026-11-24 17:30"])
    XCTAssertEqual(mem.state.items.first { $0.rid == rid }?.due, "2026-11-24 17:30")
    _ = try result(["id": 6, "cmd": "test.external", "op": "setTitle", "task": "a1b2c3", "title": "新名字"])
    XCTAssertEqual(mem.state.items.first { $0.rid == rid }?.title, "新名字")
    _ = try result(["id": 7, "cmd": "test.external", "op": "delete", "task": "a1b2c3"])
    XCTAssertNil(mem.state.items.first { $0.rid == rid })
  }

  func testRecorderAndPersistence() throws {
    let list = try connect()
    _ = try result(["id": 3, "cmd": "save", "list": list, "create": [["key": "k", "fields": ["title": "甲"]]]])
    XCTAssertEqual(mem.state.calls, ["request", "ensureList", "save"])
    // 再开一次（软件重开）：还是那些
    let again = MemoryStore(path: dir.appendingPathComponent("rem.json").path, now: { 0 })
    XCTAssertEqual(again.state.items.map(\.title), ["甲"])
    XCTAssertEqual(again.state.auth, "full")
  }

  func testBadInput() throws {
    server.handle("不是 JSON")
    XCTAssertTrue(lines.last!.contains("\"ok\":false"))
    let e = try ask(["id": 9, "cmd": "飞"])
    XCTAssertEqual(e["ok"] as? Bool, false)
  }

  func testTestCommandsOnlyInMemoryMode() throws {
    final class Fake: ReminderStore {
      var mode: String { "eventkit" }
      func status() -> Status { Status(auth: "full", icloud: true, mode: mode) }
      func requestAccess() -> Status { status() }
      func lists() throws -> [ListInfo] { [] }
      func ensureList(title: String) throws -> ListInfo? { nil }
      func fetch(list: String, rules: Bool, completed: Bool) throws -> [Item] { [] }
      func create(list: String, fields: [String: JSONValue]) throws -> String { "" }
      func update(rid: String, fields: [String: JSONValue]) throws -> Bool { false }
      func remove(rids: [String]) throws -> Int { 0 }
      func move(rids: [String], to list: String) throws -> Int { 0 }
      func commit() throws {}
    }
    let s = Server(store: Fake(), emit: { [unowned self] in self.lines.append($0) })
    s.handle("{\"id\":1,\"cmd\":\"test.dump\"}")
    XCTAssertTrue(lines.last!.contains("\"ok\":false"), "真的 EventKit 不认测试用的命令：\(lines.last!)")
  }
}
