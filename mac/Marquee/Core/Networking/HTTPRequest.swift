import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

enum HTTPRequest {
    /// Joins a server base URL ("http://tower:3000/") with an API path,
    /// tolerating a trailing slash the same way `baseUrl.replace(/\/$/, "")` did.
    static func url(base: String, path: String, query: [String: String?] = [:]) -> URL? {
        var trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard var components = URLComponents(string: trimmed + path) else { return nil }
        let items = query.compactMap { name, value in value.map { URLQueryItem(name: name, value: $0) } }
        if !items.isEmpty {
            components.queryItems = (components.queryItems ?? []) + items.sorted { $0.name < $1.name }
            // URLComponents leaves "+" literal, which servers read as a space
            // ("Romeo + Juliet") — encode it like encodeURIComponent does.
            components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }
        return components.url
    }
}

enum AppInfo {
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
    }

    static var build: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    }

    /// Launched as the host of the unit tests (XCTest injects this variable).
    static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    static let repositoryURL = URL(string: "https://github.com/TimmyAmant/marquee")!
    static let issuesURL = URL(string: "https://github.com/TimmyAmant/marquee/issues")!
}
