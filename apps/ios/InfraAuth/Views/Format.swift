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

    static func platformLabel(_ platform: Platform) -> String {
        switch platform {
        case .web: return "Web"
        case .ios: return "iOS"
        case .android: return "Android"
        case .harmony: return "HarmonyOS"
        }
    }
}
