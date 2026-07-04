@testable import InfraLab
import XCTest

final class HealthClientTests: XCTestCase {
    private let baseURL = URL(string: "http://localhost:3001")!

    override func tearDown() {
        MockURLProtocol.handler = nil
        super.tearDown()
    }

    private func makeClient() -> HTTPHealthClient {
        HTTPHealthClient(baseURL: baseURL, session: MockURLProtocol.makeSession())
    }

    func testProbesReadyEndpoint() async {
        var seenPath: String?
        MockURLProtocol.handler = { request in
            seenPath = request.url?.path
            return (200, Data("{\"ok\":true}".utf8))
        }
        _ = await makeClient().probe()
        XCTAssertEqual(seenPath, "/ready")
    }

    func testOkStatusIsOnline() async {
        MockURLProtocol.handler = { _ in (200, Data("{\"ok\":true}".utf8)) }
        let status = await makeClient().probe()
        XCTAssertEqual(status, .online)
    }

    func testUnavailableStatusIsDegraded() async {
        MockURLProtocol.handler = { _ in (503, Data("{\"ok\":false}".utf8)) }
        let status = await makeClient().probe()
        XCTAssertEqual(status, .degraded)
    }

    func testTransportFailureIsOffline() async {
        // No handler → MockURLProtocol fails the request, exercising the catch path.
        MockURLProtocol.handler = nil
        let status = await makeClient().probe()
        XCTAssertEqual(status, .offline)
    }

    @MainActor
    func testMonitorRefreshPublishesStatus() async {
        let monitor = ServerStatusMonitor(client: FakeHealthClient(.degraded))
        XCTAssertEqual(monitor.status, .unknown)
        await monitor.refresh()
        XCTAssertEqual(monitor.status, .degraded)
    }
}

/// In-memory ``HealthClient`` returning a fixed status — no URLSession needed.
private final class FakeHealthClient: HealthClient {
    private let status: ServerStatus
    init(_ status: ServerStatus) { self.status = status }
    func probe() async -> ServerStatus { status }
}
