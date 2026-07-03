import SwiftUI

/// Polls the API's readiness endpoint on a cadence (and on demand) so the app can
/// surface a global banner whenever the backend can't serve. All state mutates on
/// the main actor; the polling loop lives in a single cancellable ``Task`` that is
/// stopped when the app leaves the foreground, so it never spins in the background.
@MainActor
final class ServerStatusMonitor: ObservableObject {
    /// Latest observed status. Drives ``ServerStatusBanner``.
    @Published private(set) var status: ServerStatus = .unknown
    /// True while a probe is in flight — lets the retry button show a spinner.
    @Published private(set) var checking = false

    private let client: HealthClient
    /// Gap between probes while the app is in the foreground.
    private let interval: Duration
    private var task: Task<Void, Never>?

    init(client: HealthClient, interval: Duration = .seconds(30)) {
        self.client = client
        self.interval = interval
    }

    /// Start (or restart) the polling loop. Idempotent and safe to call on every
    /// foreground: it cancels any prior loop and probes immediately, so returning
    /// to the app re-checks the server right away.
    func start() {
        task?.cancel()
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                guard let interval = self?.interval else { return }
                try? await Task.sleep(for: interval)
            }
        }
    }

    /// Stop polling (e.g. when the app is backgrounded).
    func stop() {
        task?.cancel()
        task = nil
    }

    /// One immediate probe — the loop's step, also invoked by the retry button.
    func refresh() async {
        checking = true
        defer { checking = false }
        let next = await client.probe()
        if next != status { status = next }
    }

    deinit {
        task?.cancel()
    }
}

#if DEBUG
extension ServerStatusMonitor {
    /// A monitor pinned to a fixed status for SwiftUI previews (no polling).
    static func preview(_ status: ServerStatus) -> ServerStatusMonitor {
        let monitor = ServerStatusMonitor(client: PreviewHealthClient(status))
        monitor.status = status
        return monitor
    }
}
#endif
