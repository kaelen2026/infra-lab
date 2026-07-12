import AppKit
@testable import InfraLab
import XCTest

/// Scriptable ``AuthClient`` slice for the account screen: devices + login
/// events + profile edits; the login-flow members are unused no-ops.
private final class FakeAccountClient: AuthClient {
    struct Unscripted: Error {}

    var devicesResult: Result<[DeviceDTO], Error> = .success([])
    var eventsResult: Result<[LoginEventDTO], Error> = .success([])
    var updateProfileResult: Result<AuthUser, Error> = .failure(Unscripted())
    var uploadAvatarResult: Result<AuthUser, Error> = .failure(Unscripted())

    private(set) var updatedNames: [String] = []
    private(set) var uploadedByteCounts: [Int] = []

    func listDevices() async throws -> [DeviceDTO] { try devicesResult.get() }
    func listLoginEvents() async throws -> [LoginEventDTO] { try eventsResult.get() }
    func updateProfile(displayName: String) async throws -> AuthUser {
        updatedNames.append(displayName)
        return try updateProfileResult.get()
    }
    func uploadAvatar(_ data: Data, contentType: TimelineImageContentType) async throws -> AuthUser {
        uploadedByteCounts.append(data.count)
        return try uploadAvatarResult.get()
    }

    func requestOtp(phone: String) async throws -> RequestOtpResponse { throw Unscripted() }
    func verifyOtp(phone: String, code: String, device: DeviceInfo?) async throws -> VerifyOtpResponse {
        throw Unscripted()
    }
    func signInWithApple(idToken: String, nonce: String?, device: DeviceInfo?) async throws -> AuthUser {
        throw Unscripted()
    }
    func signInWithGoogle(idToken: String, nonce: String?, device: DeviceInfo?) async throws -> AuthUser {
        throw Unscripted()
    }
    func refresh() async throws -> AuthTokens? { nil }
    func me() async throws -> AuthUser { throw Unscripted() }
    func updatePushToken(deviceId: String, pushToken: String) async throws {}
    func approveQrLogin(ticketId: String) async throws {}
    func logout() async throws {}
}

private extension AuthUser {
    static let fixture = AuthUser(
        id: "u1", phone: "+8613800138000", displayName: "测试用户", avatarUrl: nil,
        createdAt: "2026-07-01T00:00:00.000Z", isNew: false
    )
}

private func device(_ id: String) -> DeviceDTO {
    DeviceDTO(
        id: id, platform: .ios, deviceId: "device-\(id)", model: "iPhone",
        osVersion: "17.0", appVersion: "0.1.0",
        lastSeenAt: "2026-07-01T09:30:00.000Z", createdAt: "2026-06-30T00:00:00.000Z"
    )
}

private func event(_ id: String) -> LoginEventDTO {
    LoginEventDTO(id: id, platform: .ios, ip: "203.0.113.7", success: true,
                  createdAt: "2026-07-01T09:30:00.000Z")
}

private func makeImage() -> PlatformImage {
    let image = NSImage(size: NSSize(width: 2, height: 2))
    if let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: 2, pixelsHigh: 2,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) {
        image.addRepresentation(rep)
    }
    return image
}

@MainActor
final class AccountViewModelTests: XCTestCase {
    // MARK: - Load

    func testLoadPublishesDevicesAndEvents() async {
        let client = FakeAccountClient()
        client.devicesResult = .success([device("d1")])
        client.eventsResult = .success([event("e1"), event("e2")])
        let model = AccountViewModel(client: client)
        XCTAssertTrue(model.loading)

        await model.load()

        XCTAssertEqual(model.devices?.map(\.id), ["d1"])
        XCTAssertEqual(model.events?.count, 2)
        XCTAssertFalse(model.loading)
        XCTAssertNil(model.error)
    }

    func testLoadFailureSurfacesError() async {
        let client = FakeAccountClient()
        client.devicesResult = .failure(URLError(.notConnectedToInternet))
        let model = AccountViewModel(client: client)

        await model.load()

        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.loading)
    }

    // MARK: - Display name

    func testSaveDisplayNameTrimsPersistsAndReturnsUser() async {
        let client = FakeAccountClient()
        client.updateProfileResult = .success(.fixture)
        let model = AccountViewModel(client: client)

        let user = await model.saveDisplayName("  新名字  ")

        XCTAssertEqual(user?.id, "u1")
        XCTAssertEqual(client.updatedNames, ["新名字"])
        XCTAssertNil(model.editError)
        XCTAssertFalse(model.editBusy)
    }

    func testSaveDisplayNameRejectsEmptyLocally() async {
        let client = FakeAccountClient()
        let model = AccountViewModel(client: client)

        let user = await model.saveDisplayName("   ")

        XCTAssertNil(user)
        XCTAssertNotNil(model.editError)
        XCTAssertTrue(client.updatedNames.isEmpty)
    }

    func testSaveDisplayNameRejectsOverlongLocally() async {
        let client = FakeAccountClient()
        let model = AccountViewModel(client: client)
        let overlong = String(repeating: "长", count: ProfileLimits.displayNameMaxLength + 1)

        let user = await model.saveDisplayName(overlong)

        XCTAssertNil(user)
        XCTAssertNotNil(model.editError)
        XCTAssertTrue(client.updatedNames.isEmpty)
    }

    func testSaveDisplayNameFailureSurfacesTypedMessage() async {
        let client = FakeAccountClient()
        client.updateProfileResult = .failure(AuthClientError.http(
            status: 401, code: .unauthorized, message: nil, retryAfter: nil, remainingAttempts: nil
        ))
        let model = AccountViewModel(client: client)

        let user = await model.saveDisplayName("新名字")

        XCTAssertNil(user)
        XCTAssertEqual(model.editError, AuthCopy.Errors.message(for: .unauthorized))
        XCTAssertFalse(model.editBusy)
    }

    // MARK: - Avatar

    func testUploadAvatarSendsJpegAndReturnsUser() async {
        let client = FakeAccountClient()
        client.uploadAvatarResult = .success(.fixture)
        let model = AccountViewModel(client: client)

        let user = await model.uploadAvatar(makeImage())

        XCTAssertEqual(user?.id, "u1")
        XCTAssertEqual(client.uploadedByteCounts.count, 1)
        XCTAssertGreaterThan(client.uploadedByteCounts[0], 0)
        XCTAssertNil(model.editError)
        XCTAssertFalse(model.editBusy)
    }

    func testUploadAvatarFailureSurfacesErrorAndReturnsNil() async {
        let client = FakeAccountClient()
        client.uploadAvatarResult = .failure(URLError(.timedOut))
        let model = AccountViewModel(client: client)

        let user = await model.uploadAvatar(makeImage())

        XCTAssertNil(user)
        XCTAssertNotNil(model.editError)
        XCTAssertFalse(model.editBusy)
    }
}
