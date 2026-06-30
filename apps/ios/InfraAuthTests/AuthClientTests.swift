import XCTest
@testable import InfraAuth

final class AuthClientTests: XCTestCase {
    private let baseURL = URL(string: "http://localhost:3001")!

    override func tearDown() {
        MockURLProtocol.handler = nil
        super.tearDown()
    }

    private func makeClient(store: TokenStore = InMemoryTokenStore()) -> HTTPAuthClient {
        HTTPAuthClient(baseURL: baseURL, platform: .ios, store: store, session: MockURLProtocol.makeSession())
    }

    private func json(_ object: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    func testRequestOtpParsesResponse() async throws {
        MockURLProtocol.handler = { _ in
            (200, self.json(["ok": true, "ttlSeconds": 300, "resendAfterSeconds": 60, "debugCode": "123456"]))
        }
        let res = try await makeClient().requestOtp(phone: "+8613800138000")
        XCTAssertEqual(res.resendAfterSeconds, 60)
        XCTAssertEqual(res.debugCode, "123456")
    }

    func testVerifyOtpPersistsTokensToStore() async throws {
        let store = InMemoryTokenStore()
        MockURLProtocol.handler = { _ in
            (200, self.json([
                "ok": true,
                "user": [
                    "id": "u1", "phone": "+8613800138000", "displayName": NSNull(),
                    "avatarUrl": NSNull(), "createdAt": "2026-06-30T00:00:00.000Z", "isNew": true,
                ],
                "tokens": [
                    "accessToken": "at", "accessTokenExpiresIn": 900,
                    "refreshToken": "rt", "refreshTokenExpiresIn": 2_592_000, "tokenType": "Bearer",
                ],
            ]))
        }
        let res = try await makeClient(store: store).verifyOtp(phone: "+8613800138000", code: "123456", device: nil)
        XCTAssertTrue(res.user.isNew)
        XCTAssertEqual(store.load()?.accessToken, "at")
        XCTAssertEqual(store.load()?.refreshToken, "rt")
    }

    func testInvalidCodeMapsErrorAndRemainingAttempts() async {
        MockURLProtocol.handler = { _ in
            (401, self.json(["ok": false, "code": "INVALID_CODE", "remainingAttempts": 3]))
        }
        do {
            _ = try await makeClient().verifyOtp(phone: "+8613800138000", code: "000000", device: nil)
            XCTFail("expected failure")
        } catch let error as AuthClientError {
            XCTAssertEqual(error.code, .invalidCode)
            XCTAssertEqual(error.displayMessage, "验证码错误。还可尝试 3 次。")
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }

    func testRefreshRotatesStoredTokens() async throws {
        let seed = AuthTokens(accessToken: "old", accessTokenExpiresIn: 900,
                              refreshToken: "oldR", refreshTokenExpiresIn: 2_592_000, tokenType: "Bearer")
        let store = InMemoryTokenStore(seed)
        MockURLProtocol.handler = { _ in
            (200, self.json(["ok": true, "tokens": [
                "accessToken": "new", "accessTokenExpiresIn": 900,
                "refreshToken": "newR", "refreshTokenExpiresIn": 2_592_000, "tokenType": "Bearer",
            ]]))
        }
        let rotated = try await makeClient(store: store).refresh()
        XCTAssertEqual(rotated?.accessToken, "new")
        XCTAssertEqual(store.load()?.refreshToken, "newR")
    }

    func testRefreshWithoutStoredTokenReturnsNil() async throws {
        let rotated = try await makeClient().refresh()
        XCTAssertNil(rotated)
    }

    func testUnknownErrorCodeDecodesToUnknown() async {
        MockURLProtocol.handler = { _ in
            (500, self.json(["ok": false, "code": "SOMETHING_NEW"]))
        }
        do {
            _ = try await makeClient().me()
            XCTFail("expected failure")
        } catch let error as AuthClientError {
            XCTAssertEqual(error.code, .unknown)
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }
}
