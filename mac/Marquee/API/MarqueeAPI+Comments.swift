import Foundation

// Conversations (api-v1.md §7 "Conversations (0.46+)"): the comment thread on
// a request (`/requests/{id}/comments`) or a problem report
// (`/issues/{id}/comments`), between whoever asked or reported and the
// reviewers. `.notFound` for anyone else, and from an older server.

extension MarqueeAPI {
    struct CommentsEndpoints: Sendable {
        let transport: Transport

        /// `GET …/comments` — the thread, oldest first.
        func thread(_ parent: API.CommentParent) async throws -> API.CommentThread {
            try await transport.get(parent.path)
        }

        /// `POST …/comments` — "Send". `.invalid("Write something first.")`,
        /// `.rateLimited`, `.conflict("This conversation is full.")`.
        @discardableResult
        func add(_ body: String, to parent: API.CommentParent) async throws -> String {
            let result: API.CommentCreated = try await transport.mutate(
                .post, parent.path, body: API.CommentBody(body: body), changes: .requests
            )
            return result.commentId
        }

        /// `PATCH …/comments/{commentId}` — your own, within 15 minutes.
        func edit(_ commentId: String, in parent: API.CommentParent, body: String) async throws {
            let _: API.OK = try await transport.mutate(
                .patch, parent.path + "/" + MarqueeAPI.segment(commentId), body: API.CommentBody(body: body), changes: .requests
            )
        }

        /// `DELETE …/comments/{commentId}` — your own within 15 minutes, or (the admin) any.
        func delete(_ commentId: String, in parent: API.CommentParent) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, parent.path + "/" + MarqueeAPI.segment(commentId), changes: .requests
            )
        }
    }
}
