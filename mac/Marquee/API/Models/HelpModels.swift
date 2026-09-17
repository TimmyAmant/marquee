import Foundation

// The Error reference (api-v1.md §15).

extension API {
    /// `GET /help/errors`: every user-facing error message, grouped by area.
    struct ErrorReferenceCategory: Codable, Hashable, Sendable, Identifiable {
        struct Entry: Codable, Hashable, Sendable, Identifiable {
            /// Exactly the text the app shows (`APIError`'s message).
            let message: String
            let meaning: String
            let whatToDo: String

            var id: String { message }
        }

        let title: String
        let entries: [Entry]

        var id: String { title }
    }
}

extension Array where Element == API.ErrorReferenceCategory {
    /// The reference entry for an error the app just showed, if there is one.
    func entry(for message: String) -> API.ErrorReferenceCategory.Entry? {
        lazy.flatMap(\.entries).first { $0.message == message }
    }
}
