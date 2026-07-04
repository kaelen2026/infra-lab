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
    /// Read one post through the PUBLIC share endpoint (no auth) — backs the
    /// `infralab://timeline/<id>` deep link. Throws ``TimelineClientError`` with
    /// `.postNotFound` when the id is unknown.
    func getShared(id: String) async throws -> TimelinePostDTO
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

/// URLSession-backed timeline client. Rides the shared ``AuthorizedTransport`` so
/// the Bearer header — and the refresh-and-retry on a `401` — stays in lockstep
/// with the session established at login.
final class HTTPTimelineClient: TimelineClient {
    private let baseURL: URL
    private let transport: AuthorizedTransport
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL, transport: AuthorizedTransport) {
        self.baseURL = baseURL
        self.transport = transport
    }

    /// Convenience wiring for tests / standalone use: build a private transport +
    /// refresher over `session` and the auth ``TokenStore``. Production shares one
    /// transport across every client (see `InfraLabApp`).
    convenience init(baseURL: URL, store: TokenStore, session: URLSession = .shared) {
        let refresher = SessionRefresher(store: store) {
            try await AuthSession.rotateTokens(baseURL: baseURL, store: store, session: session)
        }
        let transport = AuthorizedTransport(store: store, session: session, refresher: refresher)
        self.init(baseURL: baseURL, transport: transport)
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

    func getShared(id: String) async throws -> TimelinePostDTO {
        let res: TimelinePostResponse = try await send(
            TimelineRoutes.share(id), method: "GET", body: Optional<CreateTimelinePostInput>.none
        )
        return res.post
    }

    func uploadImage(_ data: Data, contentType: TimelineImageContentType) async throws -> TimelineImage {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.appendString("--\(boundary)\r\n")
        body.appendString(
            "Content-Disposition: form-data; name=\"file\"; filename=\"upload.\(contentType.fileExtension)\"\r\n"
        )
        body.appendString("Content-Type: \(contentType.rawValue)\r\n\r\n")
        body.append(data)
        body.appendString("\r\n--\(boundary)--\r\n")
        let payload = body

        let res: TimelineImageResponse = try await request {
            var request = URLRequest(url: self.baseURL.appendingPathComponent(TimelineRoutes.uploadImage))
            request.httpMethod = "POST"
            request.setValue(
                "multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type"
            )
            request.httpBody = payload
            return request
        }
        return TimelineImage(url: res.image.url)
    }

    // MARK: - Transport

    private func send<Body: Encodable, Response: Decodable>(
        _ path: String, method: String, body: Body?, query: [URLQueryItem] = []
    ) async throws -> Response {
        let payload = try body.map { try encoder.encode($0) }
        return try await request {
            var url = self.baseURL.appendingPathComponent(path)
            if !query.isEmpty,
               var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
                components.queryItems = query
                url = components.url ?? url
            }
            var request = URLRequest(url: url)
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = payload
            return request
        }
    }

    /// Send `build`'s request over the shared transport (auth + refresh-retry) and
    /// map the result to a decoded response or a typed ``TimelineClientError``.
    private func request<Response: Decodable>(
        _ build: () -> URLRequest
    ) async throws -> Response {
        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport.send(build)
        } catch {
            throw TimelineClientError.transport(error)
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
