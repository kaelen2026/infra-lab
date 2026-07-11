import AuthenticationServices
import CryptoKit
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
    private let googleSignIn: GoogleSignInProvider
    private var cooldownTask: Task<Void, Never>?
    /// Raw nonce for the in-flight Sign in with Apple request: its SHA-256 is bound
    /// into the Apple request, the raw value is sent to our server, which re-derives.
    private var appleNonce: String?

    init(client: AuthClient, googleSignIn: GoogleSignInProvider = UnavailableGoogleSignInProvider()) {
        self.client = client
        self.googleSignIn = googleSignIn
    }

    // MARK: - Derived UI state

    var canSend: Bool { AuthValidation.isValidPhone(phone) }
    var canVerify: Bool { AuthValidation.isValidCode(code) }
    var canResend: Bool { cooldown <= 0 }
    // A social-only account (Sign in with Apple) may have neither a name nor a phone.
    var displayName: String? { user.flatMap { $0.displayName ?? $0.phone } }

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

    // MARK: - Sign in with Apple

    /// Configure the Apple request: generate a fresh nonce, keep the raw value (sent
    /// to our server), and set its SHA-256 as `request.nonce`. Apple signs the hash
    /// into the identity token; the server re-derives and compares (replay defense).
    func startAppleSignIn(_ request: ASAuthorizationAppleIDRequest) {
        let raw = Self.randomNonce()
        appleNonce = raw
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(raw)
    }

    /// Handle the `SignInWithAppleButton` completion: pull the identity token off the
    /// credential, exchange it for our session, and land on `.done`. A user
    /// cancellation is silent; any other failure surfaces shared error copy.
    func completeAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        errorMessage = nil
        defer { appleNonce = nil }
        switch result {
        case let .success(authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = AuthCopy.Errors.message(for: .socialAccountError)
                return
            }
            busy = true
            defer { busy = false }
            do {
                let device = DeviceMetadata.current(pushToken: PushRegistration.shared.deviceToken)
                user = try await client.signInWithApple(
                    idToken: idToken, nonce: appleNonce, device: device
                )
                step = .done
            } catch {
                errorMessage = describe(error)
            }
        case let .failure(error):
            // A user-cancelled sheet is not a failure to report.
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return }
            errorMessage = describe(error)
        }
    }

    // MARK: - Sign in with Google

    /// Button action: present the Google sheet via the injected provider, then hand
    /// the ID token to the server exchange. A user-cancelled sheet is silent; any
    /// other provider failure surfaces shared error copy. The provider owns nonce
    /// generation/hashing and returns the raw nonce our server re-derives.
    func startGoogleSignIn() async {
        errorMessage = nil
        let credential: GoogleSignInCredential
        do {
            credential = try await googleSignIn.signIn()
        } catch GoogleSignInError.cancelled {
            // A user-cancelled sheet is not a failure to report.
            return
        } catch {
            errorMessage = describe(error)
            return
        }
        await completeGoogleSignIn(credential)
    }

    /// Exchange a Google credential for our session and land on `.done`. Split out
    /// from ``startGoogleSignIn()`` so the exchange half is driven directly in tests.
    func completeGoogleSignIn(_ credential: GoogleSignInCredential) async {
        errorMessage = nil
        busy = true
        defer { busy = false }
        do {
            let device = DeviceMetadata.current(pushToken: PushRegistration.shared.deviceToken)
            user = try await client.signInWithGoogle(
                idToken: credential.idToken, nonce: credential.nonce, device: device
            )
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

    /// A cryptographically-random URL-safe nonce for Sign in with Apple. Falls back
    /// to UUID-derived entropy if the system RNG ever fails, avoiding a force-unwrap.
    private static func randomNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            return (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
        }
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    /// Lowercase hex SHA-256 — the form Apple expects in `request.nonce`.
    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
