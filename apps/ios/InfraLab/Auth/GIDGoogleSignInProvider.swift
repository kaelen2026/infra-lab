import CryptoKit
import Foundation
import GoogleSignIn
import UIKit

/// Real ``GoogleSignInProvider`` backed by the GoogleSignIn SDK. It presents the
/// Google sheet, binds a SHA-256 nonce into the request (the raw value is returned
/// for our server to re-derive, exactly like the Sign in with Apple flow), and maps
/// the SDK's user-cancel to ``GoogleSignInError/cancelled`` so the view model keeps
/// it silent. Wired only when a client id is configured (see ``GoogleConfig``);
/// otherwise the app runs with ``UnavailableGoogleSignInProvider``.
@MainActor
final class GIDGoogleSignInProvider: GoogleSignInProvider {
    init(clientID: String) {
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    }

    func signIn() async throws -> GoogleSignInCredential {
        guard let presenter = Self.topViewController() else {
            throw GoogleSignInError.unavailable
        }
        let rawNonce = Self.randomNonce()
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(
                withPresenting: presenter,
                hint: nil,
                additionalScopes: nil,
                nonce: Self.sha256(rawNonce)
            )
            guard let idToken = result.user.idToken?.tokenString else {
                throw GoogleSignInError.unavailable
            }
            return GoogleSignInCredential(idToken: idToken, nonce: rawNonce)
        } catch let error as GoogleSignInError {
            throw error
        } catch {
            let nsError = error as NSError
            if nsError.domain == kGIDSignInErrorDomain,
               nsError.code == GIDSignInError.Code.canceled.rawValue {
                throw GoogleSignInError.cancelled
            }
            throw GoogleSignInError.unavailable
        }
    }

    // MARK: - Helpers

    /// The frontmost view controller to present the Google sheet from. `nil` when no
    /// foreground scene has a key window yet, which the caller maps to `.unavailable`.
    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard let root = scene?.windows.first(where: \.isKeyWindow)?.rootViewController else {
            return nil
        }
        var top = root
        while let presented = top.presentedViewController {
            top = presented
        }
        return top
    }

    /// A cryptographically-random URL-safe nonce (mirrors the Apple flow in
    /// ``AuthViewModel``). Falls back to UUID entropy if the system RNG fails, so
    /// there is never a force-unwrap on `SecRandomCopyBytes`.
    private static func randomNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            return (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
        }
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    /// Lowercase hex SHA-256 — the form bound into the Google request's nonce.
    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
