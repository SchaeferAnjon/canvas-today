import Foundation

/// 一行 JSON 里的任意值：分得清「没给」和「给了 null」（改一条时 due: null 是拿掉到期，没给是不动）
public enum JSONValue: Codable, Equatable {
  case null
  case bool(Bool)
  case int(Int64)
  case double(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let b = try? c.decode(Bool.self) {
      self = .bool(b)
    } else if let i = try? c.decode(Int64.self) {
      self = .int(i)
    } else if let d = try? c.decode(Double.self) {
      self = .double(d)
    } else if let s = try? c.decode(String.self) {
      self = .string(s)
    } else if let a = try? c.decode([JSONValue].self) {
      self = .array(a)
    } else {
      self = .object(try c.decode([String: JSONValue].self))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let b): try c.encode(b)
    case .int(let i): try c.encode(i)
    case .double(let d): try c.encode(d)
    case .string(let s): try c.encode(s)
    case .array(let a): try c.encode(a)
    case .object(let o): try c.encode(o)
    }
  }

  public var string: String? { if case .string(let s) = self { return s } else { return nil } }
  public var bool: Bool? { if case .bool(let b) = self { return b } else { return nil } }
  public var array: [JSONValue]? { if case .array(let a) = self { return a } else { return nil } }
  public var object: [String: JSONValue]? { if case .object(let o) = self { return o } else { return nil } }
  public var isNull: Bool { self == .null }
  public var int: Int? {
    switch self {
    case .int(let i): return Int(i)
    case .double(let d) where d.rounded() == d: return Int(d)
    default: return nil
    }
  }

  public static func opt(_ s: String?) -> JSONValue { s.map { .string($0) } ?? .null }

  /// 编成一行（网址里的斜杠不转义）
  public func line() -> String {
    let e = JSONEncoder()
    e.outputFormatting = [.withoutEscapingSlashes]
    return String(decoding: (try? e.encode(self)) ?? Data("null".utf8), as: UTF8.self)
  }

  public static func parse(_ text: String) -> JSONValue? {
    try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
  }

  /// 能编码的值（存档的 MemState）换成 JSONValue
  public static func from<T: Encodable>(_ v: T) -> JSONValue {
    guard let data = try? JSONEncoder().encode(v), let j = try? JSONDecoder().decode(JSONValue.self, from: data) else { return .null }
    return j
  }
}
