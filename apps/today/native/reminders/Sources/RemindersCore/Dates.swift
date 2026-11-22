import Foundation

/// 到期、闹钟钟点和 EventKit 的 DateComponents / Date 互换。库里写的是本地钟点（不带时区），一律按这台设备的时区算
public enum Dates {
  static func cal(_ tz: TimeZone) -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = tz
    return c
  }

  private static let dueRe = try! NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})(?: (\d{1,2}):(\d{2}))?$"#)
  private static let localRe = try! NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$"#)

  private static func groups(_ re: NSRegularExpression, _ s: String) -> [Int?]? {
    let ns = s as NSString
    guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
    return (1..<m.numberOfRanges).map { i in
      let r = m.range(at: i)
      return r.location == NSNotFound ? nil : Int(ns.substring(with: r))
    }
  }

  private static func validDay(_ y: Int, _ m: Int, _ d: Int) -> Bool {
    guard (1...12).contains(m), d >= 1 else { return false }
    let c = cal(TimeZone(identifier: "UTC")!)
    guard let first = c.date(from: DateComponents(year: y, month: m, day: 1)), let range = c.range(of: .day, in: .month, for: first) else { return false }
    return range.contains(d)
  }

  /// 「2026-11-23」→ 全天（只有年月日、不带时区）；「2026-11-23 15:00」→ 带钟点和本机时区（提醒事项 App 自己建的也这样）
  public static func dueComponents(_ s: String, tz: TimeZone) -> DateComponents? {
    guard let g = groups(dueRe, s.trimmingCharacters(in: .whitespaces)), let y = g[0], let m = g[1], let d = g[2], validDay(y, m, d) else { return nil }
    var c = DateComponents(year: y, month: m, day: d)
    if let h = g[3], let mi = g[4] {
      guard h < 24, mi < 60 else { return nil }
      c.hour = h
      c.minute = mi
      c.timeZone = tz
    }
    return c
  }

  /// 反过来：带了别的时区的换成本机的钟点；不带时区的（浮动的）照写
  public static func dueString(_ c: DateComponents, tz: TimeZone) -> String? {
    guard var y = c.year, var m = c.month, var d = c.day else { return nil }
    guard var h = c.hour else { return String(format: "%04d-%02d-%02d", y, m, d) }
    var mi = c.minute ?? 0
    if let ctz = c.timeZone, ctz != tz, let at = cal(ctz).date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: mi)) {
      let l = cal(tz).dateComponents([.year, .month, .day, .hour, .minute], from: at)
      y = l.year!
      m = l.month!
      d = l.day!
      h = l.hour!
      mi = l.minute!
    }
    return String(format: "%04d-%02d-%02d %02d:%02d", y, m, d, h, mi)
  }

  /// 本地钟点「2026-11-23T14:00」→ Date
  public static func date(local s: String, tz: TimeZone) -> Date? {
    guard let g = groups(localRe, s), let y = g[0], let m = g[1], let d = g[2], let h = g[3], let mi = g[4], validDay(y, m, d), h < 24, mi < 60 else { return nil }
    return cal(tz).date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: mi))
  }

  /// Date → 本地钟点「2026-11-23T14:00」
  public static func local(_ date: Date, tz: TimeZone) -> String {
    let c = cal(tz).dateComponents([.year, .month, .day, .hour, .minute], from: date)
    return String(format: "%04d-%02d-%02dT%02d:%02d", c.year!, c.month!, c.day!, c.hour!, c.minute!)
  }

  public static func ms(_ date: Date?) -> Int64 {
    guard let date else { return 0 }
    return Int64((date.timeIntervalSince1970 * 1000).rounded())
  }
}
