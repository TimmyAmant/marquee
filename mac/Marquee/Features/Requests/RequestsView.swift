import SwiftUI

/// app/requests/page.tsx — the review queue + history for whoever reviews
/// requests (the admin or a trusted member), or a member's own requests.
struct RequestsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("Requests")
                    .font(.marqueeDisplay(32))
                    .foregroundStyle(Theme.textPrimary)
                // The admin's and trusted members' (lib/users/roles.ts).
                if model.viewer?.canReviewRequests == true {
                    AdminRequestsList()
                } else {
                    MemberRequestsList()
                    IssuesSection(isAdmin: false)
                }
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 32)
            .frame(maxWidth: 1080, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollsUnderNavRail()
        .background(Theme.bg0)
        .navigationTitle("Requests")
    }
}

private struct RequestPoster: View {
    let posterPath: API.ImageRef?

    var body: some View {
        RemoteImage(posterPath, size: .w92, showsShimmer: false)
            .frame(width: 40, height: 56)
            .background(Theme.bg2)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

private struct TableCard<Content: View>: View {
    let columns: [String]
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(Array(columns.enumerated()), id: \.offset) { index, column in
                    Text(column)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.textMuted)
                        .frame(maxWidth: index == 0 ? .infinity : 170, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Theme.bg1)
            Divider().overlay(Theme.border)
            content()
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
    }
}

/// The poster and title, with the requested seasons ("Seasons 1–3") under the
/// title when the request was for some seasons rather than the whole series.
@MainActor
private func titleCell(
    _ title: String, _ posterPath: API.ImageRef?, detail: String? = nil, action: @escaping () -> Void
) -> some View {
    HStack(spacing: 12) {
        RequestPoster(posterPath: posterPath)
        VStack(alignment: .leading, spacing: 2) {
            Button(title, action: action)
                .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                .font(.system(size: 13, weight: .medium))
            if let detail {
                Text(detail)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }
}

// MARK: - Member view

private struct MemberRequestsList: View {
    @Environment(AppModel.self) private var model
    @State private var rows: [API.MyRequest]?
    @State private var error: String?
    /// "Movies: 3 of 5 requests left (every 7 days)" from `/me` (0.39+).
    @State private var limitsLine: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let limitsLine {
                Text(limitsLine)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
            }
            list
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .library), local: model.events.revision(of: .requests))) {
            // Every request made counts, so re-read the limits with the list.
            guard let me = try? await model.api.me(), !Task.isCancelled else { return }
            limitsLine = me.requestLimits?.summaryLine()
        }
    }

    @ViewBuilder
    private var list: some View {
        Group {
            if let rows {
                if rows.isEmpty {
                    Text("You haven't requested anything yet — find a title and hit Request.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    TableCard(columns: ["Title", "Requested", "Status"]) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { Divider().overlay(Theme.border) }
                            HStack(spacing: 0) {
                                titleCell(row.title, row.posterPath, detail: row.detailLine) { model.openTitle(row.titleID) }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(Format.shortDate(row.createdAt))
                                    .foregroundStyle(Theme.textSecondary)
                                    .frame(width: 170, alignment: .leading)
                                VStack(alignment: .leading, spacing: 4) {
                                    TonePill(text: row.statusLabel, tone: row.statusTone.badgeTone)
                                    // The admin's reason, under "Declined" like the web page.
                                    if let reason = row.rejectionReason {
                                        RejectionReasonLine(reason: reason)
                                    }
                                }
                                .frame(width: 170, alignment: .leading)
                            }
                            .font(.system(size: 13))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                        }
                    }
                }
            } else if let error {
                InlineMessage(text: error)
            } else {
                LoadingView()
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .library), local: model.events.revision(of: .requests))) {
            do {
                let fresh = try await model.api.requests.mine()
                if Task.isCancelled { return }
                rows = fresh
                error = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if rows == nil { self.error = error.localizedDescription }
            }
        }
    }
}

// MARK: - Admin view

private struct AdminRequestsList: View {
    @Environment(AppModel.self) private var model

    @State private var queue: API.PendingRequests?
    @State private var reviewed: [API.ReviewedRequest] = []
    @State private var loadError: String?
    @State private var historyError: String?
    @State private var approvingAll = false
    @State private var approveAllMessage: (String, Bool)?
    /// Rows hidden right after a successful action, like the web row.
    @State private var settled: Set<UUID> = []

    private var pending: [API.PendingRequest] {
        (queue?.results ?? []).filter { !settled.contains($0.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if queue != nil {
                if pending.count > 1 || approvingAll || approveAllMessage != nil {
                    HStack {
                        if let approveAllMessage {
                            InlineMessage(text: approveAllMessage.0, isError: approveAllMessage.1)
                        }
                        Spacer()
                        Button(approvingAll ? "Approving…" : "Approve all") { approveAll() }
                            .buttonStyle(AccentButtonStyle())
                            .disabled(approvingAll)
                    }
                }

                if pending.isEmpty {
                    Text("No pending requests.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    TableCard(columns: ["Title", "Requested by", "Requested", "Actions"]) {
                        ForEach(Array(pending.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { Divider().overlay(Theme.border) }
                            RequestReviewRow(
                                row: row,
                                manualSonarrURL: queue?.manualSonarrAddURL(for: row),
                                rejectionReasons: queue?.rejectionReasonChoices ?? API.PendingRequests.defaultRejectionReasons,
                                onSettled: { settled.insert(row.id) }
                            )
                        }
                    }
                }
            } else if let loadError {
                InlineMessage(text: loadError)
            } else {
                LoadingView(label: "Checking requests against your library…")
            }

            // "Can't find" (0.46+), then problem reports, between the queue
            // and "Past requests", like app/requests/page.tsx.
            NotFoundSection(topPadding: 28)
            IssuesSection(isAdmin: true, topPadding: 28)

            if reviewed.isEmpty, let historyError {
                SectionTitle(text: "Past requests")
                    .padding(.top, 28)
                InlineMessage(text: historyError)
            }

            if !reviewed.isEmpty {
                SectionTitle(text: "Past requests")
                    .padding(.top, 28)
                TableCard(columns: ["Title", "Requested by", "Requested", "Status"]) {
                    ForEach(Array(reviewed.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Divider().overlay(Theme.border) }
                        HStack(spacing: 0) {
                            titleCell(row.title, row.posterPath, detail: row.detailLine) { model.openTitle(row.titleID) }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(row.requestedBy.label)
                                .foregroundStyle(Theme.textSecondary)
                                .frame(width: 170, alignment: .leading)
                            Text(Format.shortDate(row.createdAt))
                                .foregroundStyle(Theme.textSecondary)
                                .frame(width: 170, alignment: .leading)
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    TonePill(text: row.statusLabel, tone: row.status == .approved ? .owned : .neutral)
                                    // 0.46+: Sonarr/Radarr hasn't found it (listed under "Can't find").
                                    if row.isNotFound, let since = row.notFoundSince {
                                        TonePill(text: "Can't find", tone: .danger)
                                            .help("Sonarr/Radarr hasn't found it since \(Format.shortDate(since))")
                                    }
                                }
                                if let reason = row.rejectionReason {
                                    RejectionReasonLine(reason: reason)
                                }
                                // 0.43+: "Added to Radarr 2", like the web page.
                                if let addedTo = row.addedToLine {
                                    Text(addedTo)
                                        .font(.system(size: 11.5))
                                        .foregroundStyle(Theme.textMuted)
                                }
                            }
                            .frame(width: 170, alignment: .leading)
                        }
                        .font(.system(size: 13))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                }
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .library), local: model.events.revision(of: .requests))) {
            await load()
        }
    }

    private func load() async {
        let api = model.api
        do {
            let fresh = try await api.requests.pending()
            if Task.isCancelled { return }
            queue = fresh
            settled = []
            loadError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if queue == nil { loadError = error.localizedDescription }
        }
        // "Past requests" is a separate call. A failure keeps what's already
        // shown, and says so only when there's nothing to show.
        do {
            let history = try await api.requests.history()
            if Task.isCancelled { return }
            reviewed = history
            historyError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if reviewed.isEmpty { historyError = error.localizedDescription }
        }
    }

    private func approveAll() {
        approvingAll = true
        approveAllMessage = nil
        let api = model.api
        Task {
            do {
                let result = try await api.requests.approveAll()
                approveAllMessage = result.failedCount > 0
                    ? (result.message ?? "\(result.failedCount) request(s) couldn't be approved.", true)
                    : ("Approved \(result.approvedCount).", false)
            } catch {
                approveAllMessage = (error.localizedDescription, true)
            }
            approvingAll = false
        }
    }
}

// MARK: - Problem reports

/// components/issues-section.tsx (0.38+): "Reported problems" for the admin
/// and trusted members (`isAdmin`: whoever reviews), "Your problem reports"
/// for a member. Nothing at all when there are none,
/// or when the server predates problem reports (`GET /issues` is a 404).
private struct IssuesSection: View {
    let isAdmin: Bool
    /// Space above the section, only while it shows anything.
    var topPadding: CGFloat = 0

    @Environment(AppModel.self) private var model
    @State private var list: API.IssueList?
    @State private var error: String?
    @State private var showFixed = false
    /// Rows hidden right after Mark fixed / Remove / Withdraw, until the reload lands.
    @State private var settled: Set<UUID> = []

    private var open: [API.Issue] { (list?.open ?? []).filter { !settled.contains($0.id) } }
    private var fixed: [API.Issue] { list?.fixed ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let list, !list.results.isEmpty {
                SectionTitle(text: isAdmin ? "Reported problems" : "Your problem reports")
                if open.isEmpty {
                    Text("Nothing open right now.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    issueCard(open)
                }
                if !fixed.isEmpty {
                    Button(showFixed ? "Hide fixed" : "Show fixed (\(fixed.count))") { showFixed.toggle() }
                        .buttonStyle(QuietButtonStyle(color: Theme.textSecondary))
                        .font(.system(size: 12))
                    if showFixed {
                        issueCard(fixed)
                            .opacity(0.8)
                    }
                }
            } else if list == nil, let error {
                SectionTitle(text: isAdmin ? "Reported problems" : "Your problem reports")
                InlineMessage(text: error)
            }
        }
        .padding(.top, (list?.results.isEmpty == false || (list == nil && error != nil)) ? topPadding : 0)
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .requests), local: model.events.revision(of: .requests))) {
            await load()
        }
    }

    private func issueCard(_ issues: [API.Issue]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(issues.enumerated()), id: \.element.id) { index, issue in
                if index > 0 { Divider().overlay(Theme.border) }
                IssueRow(issue: issue, isAdmin: isAdmin, onSettled: { settled.insert(issue.id) })
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
    }

    private func load() async {
        do {
            let fresh = try await model.api.issues.list()
            if Task.isCancelled { return }
            list = fresh
            settled = []
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            // A server older than 0.38: no problem reports to show.
            list = API.IssueList(results: [])
            error = nil
        } catch {
            if list == nil { self.error = error.localizedDescription }
        }
    }
}

/// components/issues-section.tsx `IssueCard`.
private struct IssueRow: View {
    let issue: API.Issue
    let isAdmin: Bool
    let onSettled: () -> Void

    @Environment(AppModel.self) private var model
    @State private var busy: String?
    @State private var error: String?
    @State private var info: String?
    /// "Mark fixed" opens a note field with its own "Mark fixed".
    @State private var resolving = false
    @State private var note = ""

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RequestPoster(posterPath: issue.posterPath)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Button(issue.title) { model.openTitle(issue.titleID) }
                        .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                        .font(.system(size: 13, weight: .medium))
                    if let label = issue.episodeLabel.nonBlank {
                        Text(label)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                Text(issue.summaryLine(showingReporter: isAdmin))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
                if let message = issue.message.nonBlank {
                    Text("“\(message)”")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                if let fixedLine = issue.fixedLine {
                    Text(fixedLine)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.owned)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if resolving {
                    HStack(spacing: 8) {
                        TextField("Note for them (optional), e.g. Replaced the file", text: $note)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12.5))
                            .onSubmit { resolve() }
                            .onChange(of: note) { _, value in
                                let scalars = value.unicodeScalars
                                if scalars.count > API.IssueResolution.maxNoteLength {
                                    note = String(scalars.prefix(API.IssueResolution.maxNoteLength))
                                }
                            }
                        Button(busy == "resolve" ? "Saving…" : "Mark fixed") { resolve() }
                            .buttonStyle(AccentButtonStyle(compact: true))
                            .disabled(busy != nil)
                    }
                    .padding(.top, 4)
                }
                if let error {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let info {
                    Text(info)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.owned)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if issue.status == .open {
                VStack(alignment: .trailing, spacing: 6) {
                    if isAdmin, !resolving {
                        Button(busy == "search" ? "Searching…" : "Search again") { searchAgain() }
                            .buttonStyle(OutlineButtonStyle(compact: true))
                            .disabled(busy != nil)
                        Button("Mark fixed") { resolving = true }
                            .buttonStyle(OutlineButtonStyle(compact: true))
                    }
                    if issue.isMine || isAdmin {
                        Button(issue.isMine && !isAdmin ? "Withdraw" : "Remove") { remove() }
                            .buttonStyle(QuietButtonStyle(color: Theme.textMuted))
                            .font(.system(size: 11.5))
                            .disabled(busy != nil)
                    }
                }
            }
        }
        .font(.system(size: 13))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    /// Runs one action; `after` is shown in place of reloading (Search again
    /// leaves the report open).
    private func run(_ label: String, after: String? = nil, _ action: @escaping @MainActor (MarqueeAPI) async throws -> Void) {
        busy = label
        error = nil
        info = nil
        let api = model.api
        Task {
            do {
                try await action(api)
                if let after {
                    info = after
                } else {
                    resolving = false
                    onSettled()
                }
            } catch {
                self.error = error.localizedDescription
            }
            busy = nil
        }
    }

    private func searchAgain() {
        run("search", after: "Searching for another copy…") { try await $0.issues.searchAgain(issue.id) }
    }

    private func resolve() {
        guard busy == nil else { return }
        let note = note
        run("resolve") { try await $0.issues.resolve(issue.id, note: note) }
    }

    private func remove() {
        run("delete") { try await $0.issues.delete(issue.id) }
    }
}

// MARK: - Can't find

/// components/not-found-section.tsx (0.46+): approved, released requests
/// Sonarr/Radarr still has nothing for, for whoever reviews. Nothing at all
/// when none are listed, or when the server predates it (a 404).
private struct NotFoundSection: View {
    /// Space above the section, only while it shows anything.
    var topPadding: CGFloat = 0

    @Environment(AppModel.self) private var model
    @State private var list: API.NotFoundRequests?
    @State private var error: String?
    /// Rows hidden right after Mark as found, until the reload lands.
    @State private var settled: Set<UUID> = []

    private var rows: [API.NotFoundRequest] { (list?.results ?? []).filter { !settled.contains($0.id) } }
    private var showsAnything: Bool { !rows.isEmpty || (list == nil && error != nil) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let list, !rows.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        SectionTitle(text: "Can't find")
                        TonePill(text: "\(rows.count)", tone: .danger)
                    }
                    Text(list.blurb)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Divider().overlay(Theme.border) }
                        NotFoundRow(row: row, onSettled: { settled.insert(row.id) })
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
            } else if list == nil, let error {
                SectionTitle(text: "Can't find")
                InlineMessage(text: error)
            }
        }
        .padding(.top, showsAnything ? topPadding : 0)
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .requests), local: model.events.revision(of: .requests))) {
            await load()
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.requests.notFound()
            if Task.isCancelled { return }
            list = fresh
            settled = []
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            // A server older than 0.46: nothing to show.
            list = .empty
            error = nil
        } catch {
            if list == nil { self.error = error.localizedDescription }
        }
    }
}

/// components/not-found-section.tsx `NotFoundCard`.
private struct NotFoundRow: View {
    let row: API.NotFoundRequest
    let onSettled: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var busy: String?
    @State private var error: String?
    @State private var info: String?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RequestPoster(posterPath: row.posterPath)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Button(row.title) { model.openTitle(row.titleID) }
                        .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                        .font(.system(size: 13, weight: .medium))
                    if let detail = row.detailLine {
                        Text(detail)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                // Re-render each minute so "can't find for 3 hours" stays current.
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    Text(row.summaryLine(now: context.date))
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                        .help("Since \(Format.dateTime(row.notFoundSince))")
                }
                if let hint = row.hint.nonBlank {
                    Text(hint)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
                if let error {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let info {
                    Text(info)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.owned)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 6) {
                Button(busy == "search" ? "Searching…" : "Search again") { searchAgain() }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(busy != nil)
                if let url = row.arrURL {
                    Button(row.openInArrTitle) { openURL(url) }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .help(url.absoluteString)
                }
                Button(busy == "dismiss" ? "Saving…" : "Mark as found") { dismiss() }
                    .buttonStyle(QuietButtonStyle(color: Theme.textMuted))
                    .font(.system(size: 11.5))
                    .disabled(busy != nil)
                    .help("Take it off this list for good. The request stays approved.")
            }
        }
        .font(.system(size: 13))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func searchAgain() {
        busy = "search"
        error = nil
        info = nil
        let api = model.api
        let id = row.id
        let done = row.searchingAgainLine
        Task {
            do {
                try await api.requests.searchNotFound(id)
                info = done
            } catch {
                self.error = error.localizedDescription
            }
            busy = nil
        }
    }

    private func dismiss() {
        busy = "dismiss"
        error = nil
        info = nil
        let api = model.api
        let id = row.id
        Task {
            do {
                try await api.requests.dismissNotFound(id)
                onSettled()
            } catch {
                self.error = error.localizedDescription
            }
            busy = nil
        }
    }
}

/// "Reason: …" under a Declined/Rejected pill (requests/page.tsx's second line).
private struct RejectionReasonLine: View {
    let reason: String

    var body: some View {
        Text("Reason: \(reason)")
            .font(.system(size: 11))
            .foregroundStyle(Theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// components/request-review-row.tsx.
private struct RequestReviewRow: View {
    let row: API.PendingRequest
    /// `{sonarrUrl}/add/new?term=…`, offered when Sonarr can't resolve the show.
    let manualSonarrURL: URL?
    /// What the Decline sheet lists, from the queue (or the built-in list).
    let rejectionReasons: [String]
    let onSettled: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var busy: String?
    // Separate slots like the web's per-button action states, so a later
    // Reject error doesn't hide the manual-approve path.
    @State private var approveError: String?
    @State private var otherError: String?
    @State private var showManualApprove = false
    /// Reject is a two-step, like the web row: the button opens the reason
    /// chooser, and only its Decline actually sends anything.
    @State private var choosingReason = false
    /// "Advanced" (0.43+): where and how Approve adds it. Untouched, Approve
    /// sends no body, as before.
    @State private var advanced = AdvancedAddOptions()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            mainRow
            if advanced.isExpanded && !showManualApprove {
                AddOptionsPanel(advanced: $advanced, mediaType: row.mediaType, tmdbId: row.tmdbId, is4k: row.is4k == true)
                    .padding(.leading, 52)
            }
        }
        .font(.system(size: 13))
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .sheet(isPresented: $choosingReason) {
            DeclineRequestSheet(title: row.title, requester: row.requestedBy.label, reasons: rejectionReasons) { reason in
                reject(reason: reason)
            }
        }
    }

    private var mainRow: some View {
        HStack(alignment: .top, spacing: 0) {
            titleCell(row.title, row.posterPath, detail: row.detailLine) { model.openTitle(row.titleID) }
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(row.requestedBy.label)
                .foregroundStyle(Theme.textSecondary)
                .frame(width: 170, alignment: .leading)
                .padding(.top, 18)
            Text(Format.shortDate(row.createdAt))
                .foregroundStyle(Theme.textSecondary)
                .frame(width: 170, alignment: .leading)
                .padding(.top, 18)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Button(busy == "reject" ? "Rejecting…" : "Reject") { choosingReason = true }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                    if showManualApprove {
                        Button(busy == "manual" ? "Approving…" : "Manually approve") { manuallyApprove() }
                            .buttonStyle(AccentButtonStyle(compact: true))
                            .help("Mark this approved without adding it via Sonarr — use once you've downloaded it yourself.")
                    } else {
                        Button(busy == "approve" ? "Approving…" : "Approve") { approve() }
                            .buttonStyle(AccentButtonStyle(compact: true))
                            .disabled(advanced.isLoading)
                    }
                }
                .disabled(busy != nil)
                if advanced.isOffered && !showManualApprove {
                    AdvancedAddToggle(advanced: $advanced)
                        .disabled(busy != nil)
                }
                if let error = approveError ?? otherError {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(error)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.danger)
                            .fixedSize(horizontal: false, vertical: true)
                        if showManualApprove, let manualSonarrURL {
                            Button("Add manually in Sonarr") { openURL(manualSonarrURL) }
                                .buttonStyle(QuietButtonStyle(color: Theme.accent))
                                .font(.system(size: 11))
                        }
                    }
                }
            }
            .frame(width: 170, alignment: .leading)
            .padding(.top, 12)
        }
    }

    private func run(_ label: String, _ action: @escaping @MainActor (MarqueeAPI) async throws -> Void) {
        busy = label
        otherError = nil
        if label == "approve" { approveError = nil }
        let api = model.api
        Task {
            do {
                try await action(api)
                // Hide immediately, like the web row — no second click window
                // while the list reloads.
                onSettled()
            } catch {
                if label == "approve" {
                    approveError = error.localizedDescription
                    if let failure = error as? APIError, failure.isSonarrUnresolvable {
                        showManualApprove = true
                    }
                } else {
                    otherError = error.localizedDescription
                }
            }
            busy = nil
        }
    }

    private func approve() {
        let overrides = advanced.overrides
        run("approve") { try await $0.requests.approve(row.id, overrides: overrides) }
    }

    private func reject(reason: String) {
        run("reject") { try await $0.requests.reject(row.id, reason: reason) }
    }

    private func manuallyApprove() {
        run("manual") { try await $0.requests.manuallyApprove(row.id) }
    }
}

/// The web row's Reject chooser as a sheet: the server's preset reasons plus
/// "Other" with a free-text field. Decline stays disabled until there's a
/// reason to send (the server checks again either way).
private struct DeclineRequestSheet: View {
    let title: String
    let requester: String
    let reasons: [String]
    /// Runs the reject with the chosen reason, after the sheet has closed.
    let onDecline: (String) -> Void

    /// The free-text choice. Only the chooser's label: what gets sent is the
    /// admin's own words, never this word itself.
    static let other = "Other"
    /// The server's cap, counted in Unicode scalars the way the server counts
    /// code points (not Characters, which would let a run of emoji through
    /// that the server then shortens), so what's typed is what's stored.
    static let maxReasonLength = 200

    @Environment(\.dismiss) private var dismiss
    @State private var choice: String?
    @State private var customReason = ""

    private var options: [String] { reasons + [Self.other] }

    /// What Decline would send: the preset, or the trimmed custom text.
    private var reason: String? {
        guard let choice else { return nil }
        guard choice == Self.other else { return choice }
        let trimmed = customReason.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Decline request")
                .font(.marqueeDisplay(22))
            Text("Let \(requester) know why \"\(title)\" isn't being added. They'll see it under Declined on their Requests page and in the notification.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Picker("Reason", selection: $choice) {
                ForEach(options, id: \.self) { option in
                    Text(option).tag(Optional(option))
                }
            }
            .pickerStyle(.radioGroup)
            .labelsHidden()
            .font(.system(size: 13))

            if choice == Self.other {
                TextField("Tell them why", text: $customReason)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))
                    .onChange(of: customReason) { _, value in
                        let scalars = value.unicodeScalars
                        if scalars.count > Self.maxReasonLength {
                            customReason = String(scalars.prefix(Self.maxReasonLength))
                        }
                    }
            }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button("Decline") { decline() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(reason == nil)
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Theme.bg1)
    }

    private func decline() {
        guard let reason else { return }
        dismiss()
        onDecline(reason)
    }
}
