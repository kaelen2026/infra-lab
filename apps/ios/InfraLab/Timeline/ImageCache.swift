import CryptoKit
import SwiftUI
import UIKit

/// Disk-backed image cache for timeline photos. Keyed by the absolute url; the
/// bytes are written under a SHA-256 filename in the Caches directory, with an
/// in-memory ``NSCache`` in front so a scrolled-past image reloads instantly and
/// a relaunch still reads from disk instead of the network. Satisfies the
/// "图片要支持本地缓存" requirement without a third-party dependency.
actor TimelineImageCache {
    static let shared = TimelineImageCache()

    private let fileManager = FileManager.default
    private let directory: URL
    private let session: URLSession
    private let memory = NSCache<NSString, UIImage>()

    init(session: URLSession = .shared) {
        self.session = session
        let base = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        directory = base.appendingPathComponent("timeline-images", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Return the image for `url`, hitting memory → disk → network in order.
    /// Returns nil on any transport/decoding failure (the view shows a placeholder).
    func image(for url: URL) async -> UIImage? {
        let key = cacheKey(for: url)

        if let cached = memory.object(forKey: key as NSString) { return cached }

        let fileURL = directory.appendingPathComponent(key)
        if let data = try? Data(contentsOf: fileURL), let image = UIImage(data: data) {
            memory.setObject(image, forKey: key as NSString)
            return image
        }

        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode),
                  let image = UIImage(data: data) else { return nil }
            try? data.write(to: fileURL, options: .atomic)
            memory.setObject(image, forKey: key as NSString)
            return image
        } catch {
            return nil
        }
    }

    private func cacheKey(for url: URL) -> String {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

/// Async image view backed by ``TimelineImageCache`` — the cached counterpart of
/// SwiftUI's `AsyncImage`. Shows `placeholder` until the image resolves.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    private let contentMode: ContentMode
    private let placeholder: () -> Placeholder

    @State private var image: UIImage?

    init(
        url: URL?,
        contentMode: ContentMode = .fill,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.contentMode = contentMode
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            guard let url else { return }
            image = await TimelineImageCache.shared.image(for: url)
        }
    }
}
