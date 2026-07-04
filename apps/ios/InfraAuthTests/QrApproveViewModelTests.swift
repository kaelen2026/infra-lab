@testable import InfraAuth
import XCTest

/// Mirrors Android's `QrApproveViewModelTest`: scan staging, blank-scan ignore,
/// approve success/failure copy, and reset. The scanner itself is UI (VisionKit)
/// and stays untested; the ViewModel takes a stubbed ``AuthClient``.
@MainActor
final class QrApproveViewModelTests: XCTestCase {
    func testScanStagesTicketForConfirmation() {
        let viewModel = QrApproveViewModel(client: StubAuthClient())

        viewModel.handleScan("  ticket-1\n")

        XCTAssertEqual(viewModel.pendingTicketId, "ticket-1")
        XCTAssertEqual(viewModel.phase, .idle)
    }

    func testBlankScanIsIgnored() {
        let viewModel = QrApproveViewModel(client: StubAuthClient())

        viewModel.handleScan("   \n")

        XCTAssertNil(viewModel.pendingTicketId)
        XCTAssertEqual(viewModel.phase, .idle)
    }

    func testApproveSuccess() async {
        let client = StubAuthClient()
        let viewModel = QrApproveViewModel(client: client)
        viewModel.handleScan("ticket-1")

        await viewModel.approve(ticketId: "ticket-1")

        XCTAssertEqual(client.approvedTicketIds, ["ticket-1"])
        XCTAssertNil(viewModel.pendingTicketId)
        XCTAssertEqual(viewModel.phase, .success(message: "已确认，网页端即将登录。"))
    }

    func testApproveRejectedTicketSurfacesErrorCopy() async {
        let client = StubAuthClient()
        client.approveError = AuthClientError.http(
            status: 409, code: .qrAlreadyUsed, message: nil, retryAfter: nil, remainingAttempts: nil
        )
        let viewModel = QrApproveViewModel(client: client)

        await viewModel.approve(ticketId: "ticket-1")

        XCTAssertEqual(
            viewModel.phase,
            .failure(message: AuthCopy.Errors.message(for: .qrAlreadyUsed))
        )
    }

    func testTransportFailureFallsBackToNetworkCopy() async {
        let client = StubAuthClient()
        client.approveError = URLError(.notConnectedToInternet)
        let viewModel = QrApproveViewModel(client: client)

        await viewModel.approve(ticketId: "ticket-1")

        XCTAssertEqual(viewModel.phase, .failure(message: AuthCopy.Errors.network))
    }

    func testCancelAndResetReturnToRest() async {
        let client = StubAuthClient()
        client.approveError = URLError(.timedOut)
        let viewModel = QrApproveViewModel(client: client)

        viewModel.handleScan("ticket-1")
        viewModel.cancelPending()
        XCTAssertNil(viewModel.pendingTicketId)

        await viewModel.approve(ticketId: "ticket-1")
        viewModel.reset()
        XCTAssertEqual(viewModel.phase, .idle)
        XCTAssertNil(viewModel.pendingTicketId)
    }
}

/// Minimal ``AuthClient`` stub: records `approveQrLogin` calls and can be armed
/// to throw; every other member is an unused no-op.
private final class StubAuthClient: AuthClient {
    var approveError: Error?
    private(set) var approvedTicketIds: [String] = []

    func approveQrLogin(ticketId: String) async throws {
        approvedTicketIds.append(ticketId)
        if let approveError { throw approveError }
    }

    func requestOtp(phone: String) async throws -> RequestOtpResponse {
        RequestOtpResponse(ok: true, ttlSeconds: 300, resendAfterSeconds: 60, debugCode: nil)
    }
    func verifyOtp(phone: String, code: String, device: DeviceInfo?) async throws -> VerifyOtpResponse {
        VerifyOtpResponse(ok: true, user: .stub, tokens: nil)
    }
    func refresh() async throws -> AuthTokens? { nil }
    func me() async throws -> AuthUser { .stub }
    func updateProfile(displayName: String) async throws -> AuthUser { .stub }
    func uploadAvatar(_ data: Data, contentType: TimelineImageContentType) async throws -> AuthUser {
        .stub
    }
    func listDevices() async throws -> [DeviceDTO] { [] }
    func updatePushToken(deviceId: String, pushToken: String) async throws {}
    func listLoginEvents() async throws -> [LoginEventDTO] { [] }
    func logout() async throws {}
}

private extension AuthUser {
    static let stub = AuthUser(
        id: "u1", phone: "+8613800138000", displayName: nil, avatarUrl: nil,
        createdAt: "2026-07-01T00:00:00.000Z", isNew: false
    )
}
