@testable import InfraLab
import XCTest

/// Scriptable ``AuthClient`` for the login-flow tests: canned results per
/// method, recorded calls. Unused members throw so a test fails loudly if the
/// view model starts calling something it didn't before.
private final class FakeAuthClient: AuthClient {
    struct Unscripted: Error {}

    var requestOtpResult: Result<RequestOtpResponse, Error> = .failure(Unscripted())
    var verifyOtpResult: Result<VerifyOtpResponse, Error> = .failure(Unscripted())
    var meResults: [Result<AuthUser, Error>] = []
    var refreshResult: Result<AuthTokens?, Error> = .failure(Unscripted())
    var signInWithGoogleResult: Result<AuthUser, Error> = .failure(Unscripted())

    private(set) var requestedPhones: [String] = []
    private(set) var verifiedCodes: [String] = []
    private(set) var googleIdTokens: [String] = []
    private(set) var googleNonces: [String?] = []
    private(set) var logoutCount = 0

    func requestOtp(phone: String) async throws -> RequestOtpResponse {
        requestedPhones.append(phone)
        return try requestOtpResult.get()
    }
    func verifyOtp(phone: String, code: String, device: DeviceInfo?) async throws -> VerifyOtpResponse {
        verifiedCodes.append(code)
        return try verifyOtpResult.get()
    }
    func signInWithApple(idToken: String, nonce: String?, device: DeviceInfo?) async throws -> AuthUser {
        throw Unscripted()
    }
    func signInWithGoogle(idToken: String, nonce: String?, device: DeviceInfo?) async throws -> AuthUser {
        googleIdTokens.append(idToken)
        googleNonces.append(nonce)
        return try signInWithGoogleResult.get()
    }
    func refresh() async throws -> AuthTokens? { try refreshResult.get() }
    func me() async throws -> AuthUser {
        guard !meResults.isEmpty else { throw Unscripted() }
        return try meResults.removeFirst().get()
    }
    func updateProfile(displayName: String) async throws -> AuthUser { throw Unscripted() }
    func uploadAvatar(_ data: Data, contentType: TimelineImageContentType) async throws -> AuthUser {
        throw Unscripted()
    }
    func listDevices() async throws -> [DeviceDTO] { [] }
    func updatePushToken(deviceId: String, pushToken: String) async throws {}
    func listLoginEvents() async throws -> [LoginEventDTO] { [] }
    func approveQrLogin(ticketId: String) async throws {}
    func logout() async throws { logoutCount += 1 }
}

/// Scriptable ``GoogleSignInProvider`` for the Google-flow tests: a canned
/// credential or a thrown error (e.g. `.cancelled`), with call counting.
private final class FakeGoogleSignInProvider: GoogleSignInProvider {
    var result: Result<GoogleSignInCredential, Error>
    private(set) var callCount = 0

    init(_ result: Result<GoogleSignInCredential, Error>) {
        self.result = result
    }

    func signIn() async throws -> GoogleSignInCredential {
        callCount += 1
        return try result.get()
    }
}

private extension AuthUser {
    static let fixture = AuthUser(
        id: "u1", phone: "+8613800138000", displayName: "测试用户", avatarUrl: nil,
        createdAt: "2026-07-01T00:00:00.000Z", isNew: false
    )
}

private func unauthorized() -> AuthClientError {
    .http(status: 401, code: .unauthorized, message: nil, retryAfter: nil, remainingAttempts: nil)
}

@MainActor
final class AuthViewModelTests: XCTestCase {
    // MARK: - Session restore

    func testBootstrapRestoresSessionFromMe() async {
        let client = FakeAuthClient()
        client.meResults = [.success(.fixture)]
        let model = AuthViewModel(client: client)
        XCTAssertTrue(model.restoring)

        await model.bootstrap()

        XCTAssertEqual(model.step, .done)
        XCTAssertEqual(model.user?.id, "u1")
        XCTAssertFalse(model.restoring)
    }

    func testBootstrapRefreshesOnceOn401ThenRestores() async {
        let client = FakeAuthClient()
        client.meResults = [.failure(unauthorized()), .success(.fixture)]
        client.refreshResult = .success(AuthTokens(
            accessToken: "at", accessTokenExpiresIn: 900,
            refreshToken: "rt", refreshTokenExpiresIn: 2_592_000, tokenType: "Bearer"
        ))
        let model = AuthViewModel(client: client)

        await model.bootstrap()

        XCTAssertEqual(model.step, .done)
        XCTAssertEqual(model.user?.id, "u1")
    }

    func testBootstrapStaysOnPhoneWhenRefreshHasNoSession() async {
        let client = FakeAuthClient()
        client.meResults = [.failure(unauthorized())]
        client.refreshResult = .success(nil)
        let model = AuthViewModel(client: client)

        await model.bootstrap()

        XCTAssertEqual(model.step, .phone)
        XCTAssertNil(model.user)
        XCTAssertFalse(model.restoring)
    }

    // MARK: - Send code

    func testSendCodeAdvancesToCodeStepAndStartsCooldown() async {
        let client = FakeAuthClient()
        client.requestOtpResult = .success(RequestOtpResponse(
            ok: true, ttlSeconds: 300, resendAfterSeconds: 60, debugCode: "123456"
        ))
        let model = AuthViewModel(client: client)
        model.phone = "+8613800138000"

        await model.sendCode()

        XCTAssertEqual(model.step, .code)
        XCTAssertEqual(model.cooldown, 60)
        XCTAssertFalse(model.canResend)
        XCTAssertEqual(model.debugCode, "123456")
        XCTAssertEqual(client.requestedPhones, ["+8613800138000"])
        XCTAssertFalse(model.busy)
    }

    func testSendCodeFailureSurfacesTypedMessageAndStays() async {
        let client = FakeAuthClient()
        client.requestOtpResult = .failure(AuthClientError.http(
            status: 429, code: .resendCooldown, message: nil, retryAfter: 42, remainingAttempts: nil
        ))
        let model = AuthViewModel(client: client)

        await model.sendCode()

        XCTAssertEqual(model.step, .phone)
        XCTAssertEqual(model.errorMessage, AuthCopy.Errors.message(for: .resendCooldown))
        XCTAssertFalse(model.busy)
    }

    // MARK: - Verify

    func testVerifySignsInAndPublishesUser() async {
        let client = FakeAuthClient()
        client.verifyOtpResult = .success(VerifyOtpResponse(ok: true, user: .fixture, tokens: nil))
        let model = AuthViewModel(client: client)
        model.code = "123456"

        await model.verify()

        XCTAssertEqual(model.step, .done)
        XCTAssertEqual(model.user?.id, "u1")
        XCTAssertEqual(client.verifiedCodes, ["123456"])
    }

    func testVerifyFailureStaysOnCodeStepWithMessage() async {
        let client = FakeAuthClient()
        client.verifyOtpResult = .failure(AuthClientError.http(
            status: 401, code: .invalidCode, message: nil, retryAfter: nil, remainingAttempts: 3
        ))
        let model = AuthViewModel(client: client)

        await model.verify()

        XCTAssertNotEqual(model.step, .done)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertNil(model.user)
    }

    // MARK: - Sign in with Google

    func testStartGoogleSignInSignsInAndPublishesUser() async {
        let client = FakeAuthClient()
        client.signInWithGoogleResult = .success(.fixture)
        let provider = FakeGoogleSignInProvider(.success(
            GoogleSignInCredential(idToken: "eyJ.google.jwt", nonce: "raw-nonce")
        ))
        let model = AuthViewModel(client: client, googleSignIn: provider)

        await model.startGoogleSignIn()

        XCTAssertEqual(model.step, .done)
        XCTAssertEqual(model.user?.id, "u1")
        XCTAssertEqual(client.googleIdTokens, ["eyJ.google.jwt"])
        XCTAssertEqual(client.googleNonces, ["raw-nonce"])
        XCTAssertNil(model.errorMessage)
        XCTAssertFalse(model.busy)
    }

    func testStartGoogleSignInCancelIsSilent() async {
        let client = FakeAuthClient()
        let provider = FakeGoogleSignInProvider(.failure(GoogleSignInError.cancelled))
        let model = AuthViewModel(client: client, googleSignIn: provider)

        await model.startGoogleSignIn()

        XCTAssertEqual(model.step, .phone)
        XCTAssertNil(model.user)
        XCTAssertNil(model.errorMessage)
        XCTAssertTrue(client.googleIdTokens.isEmpty)
        XCTAssertFalse(model.busy)
    }

    func testStartGoogleSignInProviderFailureSurfacesMessage() async {
        let client = FakeAuthClient()
        let provider = FakeGoogleSignInProvider(.failure(GoogleSignInError.unavailable))
        let model = AuthViewModel(client: client, googleSignIn: provider)

        await model.startGoogleSignIn()

        XCTAssertNotEqual(model.step, .done)
        XCTAssertEqual(model.errorMessage, AuthCopy.Errors.network)
        XCTAssertTrue(client.googleIdTokens.isEmpty)
        XCTAssertFalse(model.busy)
    }

    func testGoogleDisabledByDefault() {
        let model = AuthViewModel(client: FakeAuthClient())
        XCTAssertFalse(model.googleEnabled)
    }

    func testGoogleEnabledWhenConfigured() {
        let provider = FakeGoogleSignInProvider(.success(
            GoogleSignInCredential(idToken: "t", nonce: nil)
        ))
        let model = AuthViewModel(client: FakeAuthClient(), googleSignIn: provider, googleEnabled: true)
        XCTAssertTrue(model.googleEnabled)
    }

    func testCompleteGoogleSignInExchangeFailureStaysWithMessage() async {
        let client = FakeAuthClient()
        client.signInWithGoogleResult = .failure(AuthClientError.http(
            status: 401, code: .socialTokenInvalid, message: nil, retryAfter: nil, remainingAttempts: nil
        ))
        let model = AuthViewModel(client: client)

        await model.completeGoogleSignIn(
            GoogleSignInCredential(idToken: "bad", nonce: nil)
        )

        XCTAssertNotEqual(model.step, .done)
        XCTAssertEqual(model.errorMessage, AuthCopy.Errors.message(for: .socialTokenInvalid))
        XCTAssertNil(model.user)
        XCTAssertFalse(model.busy)
    }

    // MARK: - Input normalization / derived state

    func testPhoneInputIsTrimmedAndValidated() {
        let model = AuthViewModel(client: FakeAuthClient())
        model.phone = " +8613800138000 "
        XCTAssertEqual(model.phone, "+8613800138000")
        XCTAssertTrue(model.canSend)

        model.phone = "not-a-phone"
        XCTAssertFalse(model.canSend)
    }

    func testCodeInputKeepsOnlyDigitsCappedAtCodeLength() {
        let model = AuthViewModel(client: FakeAuthClient())
        model.code = "12a34b5678"
        XCTAssertEqual(model.code, "123456")
        XCTAssertTrue(model.canVerify)
    }

    // MARK: - Step transitions

    func testChangePhoneClearsCodeStateAndReturnsToPhone() async {
        let client = FakeAuthClient()
        client.requestOtpResult = .success(RequestOtpResponse(
            ok: true, ttlSeconds: 300, resendAfterSeconds: 60, debugCode: "111111"
        ))
        let model = AuthViewModel(client: client)
        await model.sendCode()
        model.code = "123456"

        model.changePhone()

        XCTAssertEqual(model.step, .phone)
        XCTAssertEqual(model.code, "")
        XCTAssertNil(model.debugCode)
    }

    func testLogoutResetsEverythingAndCallsClient() async {
        let client = FakeAuthClient()
        client.meResults = [.success(.fixture)]
        let model = AuthViewModel(client: client)
        await model.bootstrap()

        await model.logout()

        XCTAssertEqual(client.logoutCount, 1)
        XCTAssertEqual(model.step, .phone)
        XCTAssertNil(model.user)
    }

    func testApplyReplacesUserAfterProfileEdit() async {
        let client = FakeAuthClient()
        client.meResults = [.success(.fixture)]
        let model = AuthViewModel(client: client)
        await model.bootstrap()

        let renamed = AuthUser(
            id: "u1", phone: "+8613800138000", displayName: "新名字", avatarUrl: nil,
            createdAt: "2026-07-01T00:00:00.000Z", isNew: false
        )
        model.apply(renamed)

        XCTAssertEqual(model.user?.displayName, "新名字")
    }
}
