import SwiftUI

/// components/favorite-button.tsx — star toggle; the full variant is a pill.
/// The server sends the state with whatever list the card came from, so the
/// button starts correct and only writes.
struct FavoriteButton: View {
    let target: FavoriteTarget
    var compact = false

    @Environment(AppModel.self) private var model
    @State private var favorited: Bool?
    @State private var pending = false

    private var isOn: Bool { favorited ?? target.favorited }

    var body: some View {
        Button {
            toggle()
        } label: {
            if compact {
                Image(systemName: isOn ? "star.fill" : "star")
                    .font(.system(size: 12))
                    .foregroundStyle(isOn ? Theme.accent : Theme.textMuted)
                    .frame(width: 20, height: 20)
                    .contentShape(Rectangle())
            } else {
                HStack(spacing: 6) {
                    Image(systemName: isOn ? "star.fill" : "star")
                    Text(isOn ? "Favorited" : "Favorite")
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(isOn ? Theme.accent : Theme.textSecondary)
                .padding(.horizontal, 13)
                .padding(.vertical, 6)
                .background(Capsule().fill(isOn ? Theme.accent.opacity(0.1) : .clear))
                .overlay(Capsule().strokeBorder(isOn ? Theme.accent : Theme.border))
                .contentShape(Capsule())
            }
        }
        .buttonStyle(.plain)
        .disabled(pending || model.viewer == nil)
        .help(isOn ? "Remove from favorites" : "Add to favorites")
        .onChange(of: target) { _, _ in
            // A reload re-rendered this card with the server's state.
            favorited = nil
        }
    }

    private func toggle() {
        let next = !isOn
        pending = true
        favorited = next
        let api = model.api
        Task {
            do {
                favorited = try await api.favorites.set(next, target.entityType, id: target.tmdbId)
            } catch {
                favorited = !next
                model.flash(error: error)
            }
            pending = false
        }
    }
}

/// components/quick-add-button.tsx — hover-revealed "+ Add to Radarr/Sonarr".
struct QuickAddButton: View {
    let id: API.TitleID

    @Environment(AppModel.self) private var model
    @State private var pending = false
    @State private var error: String?
    @State private var done = false

    var body: some View {
        if !done {
            VStack(spacing: 3) {
                Button {
                    add()
                } label: {
                    Text(pending ? "Adding…" : "+ Add to \(id.mediaType.arrName)")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(AccentButtonStyle(compact: true))
                .disabled(pending)
                if let error {
                    Text(error)
                        .font(.system(size: 9))
                        .foregroundStyle(Theme.danger)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.bg0.opacity(0.9), in: RoundedRectangle(cornerRadius: 4))
                        .lineLimit(2)
                }
            }
        }
    }

    private func add() {
        pending = true
        error = nil
        let api = model.api
        Task {
            do {
                try await api.titles.add(id.mediaType, id: id.tmdbId)
                done = true
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

/// components/request-button.tsx — members request instead of adding.
struct RequestButton: View {
    let id: API.TitleID
    var compact = false
    var alreadyRequested = false

    @Environment(AppModel.self) private var model
    @State private var pending = false
    @State private var requested = false
    @State private var error: String?

    var body: some View {
        if requested || alreadyRequested {
            Text(compact ? "Requested" : "Requested — waiting for approval")
                .font(.system(size: compact ? 10 : 12, weight: .medium))
                .foregroundStyle(Theme.tracked)
                .padding(.horizontal, compact ? 8 : 14)
                .padding(.vertical, compact ? 4 : 6)
                .frame(maxWidth: compact ? .infinity : nil)
                .background(Capsule().fill(Theme.trackedBg))
        } else {
            VStack(alignment: compact ? .center : .leading, spacing: 4) {
                Button {
                    submit()
                } label: {
                    Text(pending ? "Requesting…" : "Request")
                        .frame(maxWidth: compact ? .infinity : nil)
                }
                .buttonStyle(AccentButtonStyle(compact: compact))
                .disabled(pending)
                if let error {
                    Text(error)
                        .font(.system(size: compact ? 9 : 12))
                        .foregroundStyle(Theme.danger)
                        .lineLimit(3)
                }
            }
        }
    }

    private func submit() {
        pending = true
        error = nil
        let api = model.api
        Task {
            do {
                try await api.requests.create(id.mediaType, id: id.tmdbId)
                requested = true
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

/// A button that runs an async action with an in-flight label and error slot.
struct AsyncActionButton: View {
    let title: String
    var pendingTitle: String?
    var style: Style = .accent
    let action: () async throws -> Void
    var onError: ((Error) -> Void)?

    enum Style {
        case accent
        case outline
        case destructive
    }

    @State private var pending = false

    var body: some View {
        let button = Button {
            pending = true
            Task {
                do {
                    try await action()
                } catch {
                    onError?(error)
                }
                pending = false
            }
        } label: {
            Text(pending ? (pendingTitle ?? title) : title)
        }
        .disabled(pending)

        switch style {
        case .accent: button.buttonStyle(AccentButtonStyle())
        case .outline: button.buttonStyle(OutlineButtonStyle())
        case .destructive: button.buttonStyle(OutlineButtonStyle(tint: Theme.danger))
        }
    }
}
