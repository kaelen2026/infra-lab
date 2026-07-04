import Foundation

/// Server service status as the client sees it, derived from probing the API's
/// readiness endpoint (`GET /ready`, which actively checks Postgres + Redis and
/// answers 200 when it can serve, 503 when a backing dependency is down).
enum ServerStatus: Equatable {
    /// Not probed yet — the app shows nothing until the first result lands.
    case unknown
    /// Reachable and ready (HTTP 200): every dependency check passed.
    case online
    /// Reachable but not ready (HTTP 503 / any non-200): a backing dependency is
    /// down, so requests may fail even though the server process is up.
    case degraded
    /// Unreachable: transport failure or a non-HTTP response.
    case offline
}

/// Probes the API's health surface. Health is an ops endpoint, not part of the
/// auth/todo contracts in `@infra/shared`, so this has no cross-client mirror —
/// it is iOS-only, like the timeline feature.
protocol HealthClient {
    /// One readiness probe. Never throws — transport/HTTP failures map to a
    /// ``ServerStatus`` so the caller can render a status instead of an error.
    func probe() async -> ServerStatus
}

/// URLSession-backed probe of `GET /ready`. Unauthenticated: no token is attached,
/// since readiness is public and must work before (and independently of) login.
final class HTTPHealthClient: HealthClient {
    private let baseURL: URL
    private let session: URLSession
    /// Keep the probe short so a hung backend can't stall the status indicator.
    private let timeout: TimeInterval

    init(baseURL: URL, session: URLSession = .shared, timeout: TimeInterval = 5) {
        self.baseURL = baseURL
        self.session = session
        self.timeout = timeout
    }

    func probe() async -> ServerStatus {
        var request = URLRequest(url: baseURL.appendingPathComponent("/ready"))
        request.httpMethod = "GET"
        request.timeoutInterval = timeout

        do {
            let (_, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .offline }
            // /ready answers 200 ready, 503 not-ready; treat any other non-200 as
            // degraded too — the server answered, but not the healthy contract.
            return http.statusCode == 200 ? .online : .degraded
        } catch {
            return .offline
        }
    }
}
