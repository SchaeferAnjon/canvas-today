import Foundation

/// 读写提醒事项的那一层：真的是 EventKit（EKStore，在可执行文件那个 target 里），测试和 --memory 是 MemoryStore。
/// 都是同步的（EKStore 里等 EventKit 的回调），Server 在自己的队列上一个一个做。
public protocol ReminderStore: AnyObject {
  /// eventkit 或 memory
  var mode: String { get }
  func status() -> Status
  /// 第一次时系统问一次（之后不再问，返回现在的样子）
  func requestAccess() -> Status
  func lists() throws -> [ListInfo]
  /// 在 iCloud 账户下找这个名字的列表，没有就建；没开 iCloud 提醒事项时返回 nil（不在本机建）
  func ensureList(title: String) throws -> ListInfo?
  /// 一个列表里的；rules：带上重复规则（导入用）；completed：带上已完成的
  func fetch(list: String, rules: Bool, completed: Bool) throws -> [Item]
  /// 新建一条，返回它的 rid（calendarItemIdentifier）
  func create(list: String, fields: [String: JSONValue]) throws -> String
  /// 只改给了的那几项；找不到这一条返回 false
  func update(rid: String, fields: [String: JSONValue]) throws -> Bool
  func remove(rids: [String]) throws -> Int
  func move(rids: [String], to list: String) throws -> Int
  /// 一批改完一起存（EventKit 的 commit）
  func commit() throws
}

/// 系统日历（只读）：画布今日的日历里画日程（task-ykkoz）。真的是 EKStore，测试和 --memory 是 MemoryStore；
/// 别的只认提醒事项的 store（测试里的假的）不认日历的命令
public protocol CalendarStore: AnyObject {
  /// 日历的授权（不弹窗）：notDetermined、denied、restricted、full、writeOnly
  func calendarStatus() -> Status
  /// 第一次时系统问一次（「允许完全访问」）
  func requestCalendarAccess() -> Status
  func calendars() throws -> [CalInfo]
  /// from、to 是本地日子「2026-11-22」（都含）
  func events(from: String, to: String) throws -> [EventItem]
}
