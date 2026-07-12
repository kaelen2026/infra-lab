import AppKit

/// Cross-platform image alias so the shared timeline/account logic that the iOS
/// client expresses in `UIImage` maps 1:1 onto AppKit's `NSImage` here. SwiftUI
/// renders these via `Image(nsImage:)`.
typealias PlatformImage = NSImage

extension NSImage {
    /// JPEG-encode this image, mirroring UIKit's
    /// `UIImage.jpegData(compressionQuality:)`. Returns nil when the image has no
    /// bitmap representation to encode.
    func jpegData(compressionQuality: CGFloat) -> Data? {
        guard let tiff = tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff) else { return nil }
        return bitmap.representation(
            using: .jpeg,
            properties: [.compressionFactor: compressionQuality]
        )
    }
}
