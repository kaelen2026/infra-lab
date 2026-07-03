import Foundation

/// The shape a platform SDK implements for the timeline feature. Transport
/// mirrors ``TodoClient``: native sends `Authorization: Bearer <accessToken>`
/// (read from the shared ``TokenStore``). Mirrors the `TimelineClient` interface
/// in `@infra/shared`.
protocol TimelineClient {
    /// Fetch one page, newest first. `cursor` is the previous page's `nextCursor`
    /// (nil ⇒ first page); `limit` of nil uses the server's default page size.
    func list(cursor: String?, limit: Int?) async throws -> TimelinePage
    /// Upload one image; returns the reference to attach to a post.
    func uploadImage(_ data: Data, contentType: TimelineImageContentType) async throws -> TimelineImage
    func create(text: String, images: [TimelineImage]) async throws -> TimelinePostDTO
    func remove(id: String) async throws
}

extension TimelineClient {
    /// The first page with the server's default page size.
    func list() async throws -> TimelinePage {
        try await list(cursor: nil, limit: nil)
    }
}

/// Transport-level failure of a timeline request. Non-2xx responses surface a
/// stable ``TimelineErrorCode``; the view model collapses everything to a generic
/// message, mirroring the todo client.
enum TimelineClientError: Error {
    case http(status: Int, code: TimelineErrorCode)
    case transport(Error)
    case decoding(Error)

    var code: TimelineErrorCode? {
        if case let .http(_, code) = self { return code }
        return nil
    }
}

/// URLSession-backed timeline client. Reuses the auth ``TokenStore`` so the
/// Bearer header stays in lockstep with the session established at login.
final class HTTPTimelineClient: TimelineClient {
    private let baseURL: URL
    private let store: TokenStore
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL, store: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.store = store
        self.session = session
    }

    // MARK: TimelineClient

    func list(cursor: String?, limit: Int?) async throws -> TimelinePage {
        var query: [URLQueryItem] = []
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let limit { query.append(URLQueryItem(name: "limit", value: String(limit))) }
        let res: TimelinePostsResponse = try await send(
            TimelineRoutes.list, method: "GET",
            body: Optional<CreateTimelinePostInput>.none, query: query
        )
        return TimelinePage(posts: res.posts, nextCursor: res.nextCursor)
    }

    func create(text: String, images: [TimelineImage]) async throws -> TimelinePostDTO {
        let res: TimelinePostResponse = try await send(
            TimelineRoutes.create, method: "POST",
            body: CreateTimelinePostInput(text: text, images: images)
        )
        return res.post
    }

    func remove(id: String) async throws {
        struct OkResponse: Decodable { let ok: Bool }
        let _: OkResponse = try await send(
            TimelineRoutes.item(id), method: "DELETE", body: Optional<CreateTimelinePostInput>.none
        )
    }

    func uploadImage(_ data: Data, contentType: TimelineImageContentType) async throws -> TimelineImage {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent(TimelineRoutes.uploadImage))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        authorize(&request)

        var body = Data()
        body.appendString("--\(boundary)\r\n")
        body.appendString(
            "Content-Disposition: form-data; name=\"file\"; filename=\"upload.\(contentType.fileExtension)\"\r\n"
        )
        body.appendString("Content-Type: \(contentType.rawValue)\r\n\r\n")
        body.append(data)
        body.appendString("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let res: TimelineImageResponse = try await perform(request)
        return TimelineImage(url: res.image.url)
    }

    // MARK: - Transport

    /// Attach the Bearer token when a session is present (timeline is user-scoped).
    private func authorize(_ request: inout URLRequest) {
        if let tokens = store.load() {
            request.setValue(
                "\(tokens.tokenType) \(tokens.accessToken)", forHTTPHeaderField: "Authorization"
            )
        }
    }

    private func send<Body: Encodable, Response: Decodable>(
        _ path: String, method: String, body: Body?, query: [URLQueryItem] = []
    ) async throws -> Response {
        var url = baseURL.appendingPathComponent(path)
        if !query.isEmpty,
           var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = query
            url = components.url ?? url
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        authorize(&request)
        if let body {
            request.httpBody = try encoder.encode(body)
        }
        return try await perform(request)
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw TimelineClientError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw TimelineClientError.transport(URLError(.badServerResponse))
        }

        guard (200..<300).contains(http.statusCode) else {
            let parsed = try? decoder.decode(TimelineErrorBody.self, from: data)
            throw TimelineClientError.http(status: http.statusCode, code: parsed?.code ?? .unknown)
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw TimelineClientError.decoding(error)
        }
    }
}

/// Error payload shape shared by the timeline endpoints (mirrors TodoErrorBody).
struct TimelineErrorBody: Decodable {
    let code: TimelineErrorCode?
}

private extension Data {
    /// Append a UTF-8 string; drops it silently if it somehow can't encode
    /// (never happens for the ASCII multipart preamble) — avoids a force-unwrap.
    mutating func appendString(_ string: String) {
        if let encoded = string.data(using: .utf8) { append(encoded) }
    }
}
