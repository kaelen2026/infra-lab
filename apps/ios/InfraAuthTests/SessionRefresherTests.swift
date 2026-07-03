@testable import InfraAuth
import XCTest

final class SessionRefresherTests: XCTestCase {
    private func tokens(access: String, refresh: String) -> AuthTokens {
        AuthTokens(accessToken: access, accessTokenExpiresIn: 900,
                   refreshToken: refresh, refreshTokenExpiresIn: 2_592_000, tokenType: "Bearer")
    }

    /// A peer already rotated past the token that failed → reuse the fresh one
    /// without touching the network.
    func testReturnsCurrentWhenAlreadyRotated() async throws {
        let store = InMemoryTokenStore(tokens(access: "fresh", refresh: "rt"))
        let calls = CallCounter()
        let refresher = SessionRefresher(store: store) {
            await calls.increment()
            return nil
        }

        let result = try await refresher.refresh(staleAccessToken: "stale")
        XCTAssertEqual(result?.accessToken, "fresh")
        let count = await calls.value
        XCTAssertEqual(count, 0)
    }

    /// Concurrent 401s collapse into a single rotation.
    func testCollapsesConcurrentRefreshesIntoOne() async throws {
        let store = InMemoryTokenStore(tokens(access: "stale", refresh: "rt"))
        let calls = CallCounter()
        let refresher = SessionRefresher(store: store) {
            await calls.increment()
            try? await Task.sleep(for: .milliseconds(50))
            let rotated = AuthTokens(accessToken: "fresh", accessTokenExpiresIn: 900,
                                     refreshToken: "rt2", refreshTokenExpiresIn: 2_592_000, tokenType: "Bearer")
            store.save(rotated)
            return rotated
        }

        async let first = refresher.refresh(staleAccessToken: "stale")
        async let second = refresher.refresh(staleAccessToken: "stale")
        let results = try await [first, second]

        XCTAssertEqual(results.compactMap { $0?.accessToken }, ["fresh", "fresh"])
        let count = await calls.value
        XCTAssertEqual(count, 1)
    }
}

/// Async-safe call counter for the injected rotation closure.
private actor CallCounter {
    private(set) var value = 0
    func increment() { value += 1 }
}
