import SwiftUI

/// The card actions, shared by the hover buttons, poster context menus and
/// their accessibility actions. Each records its outcome in `titleState`, so
/// every card showing the same title agrees without refetching its list.
extension AppModel {
    /// Admin quick-add to Radarr/Sonarr.
    func quickAdd(_ id: API.TitleID) async throws {
        let api = self.api
        try await api.titles.add(id.mediaType, id: id.tmdbId)
        // Remember it, so this card (and the same title in any other list)
        // stops offering an add the next time it's drawn — the lists
        // themselves deliberately don't refetch on your own action.
        let status = try? await api.titles.status(id.mediaType, id: id.tmdbId)
        titleState.added(id, status: status?.library.status)
    }

    /// Member request.
    func requestTitle(_ id: API.TitleID) async throws {
        try await api.requests.create(id.mediaType, id: id.tmdbId)
        titleState.requested(id)
    }

    /// Sets a star; returns the state the server reports.
    @discardableResult
    func setFavorite(_ favorited: Bool, _ target: FavoriteTarget) async throws -> Bool {
        let result = try await api.favorites.set(favorited, target.entityType, id: target.tmdbId)
        titleState.favoriteChanged(target.entityType, target.tmdbId, to: result)
        return result
    }

    /// Whether `target` is starred, counting anything changed from this Mac.
    func isFavorited(_ target: FavoriteTarget) -> Bool {
        titleState.favorited(target.entityType, target.tmdbId) ?? target.favorited
    }
}

/// components/favorite-button.tsx — star toggle; the full variant is a pill.
/// The server sends the state with whatever list the card came from, so the
/// button starts correct and only writes.
struct FavoriteButton: View {
    let target: FavoriteTarget
    var compact = false

    @Environment(AppModel.self) private var model
    /// The optimistic state while a write is in flight.
    @State private var favorited: Bool?
    @State private var pending = false

    private var isOn: Bool { favorited ?? model.isFavorited(target) }

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
        Task {
            do {
                try await model.setFavorite(next, target)
            } catch {
                model.flash(error: error)
            }
            // The store has the answer now (or still the old state on failure).
            favorited = nil
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
        Task {
            do {
                try await model.quickAdd(id)
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
        Task {
            do {
                try await model.requestTitle(id)
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
