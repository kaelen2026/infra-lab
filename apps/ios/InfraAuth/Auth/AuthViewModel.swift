import Foundation
import SwiftUI

/// Headless OTP login flow — the Swift counterpart of the web app's
/// `useOtpLogin` hook. Owns all state, SDK calls and input normalization so the
/// SwiftUI views stay declarative.
@MainActor
final class AuthViewModel: ObservableObject {
    enum Step { case phone, code, done }

    @Published private(set) var step: Step = .phone
    @Published var phone: String = "+86" {
        // Reassign only on change: a @Published property's didSet re-fires on
        // self-assignment (unlike a plain stored property), so an unconditional
        // write here would recurse infinitely and overflow the stack.
        didSet {
            let trimmed = phone.trimmingCharacters(in: .whitespaces)
            if trimmed != phone { phone = trimmed }
        }
    }
    @Published var code: String = "" {
        didSet {
            let digits = code.filter(\.isNumber)
            let normalized = String(digits.prefix(OTPLimits.codeLength))
            if normalized != code { code = normalized }
        }
    }
    @Published private(set) var busy = false
    @Published private(set) var errorMessage: String?
    /// Seconds left before the code may be resent (0 ⇒ allowed).
    @Published private(set) var cooldown = 0
    @Published private(set) var user: AuthUser?
    /// Surfaced only when the server echoes the code (`OTP_DEBUG_RETURN_CODE`, dev).
    @Published private(set) var debugCode: String?
    /// True while the launch-time session restore is in flight.
    @Published private(set) var restoring = true

    private let client: AuthClient
    private var cooldownTask: Task<Void, Never>?

    init(client: AuthClient) {
        self.client = client
    }

    // MARK: - Derived UI state

    var canSend: Bool { AuthValidation.isValidPhone(phone) }
    var canVerify: Bool { AuthValidation.isValidCode(code) }
    var canResend: Bool { cooldown <= 0 }
    var displayName: String? { user.map { $0.displayName ?? $0.phone } }

    // MARK: - Lifecycle

    /// Restore a session on launch: try `/auth/me`, refreshing once on 401.
    func bootstrap() async {
        defer { restoring = false }
        do {
            user = try await client.me()
            step = .done
        } catch let error as AuthClientError where error.code == .unauthorized {
            await restoreViaRefresh()
        } catch {
            // No usable session; stay on the phone step.
        }
    }

    private func restoreViaRefresh() async {
        do {
            guard try await client.refresh() != nil else { return }
            user = try await client.me()
            step = .done
        } catch {
            try? await client.logout()
        }
    }

    // MARK: - Actions

    func sendCode() async {
        errorMessage = nil
        busy = true
        defer { busy = false }
        do {
            let res = try await client.requestOtp(phone: phone)
            debugCode = res.debugCode
            startCooldown(res.resendAfterSeconds)
            step = .code
        } catch {
            errorMessage = describe(error)
        }
    }

    func verify() async {
        errorMessage = nil
        busy = true
        defer { busy = false }
        do {
            // Include the APNS token in the device record when we already have one; a
            // token that only arrives after login is reported later via updatePushToken.
            let device = DeviceMetadata.current(pushToken: PushRegistration.shared.deviceToken)
            let res = try await client.verifyOtp(phone: phone, code: code, device: device)
            user = res.user
            step = .done
        } catch {
            errorMessage = describe(error)
        }
    }

    /// Replace the current user after a profile edit (rename / new avatar) so every
    /// screen bound to `user` — the account sheet, the nav-bar avatar — refreshes.
    func apply(_ updatedUser: AuthUser) {
        user = updatedUser
    }

    func changePhone() {
        errorMessage = nil
        code = ""
        debugCode = nil
        step = .phone
    }

    func logout() async {
        try? await client.logout()
        user = nil
        code = ""
        debugCode = nil
        errorMessage = nil
        step = .phone
    }

    // MARK: - Helpers

    private func startCooldown(_ seconds: Int) {
        cooldownTask?.cancel()
        cooldown = max(seconds, 0)
        cooldownTask = Task { [weak self] in
            while !Task.isCancelled, let current = self?.cooldown, current > 0 {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                self?.cooldown = max((self?.cooldown ?? 1) - 1, 0)
            }
        }
    }

    private func describe(_ error: Error) -> String {
        (error as? AuthClientError)?.displayMessage ?? AuthCopy.Errors.network
    }
}
