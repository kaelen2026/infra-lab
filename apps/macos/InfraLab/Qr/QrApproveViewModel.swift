import Foundation

/// Drives the native side of QR cross-device login: an already-authenticated user
/// scans the QR the web renders (its content is the public ticket id) and confirms
/// here, binding the browser's pending ticket to the current user. The Swift
/// counterpart of Android's `QrApproveViewModel`; scanning itself lives in the UI
/// (``QrScannerView``), so this stays framework-free and unit-testable.
@MainActor
final class QrApproveViewModel: ObservableObject {
    /// Where the approval flow is in its lifecycle (drives the account-sheet card).
    enum Phase: Equatable {
        case idle
        case approving
        case success(message: String)
        case failure(message: String)
    }

    @Published private(set) var phase: Phase = .idle
    /// A scanned ticket awaiting the user's explicit confirmation — non-nil drives
    /// the confirm alert. The approve request only fires from ``confirmPending()``.
    @Published private(set) var pendingTicketId: String?

    private let client: AuthClient

    init(client: AuthClient) {
        self.client = client
    }

    /// Stage the scanned payload for confirmation. Blank input (a cancelled or
    /// empty scan) is ignored, mirroring the Android client.
    func handleScan(_ payload: String) {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        phase = .idle
        pendingTicketId = trimmed
    }

    /// The user confirmed on the alert: approve the ticket. Takes the id
    /// explicitly (the alert captures it at presentation) so approval can't race
    /// the alert-dismiss binding clearing ``pendingTicketId``.
    func approve(ticketId: String) async {
        pendingTicketId = nil
        phase = .approving
        do {
            try await client.approveQrLogin(ticketId: ticketId)
            phase = .success(message: "已确认，网页端即将登录。")
        } catch let error as AuthClientError {
            phase = .failure(message: error.displayMessage)
        } catch {
            phase = .failure(message: AuthCopy.Errors.network)
        }
    }

    /// The user dismissed the confirm alert without approving.
    func cancelPending() {
        pendingTicketId = nil
    }

    /// Return the card to its resting state (before starting another scan).
    func reset() {
        phase = .idle
        pendingTicketId = nil
    }
}
