import Foundation

/// Shared HTTP transport for the native Bearer clients (auth / todo / timeline).
/// It attaches the session's access token and, on a `401`, transparently rotates
/// the refresh token (single-flight, via ``SessionRefresher``) and replays the
/// request once. Response decoding and typed error mapping stay in each client —
/// this layer only owns "authorize, and retry once after a refresh".
final class AuthorizedTransport {
    private let store: TokenStore
    private let session: URLSession
    private let refresher: SessionRefresher

    init(store: TokenStore, session: URLSession, refresher: SessionRefresher) {
        self.store = store
        self.session = session
        self.refresher = refresher
    }

    /// Send the request produced by `build` with the current access token attached.
    /// On a `401` (and only when a session was actually sent) rotate the token once
    /// and replay — `build` is a *builder*, not a built request, so the retry picks
    /// up the fresh Authorization header and a fresh body. Throws only connectivity
    /// / bad-response failures; callers inspect the status for typed error mapping.
    func send(_ build: () -> URLRequest) async throws -> (Data, HTTPURLResponse) {
        let sentToken = store.load()?.accessToken
        var (data, http) = try await perform(authorized(build()))

        if http.statusCode == 401, sentToken != nil {
            let refreshed = try? await refresher.refresh(staleAccessToken: sentToken)
            if refreshed != nil {
                (data, http) = try await perform(authorized(build()))
            }
        }
        return (data, http)
    }

    /// Attach `Authorization: <type> <access>` when a session is present.
    private func authorized(_ request: URLRequest) -> URLRequest {
        guard let tokens = store.load() else { return request }
        var request = request
        request.setValue(
            "\(tokens.tokenType) \(tokens.accessToken)", forHTTPHeaderField: "Authorization"
        )
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return (data, http)
    }
}
