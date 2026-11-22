import Foundation
import XCTest

@testable import RemindersCore

/// 到期（📅 日子和钟点）、闹钟钟点和 EventKit 的 DateComponents / Date 怎么换：一律是这台设备的本地钟点
final class DatesTests: XCTestCase {
  let berlin = TimeZone(identifier: "Europe/Berlin")!
  let ny = TimeZone(identifier: "America/New_York")!

  func testDateOnly() {
    let c = Dates.dueComponents("2026-11-23", tz: berlin)!
    XCTAssertEqual([c.year, c.month, c.day], [2026, 11, 23])
    XCTAssertNil(c.hour)
    XCTAssertNil(c.timeZone, "只有日子的是全天，不带时区")
    XCTAssertEqual(Dates.dueString(c, tz: berlin), "2026-11-23")
  }

  func testWithTime() {
    let c = Dates.dueComponents("2026-11-23 15:00", tz: berlin)!
    XCTAssertEqual([c.hour, c.minute], [15, 0])
    XCTAssertEqual(c.timeZone, berlin, "带钟点的照提醒事项 App 自己的做法带上本机时区")
    XCTAssertEqual(Dates.dueString(c, tz: berlin), "2026-11-23 15:00")
  }

  func testOtherZoneReadAsLocal() {
    var c = DateComponents(year: 2026, month: 11, day: 23, hour: 9, minute: 0)
    c.timeZone = ny
    XCTAssertEqual(Dates.dueString(c, tz: berlin), "2026-11-23 15:00", "纽约 9 点在柏林是 15 点")
    let floating = DateComponents(year: 2026, month: 11, day: 23, hour: 9, minute: 5)
    XCTAssertEqual(Dates.dueString(floating, tz: berlin), "2026-11-23 09:05", "不带时区的照写")
  }

  func testBadDue() {
    XCTAssertNil(Dates.dueComponents("明天", tz: berlin))
    XCTAssertNil(Dates.dueComponents("2026-13-40", tz: berlin))
    XCTAssertNil(Dates.dueString(DateComponents(), tz: berlin))
  }

  func testAlarmClock() {
    let d = Dates.date(local: "2026-11-23T14:00", tz: berlin)!
    XCTAssertEqual(d.timeIntervalSince1970, 1_795_438_800)
    XCTAssertEqual(Dates.local(d, tz: berlin), "2026-11-23T14:00")
    XCTAssertEqual(Dates.local(d, tz: ny), "2026-11-23T08:00")
    XCTAssertNil(Dates.date(local: "2026-11-23 14:00", tz: berlin))
  }
}
