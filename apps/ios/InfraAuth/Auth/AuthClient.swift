import Foundation

/// The shape every platform SDK implements. iOS transport: URLSession +
/// Keychain; `Authorization: Bearer <accessToken>` on protected requests.
/// Mirrors the `AuthClient` interface in `@infra/shared`.
protocol AuthClient {
    func requestOtp(phone: String) async throws -> RequestOtpResponse
    func verifyOtp(phone: String, code: String, device: DeviceInfo?) async throws -> VerifyOtpResponse
    /// Reads the Keychain refresh token and rotates it; nil when none is stored.
    func refresh() async throws -> AuthTokens?
    func me() async throws -> AuthUser
    /// Registered client installs for the current user (account dashboard).
    func listDevices() async throws -> [DeviceDTO]
    /// Recent OTP verification attempts for the current user (account dashboard).
    func listLoginEvents() async throws -> [LoginEventDTO]
    func logout() async throws
}

/// URLSession-backed client. On `verifyOtp`/`refresh` it persists the rotated
/// tokens to the injected ``TokenStore``; `logout` clears them.
final class HTTPAuthClient: AuthClient {
    private let baseURL: URL
    private let platform: Platform
    private let store: TokenStore
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL, platform: Platform = .ios, store: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.platform = platform
        self.store = store
        self.session = session
    }

    // MARK: AuthClient

    func requestOtp(phone: String) async throws -> RequestOtpResponse {
        try await send(AuthRoutes.requestOtp, method: "POST",
                       body: RequestOtpInput(phone: phone, platform: platform))
    }

    func verifyOtp(phone: String, code: String, device: DeviceInfo?) async throws -> VerifyOtpResponse {
        let input = VerifyOtpInput(phone: phone, code: code, platform: platform, device: device)
        let res: VerifyOtpResponse = try await send(AuthRoutes.verifyOtp, method: "POST", body: input)
        if let tokens = res.tokens { store.save(tokens) }
        return res
    }

    func refresh() async throws -> AuthTokens? {
        guard let current = store.load() else { return nil }
        let res: RefreshResponse = try await send(AuthRoutes.refresh, method: "POST",
                                                   body: RefreshInput(refreshToken: current.refreshToken))
        store.save(res.tokens)
        return res.tokens
    }

    func me() async throws -> AuthUser {
        let res: MeResponse = try await send(AuthRoutes.me, method: "GET", body: Optional<RefreshInput>.none)
        return res.user
    }

    func listDevices() async throws -> [DeviceDTO] {
        let res: DevicesResponse = try await send(AuthRoutes.devices, method: "GET",
                                                  body: Optional<RefreshInput>.none)
        return res.devices
    }

    func listLoginEvents() async throws -> [LoginEventDTO] {
        let res: LoginEventsResponse = try await send(AuthRoutes.loginEvents, method: "GET",
                                                      body: Optional<RefreshInput>.none)
        return res.events
    }

    func logout() async throws {
        struct Empty: Encodable {}
        let _: OkResponse = try await send(AuthRoutes.logout, method: "POST", body: Empty())
        store.clear()
    }

    // MARK: - Transport

    private struct OkResponse: Decodable { let ok: Bool }

    private func send<Body: Encodable, Response: Decodable>(
        _ path: String, method: String, body: Body?
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Native sessions ride the Bearer header; attach it when we have a token.
        if let tokens = store.load() {
            request.setValue("\(tokens.tokenType) \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(body)
        }

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
            let body = try? decoder.decode(AuthErrorBody.self, from: data)
            throw AuthClientError.http(
                status: http.statusCode,
                code: body?.code ?? .unknown,
                message: body?.message,
                retryAfter: body?.retryAfter,
                remainingAttempts: body?.remainingAttempts
            )
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw AuthClientError.decoding(error)
        }
    }
}
