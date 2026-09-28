import SwiftUI

// MARK: - Notifications (components/notifications-bell.tsx)

/// The notifications list, opened from the bell on the rail (a popover on
/// the Mac, a sheet on iPhone).
struct NotificationsPopover: View {
    @Environment(AppModel.self) private var model
    let dismiss: () -> Void
    /// Fills the space it's given (the iPhone sheet) instead of sizing itself
    /// like a popover.
    var fillsSpace = false

    @State private var items: [API.NotificationItem] = []
    @State private var loaded = false
    @State private var error: String?

    /// A ScrollView has no height of its own, so the list has to be told one:
    /// tall enough for what's there, capped so the popover can't outgrow a
    /// laptop screen. Roughly one row per 54pt, plus the list's own padding.
    private var listHeight: CGFloat {
        min(max(CGFloat(items.count) * 54 + 12, 160), 560)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The iPhone sheet names itself in its navigation bar instead.
            if !fillsSpace {
                HStack {
                    Text("Notifications")
                        .font(.system(size: Metrics.text(13), weight: .semibold))
                    Spacer()
                    if items.contains(where: { !$0.read }) {
                        Button("Mark all read") { markAllRead() }
                            .buttonStyle(QuietButtonStyle())
                            .font(.system(size: Metrics.text(11.5)))
                    }
                }
                .padding(12)
                Divider()
            }
            if let error {
                InlineMessage(text: error)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if !loaded {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity)
                    .padding(28)
            } else if items.isEmpty {
                Text("No notifications yet.")
                    .font(.system(size: Metrics.text(12)))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(28)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(items) { item in
                            NotificationRow(item: item) { open(item) }
                        }
                    }
                    .padding(6)
                }
                .frame(height: fillsSpace ? nil : listHeight)
            }
            if fillsSpace { Spacer(minLength: 0) }
        }
        .frame(width: fillsSpace ? nil : 420)
        #if os(iOS)
        .navigationTitle("Notifications")
        .toolbar {
            if fillsSpace, items.contains(where: { !$0.read }) {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Mark all read") { markAllRead() }
                }
            }
        }
        #endif
        .task(id: model.events.remoteRevision(of: .notifications)) {
            await load()
        }
    }

    private func load() async {
        do {
            let list = try await model.api.notifications.list()
            if Task.isCancelled { return }
            items = list.results
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if items.isEmpty { self.error = error.localizedDescription }
        }
        loaded = true
    }

    private func markAllRead() {
        let api = model.api
        items = items.map { $0.markedRead() }
        Task {
            do {
                try await api.notifications.markAllRead()
            } catch {
                model.flash(error: error)
            }
        }
    }

    private func open(_ item: API.NotificationItem) {
        let api = model.api
        if !item.read {
            Task { try? await api.notifications.markRead(item.id) }
        }
        dismiss()
        model.openTitle(item.titleID)
    }
}

private struct NotificationRow: View {
    let item: API.NotificationItem
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 8) {
                Circle()
                    .fill(item.read ? Color.clear : Theme.accent)
                    .frame(width: 6, height: 6)
                    .padding(.top, 5)
                // A share leads with the sender's photo (initials without one).
                if item.eventType == .titleShared, let sender = item.sharedBy {
                    UserAvatarView(label: sender.label, avatarUrl: sender.avatarUrl, size: 28)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.message)
                        .font(.system(size: Metrics.text(12)))
                        .foregroundStyle(item.read ? Theme.textSecondary : Theme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    // The message already ends with the note; the website
                    // repeats it in quotes underneath, so it reads as theirs.
                    if item.eventType == .titleShared, let note = item.note.nonBlank {
                        Text("“\(note)”")
                            .font(.system(size: Metrics.text(12)))
                            .italic()
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(item.timeAgo())
                        .font(.system(size: Metrics.text(10.5)))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(8)
            .background(RoundedRectangle(cornerRadius: 8).fill(hovering ? Theme.bg2 : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}
