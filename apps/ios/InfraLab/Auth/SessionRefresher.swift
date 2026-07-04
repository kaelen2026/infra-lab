import Foundation

/// Coordinates refresh-token rotation shared by every authorized client
/// (auth / todo / timeline). The native access token is a 15-minute JWT; when a
/// request comes back `401` the transport asks this refresher to rotate the
/// token and then retries once.
///
/// Because the three clients share one ``TokenStore`` **and** the refresh token
/// rotates on every use (the server revokes the old one), two concurrent
/// refreshes would invalidate each other. This actor collapses them into a single
/// in-flight rotation: late callers either join the running refresh or, if a peer
/// already rotated past the token that failed, reuse the fresh one without a
/// second round-trip.
actor SessionRefresher {
    /// Rotates the stored refresh token over the wire, persists the result and
    /// returns it (nil when there is no session to refresh). Injected so the
    /// refresher stays free of URL/route knowledge and tests stay hermetic.
    typealias Rotate = @Sendable () async throws -> AuthTokens?

    private let store: TokenStore
    private let rotate: Rotate
    private var inFlight: Task<AuthTokens?, Error>?

    init(store: TokenStore, rotate: @escaping Rotate) {
        self.store = store
        self.rotate = rotate
    }

    /// Refresh the session relative to `staleAccessToken` — the access token that
    /// just produced a `401`. If another caller already rotated past it, return
    /// the current tokens directly; otherwise run (or join) the one in-flight
    /// rotation.
    func refresh(staleAccessToken: String?) async throws -> AuthTokens? {
        if let current = store.load(), current.accessToken != staleAccessToken {
            return current
        }
        if let inFlight {
            return try await inFlight.value
        }

        let rotate = self.rotate
        let task = Task { try await rotate() }
        inFlight = task
        defer { inFlight = nil }
        return try await task.value
    }
}

/// Direct, non-retrying refresh-token rotation. Kept off ``AuthorizedTransport``
/// (which retries on `401`) so a failed refresh can never recurse into another
/// refresh. Used by ``SessionRefresher`` and mirrors the web SDK's `/auth/refresh`.
enum AuthSession {
    static func rotateTokens(
        baseURL: URL, store: TokenStore, session: URLSession
    ) async throws -> AuthTokens? {
        guard let current = store.load() else { return nil }

        var request = URLRequest(url: baseURL.appendingPathComponent(AuthRoutes.refresh))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RefreshInput(refreshToken: current.refreshToken))

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw AuthClientError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw AuthClientError.transport(URLError(.badServerResponse))
        }
        guard (200..<300).contains(http.statusCode) else {
            let parsed = try? JSONDecoder().decode(AuthErrorBody.self, from: data)
            throw AuthClientError.http(
                status: http.statusCode, code: parsed?.code ?? .unknown,
                message: parsed?.message, retryAfter: parsed?.retryAfter,
                remainingAttempts: parsed?.remainingAttempts
            )
        }

        let decoded = try JSONDecoder().decode(RefreshResponse.self, from: data)
        store.save(decoded.tokens)
        return decoded.tokens
    }
}
