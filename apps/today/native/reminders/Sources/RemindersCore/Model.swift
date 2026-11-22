import Foundation

/// 闹钟：at 是本地钟点「2026-11-23T14:00」；offset 是相对到期多少秒（负的是提前）；place 是到某地提醒（只读）
public struct Alarm: Codable, Equatable {
  public var at: String?
  public var offset: Int?
  public var place: String?

  public init(at: String) { self.at = at }
  public init(offset: Int) { self.offset = offset }
  public init(place: String) { self.place = place }

  public func json() -> JSONValue {
    if let at { return .object(["at": .string(at)]) }
    if let place { return .object(["place": .string(place)]) }
    return .object(["offset": .int(Int64(offset ?? 0))])
  }

  public init?(json: JSONValue) {
    guard let o = json.object else { return nil }
    if let at = o["at"]?.string {
      self.at = at
    } else if let off = o["offset"]?.int {
      self.offset = off
    } else if let place = o["place"]?.string {
      self.place = place
    } else {
      return nil
    }
  }
}

/// 重复规则（EKRecurrenceRule 照搬成数据，导入时用；换成 🔁 的规矩在 @cn/tasks 的 rem-import.ts）
public struct RuleDay: Codable, Equatable {
  /// 1 是周日 … 7 是周六（EKWeekday）
  public var day: Int
  /// 0 每周，n 第 n 个，-1 最后一个
  public var week: Int
  public init(day: Int, week: Int) {
    self.day = day
    self.week = week
  }
}

public struct RuleEnd: Codable, Equatable {
  public var date: String?
  public var count: Int?
  public init(date: String? = nil, count: Int? = nil) {
    self.date = date
    self.count = count
  }
}

public struct Rule: Codable, Equatable {
  /// daily、weekly、monthly、yearly
  public var freq: String
  public var interval: Int
  public var days: [RuleDay]?
  public var monthDays: [Int]?
  public var months: [Int]?
  public var setPositions: [Int]?
  public var end: RuleEnd?

  public init(freq: String, interval: Int, days: [RuleDay]? = nil, monthDays: [Int]? = nil, months: [Int]? = nil, setPositions: [Int]? = nil, end: RuleEnd? = nil) {
    self.freq = freq
    self.interval = interval
    self.days = days
    self.monthDays = monthDays
    self.months = months
    self.setPositions = setPositions
    self.end = end
  }

  public func json() -> JSONValue { JSONValue.from(self) }
}

/// 提醒事项里的一条（回答里一律把每一项都写出来，没有的写 null）
public struct Item: Codable, Equatable {
  public var rid: String
  public var title: String
  public var notes: String?
  public var url: String?
  /// 「2026-11-23 15:00」或「2026-11-23」
  public var due: String?
  public var completed: Bool
  /// 本地钟点「2026-11-23T15:02」
  public var completedAt: String?
  public var priority: Int
  public var alarms: [Alarm]
  public var rules: [Rule]?
  /// 建的、最后改的时候（毫秒）
  public var created: Int64
  public var modified: Int64
  /// 在哪个列表（calendarIdentifier）
  public var list: String?

  public init(
    rid: String, title: String, notes: String? = nil, url: String? = nil, due: String? = nil, completed: Bool, completedAt: String? = nil, priority: Int, alarms: [Alarm], rules: [Rule]? = nil,
    created: Int64, modified: Int64, list: String? = nil
  ) {
    self.rid = rid
    self.title = title
    self.notes = notes
    self.url = url
    self.due = due
    self.completed = completed
    self.completedAt = completedAt
    self.priority = priority
    self.alarms = alarms
    self.rules = rules
    self.created = created
    self.modified = modified
    self.list = list
  }

  /// 存档里少写了的项用默认的（e2e 写种子时只写要的几项）
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    rid = try c.decode(String.self, forKey: .rid)
    title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
    notes = try c.decodeIfPresent(String.self, forKey: .notes)
    url = try c.decodeIfPresent(String.self, forKey: .url)
    due = try c.decodeIfPresent(String.self, forKey: .due)
    completed = try c.decodeIfPresent(Bool.self, forKey: .completed) ?? false
    completedAt = try c.decodeIfPresent(String.self, forKey: .completedAt)
    priority = try c.decodeIfPresent(Int.self, forKey: .priority) ?? 0
    alarms = try c.decodeIfPresent([Alarm].self, forKey: .alarms) ?? []
    rules = try c.decodeIfPresent([Rule].self, forKey: .rules)
    created = try c.decodeIfPresent(Int64.self, forKey: .created) ?? 0
    modified = try c.decodeIfPresent(Int64.self, forKey: .modified) ?? 0
    list = try c.decodeIfPresent(String.self, forKey: .list)
  }

  public func json(rules withRules: Bool) -> JSONValue {
    .object([
      "rid": .string(rid),
      "title": .string(title),
      "notes": .opt(notes),
      "url": .opt(url),
      "due": .opt(due),
      "completed": .bool(completed),
      "completedAt": .opt(completedAt),
      "priority": .int(Int64(priority)),
      "alarms": .array(alarms.map { $0.json() }),
      "rules": .array(withRules ? (rules ?? []).map { $0.json() } : []),
      "created": .int(created),
      "modified": .int(modified),
    ])
  }
}

/// 一个提醒事项列表
public struct ListInfo: Equatable {
  public var id: String
  public var title: String
  /// 账户名（iCloud、在我的 Mac 上…）
  public var source: String
  public var icloud: Bool
  /// 列表的颜色「#FF9500」
  public var color: String?
  /// 没做完、已完成几条
  public var open: Int
  public var done: Int
  public var writable: Bool

  public init(id: String, title: String, source: String, icloud: Bool, color: String?, open: Int, done: Int, writable: Bool) {
    self.id = id
    self.title = title
    self.source = source
    self.icloud = icloud
    self.color = color
    self.open = open
    self.done = done
    self.writable = writable
  }

  public func json() -> JSONValue {
    .object([
      "id": .string(id), "title": .string(title), "source": .string(source), "icloud": .bool(icloud), "color": .opt(color),
      "open": .int(Int64(open)), "done": .int(Int64(done)), "writable": .bool(writable),
    ])
  }
}

/// 授权和账户：auth 是 notDetermined、denied、restricted、full、writeOnly；icloud 是有没有开 iCloud 提醒事项（没授权时不知道，是 nil）
public struct Status: Equatable {
  public var auth: String
  public var icloud: Bool?
  /// eventkit（真的）或 memory（测试用的假提醒事项）
  public var mode: String

  public init(auth: String, icloud: Bool?, mode: String) {
    self.auth = auth
    self.icloud = icloud
    self.mode = mode
  }

  public func json() -> JSONValue {
    .object(["auth": .string(auth), "icloud": icloud.map { .bool($0) } ?? .null, "mode": .string(mode)])
  }
}

/// 说不成的原因：code 给主进程认（noAccess 没权限、listGone 列表不在了、badRequest 请求不对、unknown 不认识的命令）
public struct StoreError: Error {
  public var code: String
  public var message: String
  public init(_ code: String, _ message: String) {
    self.code = code
    self.message = message
  }
}
