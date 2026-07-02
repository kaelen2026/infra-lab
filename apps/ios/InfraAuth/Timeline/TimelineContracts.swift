import Foundation

// Swift mirror of `@infra/shared`'s timeline contracts — the single source of
// truth for the request/response shapes. Only the iOS client consumes the
// timeline today. Every post is scoped to the authenticated user.
//
// Keep this in lockstep with `packages/shared/src/contracts/timeline.ts`. The
// server emits camelCase JSON, so the default `Codable` synthesis maps 1:1.

// MARK: - Validation / limits

enum TimelineValidation {
    static let maxTextLength = 2000
    static let maxImages = 9

    /// Trim and clamp raw post text the way `timelineTextSchema` does before sending.
    static func normalize(_ raw: String) -> String {
        String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxTextLength))
    }
}

/// Content types the upload endpoint accepts. The client always sends JPEG
/// (re-encoded from the picked/captured image), but the full set is mirrored.
enum TimelineImageContentType: String {
    case jpeg = "image/jpeg"
    case png = "image/png"
    case webp = "image/webp"
    case heic = "image/heic"

    /// File extension used in the multipart filename (informational for the server).
    var fileExtension: String {
        switch self {
        case .jpeg: return "jpg"
        case .png: return "png"
        case .webp: return "webp"
        case .heic: return "heic"
        }
    }
}

// MARK: - Requests / responses

/// A reference to an uploaded image — the relative url the server issued.
struct TimelineImage: Codable, Equatable, Hashable {
    let url: String
}

struct CreateTimelinePostInput: Encodable {
    let text: String
    let images: [TimelineImage]
}

struct TimelinePostDTO: Decodable, Identifiable, Equatable {
    let id: String
    let text: String
    let images: [TimelineImage]
    let createdAt: String // ISO 8601
    let updatedAt: String // ISO 8601
}

/// Result of a successful image upload (the server also returns `contentType`).
struct TimelineImageDTO: Decodable {
    let url: String
}

struct TimelinePostsResponse: Decodable {
    let ok: Bool
    let posts: [TimelinePostDTO]
}

struct TimelinePostResponse: Decodable {
    let ok: Bool
    let post: TimelinePostDTO
}

struct TimelineImageResponse: Decodable {
    let ok: Bool
    let image: TimelineImageDTO
}

// MARK: - Error codes (stable, client-switchable)

enum TimelineErrorCode: String, Decodable, Sendable {
    case invalidRequest = "INVALID_REQUEST"
    case unauthorized = "UNAUTHORIZED"
    case postNotFound = "TIMELINE_POST_NOT_FOUND"
    case imageTooLarge = "IMAGE_TOO_LARGE"
    case unsupportedImageType = "UNSUPPORTED_IMAGE_TYPE"
    /// Fallback for any code the server adds before this client is updated.
    case unknown = "UNKNOWN"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TimelineErrorCode(rawValue: raw) ?? .unknown
    }
}

// MARK: - Endpoint paths (shared so the client never hard-codes strings)

enum TimelineRoutes {
    static let list = "/timeline"
    static let create = "/timeline"
    static let uploadImage = "/timeline/images"

    /// Path for a single post (delete).
    static func item(_ id: String) -> String { "/timeline/\(id)" }
}

// MARK: - URL resolution

extension TimelineImage {
    /// Resolve the server-relative `/uploads/…` url against the API base.
    func absoluteURL(base: URL) -> URL? {
        URL(string: url, relativeTo: base)?.absoluteURL
    }
}
