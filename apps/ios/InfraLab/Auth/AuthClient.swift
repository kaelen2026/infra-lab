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
    /// Update the current user's display name; returns the refreshed user.
    func updateProfile(displayName: String) async throws -> AuthUser
    /// Upload a new avatar image (multipart); the server persists it, sets it on
    /// the profile and returns the refreshed user.
    func uploadAvatar(_ data: Data, contentType: TimelineImageContentType) async throws -> AuthUser
    /// Registered client installs for the current user (account dashboard).
    func listDevices() async throws -> [DeviceDTO]
    /// Update this device's APNS push token (acquired asynchronously after login).
    func updatePushToken(deviceId: String, pushToken: String) async throws
    /// Recent OTP verification attempts for the current user (account dashboard).
    func listLoginEvents() async throws -> [LoginEventDTO]
    /// Approve a QR login ticket scanned from the web, signing that browser in as
    /// this (already-authenticated) user. Cross-device login — see `qr.routes.ts`.
    func approveQrLogin(ticketId: String) async throws
    func logout() async throws
}

/// URLSession-backed client. On `verifyOtp`/`refresh` it persists the rotated
/// tokens to the injected ``TokenStore``; `logout` clears them. Protected requests
/// ride ``AuthorizedTransport``, which refreshes-and-retries once on a `401`.
final class HTTPAuthClient: AuthClient {
    private let baseURL: URL
    private let platform: Platform
    private let store: TokenStore
    private let transport: AuthorizedTransport
    private let refresher: SessionRefresher
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(
        baseURL: URL, platform: Platform = .ios, store: TokenStore,
        transport: AuthorizedTransport, refresher: SessionRefresher
    ) {
        self.baseURL = baseURL
        self.platform = platform
        self.store = store
        self.transport = transport
        self.refresher = refresher
    }

    /// Convenience wiring for tests / standalone use: build a private transport +
    /// refresher over `session`. Production shares one set across every client (see
    /// `InfraLabApp`) so a `401` on any client triggers a single-flight refresh.
    convenience init(
        baseURL: URL, platform: Platform = .ios, store: TokenStore, session: URLSession = .shared
    ) {
        let refresher = SessionRefresher(store: store) {
            try await AuthSession.rotateTokens(baseURL: baseURL, store: store, session: session)
        }
        let transport = AuthorizedTransport(store: store, session: session, refresher: refresher)
        self.init(
            baseURL: baseURL, platform: platform, store: store,
            transport: transport, refresher: refresher
        )
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
        // Route through the shared refresher so a launch-time restore and an
        // in-session 401 retry can never rotate the token twice concurrently.
        try await refresher.refresh(staleAccessToken: store.load()?.accessToken)
    }

    func me() async throws -> AuthUser {
        let res: MeResponse = try await send(AuthRoutes.me, method: "GET", body: Optional<RefreshInput>.none)
        return res.user
    }

    func updateProfile(displayName: String) async throws -> AuthUser {
        let input = UpdateProfileInput(displayName: displayName, avatarUrl: nil)
        let res: ProfileResponse = try await send(AuthRoutes.updateProfile, method: "PATCH", body: input)
        return res.user
    }

    func uploadAvatar(_ data: Data, contentType: TimelineImageContentType) async throws -> AuthUser {
        // multipart/form-data with a single `file` part — same shape the timeline
        // image upload uses, so the server parses both identically.
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.appendString("--\(boundary)\r\n")
        body.appendString(
            "Content-Disposition: form-data; name=\"file\"; filename=\"avatar.\(contentType.fileExtension)\"\r\n"
        )
        body.appendString("Content-Type: \(contentType.rawValue)\r\n\r\n")
        body.append(data)
        body.appendString("\r\n--\(boundary)--\r\n")
        let payload = body

        let responseData: Data
        let http: HTTPURLResponse
        do {
            (responseData, http) = try await transport.send {
                var request = URLRequest(url: self.baseURL.appendingPathComponent(AuthRoutes.avatar))
                request.httpMethod = "POST"
                request.setValue(
                    "multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type"
                )
                request.httpBody = payload
                return request
            }
        } catch {
            throw AuthClientError.transport(error)
        }

        guard (200..<300).contains(http.statusCode) else {
            let parsed = try? decoder.decode(AuthErrorBody.self, from: responseData)
            throw AuthClientError.http(
                status: http.statusCode,
                code: parsed?.code ?? .unknown,
                message: parsed?.message,
                retryAfter: parsed?.retryAfter,
                remainingAttempts: parsed?.remainingAttempts
            )
        }

        do {
            return try decoder.decode(ProfileResponse.self, from: responseData).user
        } catch {
            throw AuthClientError.decoding(error)
        }
    }

    func listDevices() async throws -> [DeviceDTO] {
        let res: DevicesResponse = try await send(AuthRoutes.devices, method: "GET",
                                                  body: Optional<RefreshInput>.none)
        return res.devices
    }

    func updatePushToken(deviceId: String, pushToken: String) async throws {
        let input = UpdatePushTokenInput(deviceId: deviceId, pushToken: pushToken)
        let _: OkResponse = try await send(AuthRoutes.pushToken, method: "POST", body: input)
    }

    func listLoginEvents() async throws -> [LoginEventDTO] {
        let res: LoginEventsResponse = try await send(AuthRoutes.loginEvents, method: "GET",
                                                      body: Optional<RefreshInput>.none)
        return res.events
    }

    func approveQrLogin(ticketId: String) async throws {
        let input = ApproveQrLoginInput(ticketId: ticketId)
        let _: OkResponse = try await send(AuthRoutes.qrApprove, method: "POST", body: input)
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
        // Encode up front (throws raw on the rare encode failure); the builder is
        // replayed verbatim if the transport retries after a token refresh.
        let payload = try body.map { try encoder.encode($0) }

        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport.send {
                var request = URLRequest(url: self.baseURL.appendingPathComponent(path))
                request.httpMethod = method
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = payload
                return request
            }
        } catch {
            throw AuthClientError.transport(error)
        }

        guard (200..<300).contains(http.statusCode) else {
            let parsed = try? decoder.decode(AuthErrorBody.self, from: data)
            throw AuthClientError.http(
                status: http.statusCode,
                code: parsed?.code ?? .unknown,
                message: parsed?.message,
                retryAfter: parsed?.retryAfter,
                remainingAttempts: parsed?.remainingAttempts
            )
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw AuthClientError.decoding(error)
        }
    }
}

private extension Data {
    /// Append a UTF-8 string; drops it silently if it somehow can't encode
    /// (never happens for the ASCII multipart preamble) — avoids a force-unwrap.
    mutating func appendString(_ string: String) {
        if let encoded = string.data(using: .utf8) { append(encoded) }
    }
}
