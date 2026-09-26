import Foundation

/// "Everyone's requests" (0.48+, app/requests/page.tsx `EveryonesRequests`):
/// what the rest of the household has asked for, for someone who may see
/// everyone's requests (`viewRequests`) but not review them — to look at, no
/// buttons. Built from `/requests/pending` and `/requests/history`.
struct EveryoneRequestRow: Hashable, Sendable, Identifiable {
    let id: UUID
    let titleID: API.TitleID
    let title: String
    let posterPath: API.ImageRef?
    /// "Seasons 1–3 · In 4K".
    let detailLine: String?
    let requestedBy: String
    let createdAt: Date
    /// "Waiting for review" while pending, else the server's label.
    let statusLabel: String
    let tone: BadgeTone

    init(_ request: API.PendingRequest) {
        id = request.id
        titleID = request.titleID
        title = request.title
        posterPath = request.posterPath
        detailLine = request.detailLine
        requestedBy = request.requestedBy.label
        createdAt = request.createdAt
        statusLabel = "Waiting for review"
        tone = .tracked
    }

    init(_ request: API.ReviewedRequest) {
        id = request.id
        titleID = request.titleID
        title = request.title
        posterPath = request.posterPath
        detailLine = request.detailLine
        requestedBy = request.requestedBy.label
        createdAt = request.createdAt
        statusLabel = request.status == .pending ? "Waiting for review" : request.statusLabel
        tone = request.status == .approved ? .owned : request.status == .pending ? .tracked : .neutral
    }

    /// Everyone else's requests, pending and reviewed, newest first. Your
    /// own are left out (they're listed above, with their buttons).
    static func rows(pending: [API.PendingRequest], reviewed: [API.ReviewedRequest], excluding viewerId: UUID?) -> [EveryoneRequestRow] {
        let mine: (API.RequestPerson) -> Bool = { person in
            guard let viewerId, let userId = person.userId else { return false }
            return userId == viewerId
        }
        let others = pending.filter { !mine($0.requestedBy) }.map(EveryoneRequestRow.init)
            + reviewed.filter { !mine($0.requestedBy) }.map(EveryoneRequestRow.init)
        // Stable for equal dates: pending first, as listed.
        return others.enumerated()
            .sorted { $0.element.createdAt != $1.element.createdAt ? $0.element.createdAt > $1.element.createdAt : $0.offset < $1.offset }
            .map(\.element)
    }
}
