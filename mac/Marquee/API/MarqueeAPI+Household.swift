import Foundation

// Notifications, the calendar, Settings → Activity and household accounts
// (api-v1.md §8–11).

extension MarqueeAPI {
    struct NotificationsEndpoints: Sendable {
        let transport: Transport

        /// `GET /notifications` — newest first, with the unread count.
        /// - Parameter limit: 1–100; the server's default (nil) is 20, the website's dropdown.
        func list(limit: Int? = nil) async throws -> API.NotificationList {
            try await transport.get("/notifications", query: ["limit": limit.map(String.init)])
        }

        /// `GET /notifications/unread-count`.
        func unreadCount() async throws -> Int {
            let count: API.Count = try await transport.get("/notifications/unread-count")
            return count.count
        }

        /// `POST /notifications/read-all` — "Mark all read".
        func markAllRead() async throws {
            let _: API.OK = try await transport.mutate(.post, "/notifications/read-all", changes: .notifications)
        }

        /// `POST /notifications/{id}/read`. `.notFound` for someone else's.
        func markRead(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(.post, "/notifications/\(MarqueeAPI.segment(id))/read", changes: .notifications)
        }

        /// `GET /notifications/stream` — new notifications the moment the
        /// server creates them, as Server-Sent Events (`ready`, then one
        /// `notification` per `API.NotificationItem`, `signed-out` once the
        /// token is revoked). Returns when the server closes the stream and
        /// throws when it drops; `.notFound` from a server that predates it.
        /// - Returns: The reconnection delay the server asked for, if any.
        func stream(onEvent: @escaping @Sendable (ServerSentEvent) async -> Void) async throws -> Duration? {
            try await transport.events("/notifications/stream", onEvent: onEvent)
        }
    }

    struct CalendarEndpoints: Sendable {
        let transport: Transport

        /// `GET /calendar?month=` — nil is the server's current month.
        func month(_ month: API.CalendarMonth? = nil) async throws -> API.CalendarMonthResponse {
            try await transport.get("/calendar", query: ["month": month?.string], timeout: Timeout.integrations)
        }
    }

    struct ActivityEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/activity` (admin) — the 50 most recent request events.
        func recent() async throws -> [API.ActivityItem] {
            let list: API.ListResponse<API.ActivityItem> = try await transport.get("/settings/activity")
            return list.results
        }
    }

    struct UsersEndpoints: Sendable {
        let transport: Transport

        /// `GET /users` — every account, oldest first (admin); only your own (member).
        func list() async throws -> [API.HouseholdMember] {
            let list: API.ListResponse<API.HouseholdMember> = try await transport.get("/users")
            return list.results
        }

        /// `POST /users` (admin) — "Add a household member". `.conflict` for a taken username.
        func create(_ request: API.CreateUserRequest) async throws -> API.HouseholdMember {
            try await transport.mutate(.post, "/users", body: request, changes: .users)
        }

        /// `PATCH /users/{id}` — yourself, or anyone (admin). When the result's
        /// `tokensRevoked` is true and it's your own account, this Mac is signed out.
        func update(_ id: UUID, _ request: API.UpdateUserRequest) async throws -> API.UpdateUserResult {
            try await transport.mutate(.patch, "/users/\(MarqueeAPI.segment(id))", body: request, changes: .users)
        }

        /// `DELETE /users/{id}` (admin) — removes a member and everything of theirs.
        func remove(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/users/\(MarqueeAPI.segment(id))", changes: [.users, .requests, .notifications]
            )
        }

        /// `GET /users/{id}/avatar` — the photo itself (a 512×512 JPEG), at the
        /// `avatarUrl` the server gave out. `.notFound` when there's none or
        /// it isn't yours to see.
        func avatar(at avatarUrl: String) async throws -> Data {
            try await transport.data(at: avatarUrl)
        }

        /// `PUT /users/{id}/avatar` — yours, or anyone's (admin). `data` is the
        /// image file (JPEG, PNG, WebP, GIF or AVIF, at most 15 MB; not HEIC);
        /// the server crops and re-encodes it.
        /// - Returns: The new `avatarUrl`.
        @discardableResult
        func setAvatar(_ id: UUID, data: Data, contentType: String) async throws -> String? {
            let result: API.AvatarResult = try await transport.upload(
                .put, "/users/\(MarqueeAPI.segment(id))/avatar",
                data: data, contentType: contentType, timeout: Timeout.integrations, changes: .users
            )
            return result.avatarUrl
        }

        /// `DELETE /users/{id}/avatar` — back to initials (fine if there's no photo).
        func removeAvatar(_ id: UUID) async throws {
            let _: API.AvatarResult = try await transport.mutate(.delete, "/users/\(MarqueeAPI.segment(id))/avatar", changes: .users)
        }
    }
}
