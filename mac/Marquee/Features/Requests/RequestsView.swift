import SwiftUI

/// app/requests/page.tsx — admin review queue + history, or a member's own requests.
struct RequestsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("Requests")
                    .font(.marqueeDisplay(32))
                    .foregroundStyle(Theme.textPrimary)
                if model.viewer?.isAdmin == true {
                    AdminRequestsList()
                } else {
                    MemberRequestsList()
                }
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 32)
            .frame(maxWidth: 1080, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
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

@MainActor
private func titleCell(_ title: String, _ posterPath: API.ImageRef?, action: @escaping () -> Void) -> some View {
    HStack(spacing: 12) {
        RequestPoster(posterPath: posterPath)
        Button(title, action: action)
            .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
            .font(.system(size: 13, weight: .medium))
    }
}

// MARK: - Member view

private struct MemberRequestsList: View {
    @Environment(AppModel.self) private var model
    @State private var rows: [API.MyRequest]?
    @State private var error: String?

    var body: some View {
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
                                titleCell(row.title, row.posterPath) { model.openTitle(row.titleID) }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(Format.shortDate(row.createdAt))
                                    .foregroundStyle(Theme.textSecondary)
                                    .frame(width: 170, alignment: .leading)
                                TonePill(text: row.statusLabel, tone: row.statusTone.badgeTone)
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

            if !reviewed.isEmpty {
                SectionTitle(text: "Past requests")
                    .padding(.top, 28)
                TableCard(columns: ["Title", "Requested by", "Requested", "Status"]) {
                    ForEach(Array(reviewed.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Divider().overlay(Theme.border) }
                        HStack(spacing: 0) {
                            titleCell(row.title, row.posterPath) { model.openTitle(row.titleID) }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(row.requestedBy.label)
                                .foregroundStyle(Theme.textSecondary)
                                .frame(width: 170, alignment: .leading)
                            Text(Format.shortDate(row.createdAt))
                                .foregroundStyle(Theme.textSecondary)
                                .frame(width: 170, alignment: .leading)
                            TonePill(text: row.statusLabel, tone: row.status == .approved ? .owned : .neutral)
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
        // "Past requests" is a separate call; a failure there just hides it.
        if let history = try? await api.requests.history(), !Task.isCancelled {
            reviewed = history
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

/// components/request-review-row.tsx.
private struct RequestReviewRow: View {
    let row: API.PendingRequest
    /// `{sonarrUrl}/add/new?term=…`, offered when Sonarr can't resolve the show.
    let manualSonarrURL: URL?
    let onSettled: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var busy: String?
    // Separate slots like the web's per-button action states, so a later
    // Reject error doesn't hide the manual-approve path.
    @State private var approveError: String?
    @State private var otherError: String?
    @State private var showManualApprove = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            titleCell(row.title, row.posterPath) { model.openTitle(row.titleID) }
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
                    Button(busy == "reject" ? "Rejecting…" : "Reject") { reject() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                    if showManualApprove {
                        Button(busy == "manual" ? "Approving…" : "Manually approve") { manuallyApprove() }
                            .buttonStyle(AccentButtonStyle(compact: true))
                            .help("Mark this approved without adding it via Sonarr — use once you've downloaded it yourself.")
                    } else {
                        Button(busy == "approve" ? "Approving…" : "Approve") { approve() }
                            .buttonStyle(AccentButtonStyle(compact: true))
                    }
                }
                .disabled(busy != nil)
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
        .font(.system(size: 13))
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
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
        run("approve") { try await $0.requests.approve(row.id) }
    }

    private func reject() {
        run("reject") { try await $0.requests.reject(row.id) }
    }

    private func manuallyApprove() {
        run("manual") { try await $0.requests.manuallyApprove(row.id) }
    }
}
