import Foundation

/// Date + platform formatting for the account/todo screens — the Swift
/// counterpart of web's `lib/format.ts`. Renders ISO 8601 timestamps in local
/// time with a stable, mono-friendly width.
enum Format {
    /// Parses the server's ISO 8601 timestamps (with or without fractional seconds).
    private static func parse(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: iso) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: iso)
    }

    private static func components(_ iso: String) -> DateComponents? {
        guard let date = parse(iso) else { return nil }
        return Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute], from: date
        )
    }

    private static func pad(_ value: Int) -> String { String(format: "%02d", value) }

    /// `YYYY-MM-DD` in local time.
    static func date(_ iso: String) -> String {
        guard let comps = components(iso), let year = comps.year, let month = comps.month,
              let day = comps.day else { return iso }
        return "\(year)-\(pad(month))-\(pad(day))"
    }

    /// `YYYY-MM-DD HH:mm` in local time, stable width for mono columns.
    static func dateTime(_ iso: String) -> String {
        guard let comps = components(iso), let year = comps.year, let month = comps.month,
              let day = comps.day, let hour = comps.hour, let minute = comps.minute else { return iso }
        return "\(year)-\(pad(month))-\(pad(day)) \(pad(hour)):\(pad(minute))"
    }

    /// Feed-style relative time: recency in plain words while it matters
    /// (刚刚 / N 分钟前 / N 小时前), calendar date once it doesn't. Mirrors
    /// web's `formatRelativeTime` so both feeds read the same.
    static func relative(_ iso: String, now: Date = Date()) -> String {
        guard let date = parse(iso) else { return iso }
        let calendar = Calendar.current
        let minutes = Int(now.timeIntervalSince(date) / 60)
        if minutes < 1 { return "刚刚" }
        if minutes < 60 { return "\(minutes) 分钟前" }
        if calendar.isDate(date, inSameDayAs: now) { return "\(minutes / 60) 小时前" }
        let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        guard let year = comps.year, let month = comps.month, let day = comps.day,
              let hour = comps.hour, let minute = comps.minute else { return iso }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "昨天 \(pad(hour)):\(pad(minute))"
        }
        if year == calendar.component(.year, from: now) { return "\(month)月\(day)日" }
        return "\(year)年\(month)月\(day)日"
    }

    /// Privacy-masked phone for display: keep the first 3 and last 4 digits,
    /// hide the middle (e.g. `138****8000`). Works on the national number — a
    /// leading `+` and, for the primary market, a `+86` country code are dropped
    /// first so a CN number reads naturally. Falls back to the raw value when it's
    /// too short to mask meaningfully.
    static func maskedPhone(_ phone: String) -> String {
        var digits = phone.hasPrefix("+") ? String(phone.dropFirst()) : phone
        // Strip the CN country code so 11-digit mobiles render as 138****8000.
        if digits.hasPrefix("86"), digits.count > 9 {
            digits = String(digits.dropFirst(2))
        }
        guard digits.count >= 7, digits.allSatisfy(\.isNumber) else { return phone }
        return "\(digits.prefix(3))****\(digits.suffix(4))"
    }

    static func platformLabel(_ platform: Platform) -> String {
        switch platform {
        case .web: return "Web"
        case .ios: return "iOS"
        case .android: return "Android"
        case .harmony: return "HarmonyOS"
        }
    }
}
