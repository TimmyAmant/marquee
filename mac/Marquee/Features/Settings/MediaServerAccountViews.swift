import SwiftUI

// Settings › Account, for servers with Plex/Jellyfin sign-in: your linked
// accounts, and (admin) importing household members plus the sign-up switch.

/// "Linked accounts": the Plex and Jellyfin accounts that sign in to yours.
struct LinkedAccountsCard: View {
    let viewer: API.User

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var busy: API.MediaServer?
    @State private var plexTask: Task<Void, Never>?
    @State private var linkingJellyfin = false
    @State private var error: String?
    @State private var notice: String?

    var body: some View {
        let linked = viewer.linked ?? LinkedAccounts()
        let info = model.session.serverInfo

        VStack(alignment: .leading, spacing: 12) {
            ForEach(API.MediaServer.allCases) { server in
                row(server, label: info.label(for: server), linked: linked.isLinked(server), offered: offers(server, info))
            }
            if busy == .plex, plexTask != nil {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Waiting for Plex… Finish signing in in the browser window that just opened.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Button("Cancel") { cancelPlex() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
            }
            if let error { InlineMessage(text: error) }
            if let notice { InlineMessage(text: notice, isError: false) }
            if viewer.hasPassword == false {
                Text("Your account has no Marquee password, so it signs in only with a linked account. Set one with Edit below to sign in with a username and password too.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(isPresented: $linkingJellyfin) {
            JellyfinLinkSheet { linked in
                if linked {
                    notice = "Your \(model.session.serverInfo.jellyfinName) account is linked."
                    model.refreshViewer()
                }
            }
            .environment(model)
        }
        .onDisappear { cancelPlex() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
            cancelPlex()
        }
    }

    private func offers(_ server: API.MediaServer, _ info: ServerInfo?) -> Bool {
        switch server {
        case .plex: info?.offersPlexSignIn == true
        case .jellyfin: info?.offersJellyfinSignIn == true
        }
    }

    private func row(_ server: API.MediaServer, label: String, linked: Bool, offered: Bool) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.textPrimary)
                Text(linked
                     ? "Linked: you can sign in with your \(label) account."
                     : (offered ? "Not linked." : "\(label) isn't connected to this server."))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
            Spacer()
            if linked {
                Button(busy == server ? "Unlinking…" : "Unlink") { unlink(server) }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
                    .disabled(busy != nil)
            } else if offered {
                Button("Link \(label)") { link(server) }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(busy != nil)
            }
        }
    }

    private func link(_ server: API.MediaServer) {
        error = nil
        notice = nil
        switch server {
        case .jellyfin:
            linkingJellyfin = true
        case .plex:
            linkPlex()
        }
    }

    private func linkPlex() {
        plexTask?.cancel()
        busy = .plex
        let api = model.api
        plexTask = Task {
            do {
                let start = try await api.links.plexStart()
                guard let url = start.url else {
                    throw APIError.server("Your Marquee server sent a Plex sign-in link this app couldn't open.")
                }
                openURL(url)
                _ = try await PlexPoll.run(expiresAt: start.expiresAt) {
                    try await api.links.plexPoll(handle: start.handle) ? true : nil
                }
                notice = "Your Plex account is linked."
                model.refreshViewer()
            } catch where PlexPoll.isCancellation(error) {
                return
            } catch {
                self.error = error.localizedDescription
            }
            busy = nil
            plexTask = nil
        }
    }

    private func cancelPlex() {
        plexTask?.cancel()
        plexTask = nil
        if busy == .plex { busy = nil }
    }

    private func unlink(_ server: API.MediaServer) {
        error = nil
        notice = nil
        busy = server
        let api = model.api
        Task {
            do {
                try await api.links.unlink(server)
                notice = "Your \(model.session.serverInfo.label(for: server)) account is unlinked."
                model.refreshViewer()
            } catch {
                self.error = error.localizedDescription
            }
            busy = nil
        }
    }
}

/// plex-watchlist.tsx: "Request from my Plex Watchlist". Account settings
/// loads `state` and shows this only while it's `available` (Plex linked).
struct PlexWatchlistCard: View {
    @Binding var state: API.PlexWatchlist?

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var approval: Task<Void, Never>?
    @State private var followUp: Task<Void, Never>?
    @State private var busy = false
    @State private var error: String?

    /// The first check runs in the background once it's on; fetch again
    /// after this to show its result.
    private static let firstCheckDelay: Duration = .seconds(8)

    var body: some View {
        card(state ?? .unavailable)
            .onDisappear { stopWaiting() }
            .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
                stopWaiting()
            }
    }

    private func card(_ state: API.PlexWatchlist) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Request from my Plex Watchlist")
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.textPrimary)
                    Text("New movies and shows you add to your Watchlist on Plex are requested for you, the same as pressing Request. Marquee keeps a Plex sign-in for this until you turn it off.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                if state.enabled {
                    TonePill(text: "On", tone: .owned, small: true)
                } else if approval == nil {
                    Button("Turn on") { turnOn() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .disabled(busy)
                }
            }

            if approval != nil {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Waiting for Plex… finish in the browser.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Button("Cancel") { stopWaiting() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
            }

            if state.enabled {
                HStack(spacing: 16) {
                    Toggle("Movies", isOn: Binding(
                        get: { state.movies },
                        set: { on in apply { api in try await api.plexWatchlist.setTypes(movies: on) } }
                    ))
                    Toggle("TV shows", isOn: Binding(
                        get: { state.tv },
                        set: { on in apply { api in try await api.plexWatchlist.setTypes(tv: on) } }
                    ))
                }
                .toggleStyle(.checkbox)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .disabled(busy)

                Text(state.statusLine())
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)

                HStack(spacing: 12) {
                    Button(busy ? "Checking…" : "Check now") {
                        apply { api in try await api.plexWatchlist.sync() }
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    Button("Turn off") {
                        apply { api in try await api.plexWatchlist.disable() }
                    }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
                }
                .disabled(busy)
            }

            if let lastError = state.lastError.nonBlank { InlineMessage(text: lastError) }
            if let error { InlineMessage(text: error) }
        }
    }

    /// Runs one change and shows the state it answers with.
    private func apply(_ change: @escaping @MainActor (MarqueeAPI) async throws -> API.PlexWatchlist) {
        busy = true
        error = nil
        let api = model.api
        Task {
            do {
                state = try await change(api)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    /// The same plex.tv approval as Link Plex, then the first check.
    private func turnOn() {
        approval?.cancel()
        error = nil
        let api = model.api
        approval = Task {
            do {
                let start = try await api.plexWatchlist.start()
                guard let url = start.url else {
                    throw APIError.server("Your Marquee server sent a Plex sign-in link this app couldn't open.")
                }
                openURL(url)
                state = try await PlexPoll.run(expiresAt: start.expiresAt) {
                    try await api.plexWatchlist.poll(handle: start.handle)
                }
                approval = nil
                refetchAfterFirstCheck()
            } catch where PlexPoll.isCancellation(error) {
                return
            } catch {
                self.error = error.localizedDescription
                approval = nil
            }
        }
    }

    private func refetchAfterFirstCheck() {
        followUp?.cancel()
        let api = model.api
        followUp = Task {
            try? await Task.sleep(for: Self.firstCheckDelay)
            if Task.isCancelled { return }
            if let fresh = try? await api.plexWatchlist.state(), !Task.isCancelled { state = fresh }
        }
    }

    private func stopWaiting() {
        approval?.cancel()
        approval = nil
        followUp?.cancel()
        followUp = nil
    }
}

/// Links the Jellyfin account a username and password sign in to.
private struct JellyfinLinkSheet: View {
    let onDone: (Bool) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var pending = false
    @State private var error: String?

    /// "Emby" when that's the connected server.
    private var name: String { model.session.serverInfo.jellyfinName }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Link \(name)")
                .font(.marqueeDisplay(22))
            Text("Sign in with your \(name) account to use it for Marquee too.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
            SettingsField(label: "\(name) username", text: $username)
            SettingsField(label: "\(name) password", text: $password, secure: true)
            if let error { InlineMessage(text: error) }
            HStack {
                Spacer()
                Button("Cancel") {
                    onDone(false)
                    dismiss()
                }
                .buttonStyle(OutlineButtonStyle())
                .keyboardShortcut(.cancelAction)
                Button(pending ? "Linking…" : "Link") { save() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending)
            }
        }
        .padding(24)
        .frame(width: 400)
        .background(Theme.bg1)
    }

    private func save() {
        let username = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !username.isEmpty, !password.isEmpty else {
            error = "Enter your \(name) username and password."
            return
        }
        pending = true
        error = nil
        let api = model.api
        let password = password
        Task {
            do {
                try await api.links.jellyfin(username: username, password: password)
                onDone(true)
                dismiss()
            } catch {
                self.password = ""
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

/// Admin: import household members from Plex/Jellyfin, and whether a
/// Plex/Jellyfin user without an account gets one on first sign-in.
struct MediaServerMembersCard: View {
    @Environment(AppModel.self) private var model
    @State private var settings: API.SignInSettings?
    @State private var unsupported = false
    @State private var saving = false
    @State private var error: String?
    @State private var importing: API.MediaServer?

    var body: some View {
        let info = model.session.serverInfo
        let servers = API.MediaServer.allCases.filter {
            $0 == .plex ? info?.offersPlexSignIn == true : info?.offersJellyfinSignIn == true
        }

        VStack(alignment: .leading, spacing: 12) {
            if servers.isEmpty {
                Text("Connect Plex or \(info.jellyfinName) in Settings › Integrations to import household members from it and let them sign in with those accounts.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: 10) {
                    ForEach(servers) { server in
                        Button("Import from \(info.label(for: server))") { importing = server }
                            .buttonStyle(OutlineButtonStyle(compact: true))
                    }
                }
            }
            if let settings, !unsupported {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("New accounts from Plex/\(info.jellyfinName) sign-in")
                            .font(.system(size: 13.5))
                            .foregroundStyle(Theme.textPrimary)
                        Text("When someone who can use your Plex or \(info.jellyfinName) server signs in without a Marquee account, create a member account for them. That includes anyone you remove here, who can come straight back. The sign-in screen tells newcomers to sign in that way. Off: only the people you import (or who link their account) can sign in that way.")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Toggle("New accounts from Plex/\(info.jellyfinName) sign-in", isOn: Binding(
                        get: { settings.mediaServerSignup },
                        set: { save($0) }
                    ))
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .disabled(saving)
                }
            }
            if let error { InlineMessage(text: error) }
        }
        .task {
            do {
                settings = try await model.api.users.signInSettings()
            } catch APIError.notFound {
                unsupported = true
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                self.error = error.localizedDescription
            }
        }
        .sheet(item: $importing) { server in
            ImportMembersSheet(server: server)
                .environment(model)
        }
    }

    private func save(_ on: Bool) {
        let previous = settings
        settings = API.SignInSettings(mediaServerSignup: on)
        saving = true
        error = nil
        let api = model.api
        Task {
            do {
                try await api.users.saveSignInSettings(API.SignInSettings(mediaServerSignup: on))
            } catch {
                settings = previous
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

/// "Import from Plex/Jellyfin": everyone the admin shares the server with,
/// each with a checkbox; existing members are listed but can't be picked.
private struct ImportMembersSheet: View {
    let server: API.MediaServer
    /// "Emby" rather than "Jellyfin" when that's the connected server.
    private var label: String { model.session.serverInfo.label(for: server) }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var candidates: [API.ImportCandidate]?
    @State private var selected: Set<API.ExternalID> = []
    @State private var pending = false
    @State private var error: String?
    @State private var result: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Import from \(label)")
                .font(.marqueeDisplay(22))
            Text("Each person you pick gets a member account linked to their \(label) account, so they can sign in with it.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Group {
                if let candidates {
                    if candidates.isEmpty {
                        Text("No \(label) users to import.")
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.textMuted)
                    } else {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(candidates) { candidate in
                                    candidateRow(candidate)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(maxHeight: 320)
                    }
                } else if error == nil {
                    ProgressView().controlSize(.small)
                }
            }

            if let error { InlineMessage(text: error) }
            if let result { InlineMessage(text: result, isError: false) }

            HStack {
                Spacer()
                Button(result == nil ? "Cancel" : "Done") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? "Importing…" : (selected.isEmpty ? "Import" : "Import \(selected.count)")) { importSelected() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending || selected.isEmpty)
            }
        }
        .toggleStyle(.checkbox)
        .padding(24)
        .frame(width: 440)
        .background(Theme.bg1)
        .task { await load() }
    }

    private func candidateRow(_ candidate: API.ImportCandidate) -> some View {
        HStack(spacing: 8) {
            Toggle(isOn: Binding(
                get: { candidate.alreadyMember || selected.contains(candidate.id) },
                set: { on in
                    if on { selected.insert(candidate.id) } else { selected.remove(candidate.id) }
                }
            )) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(candidate.label)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textPrimary)
                    if candidate.displayName.nonBlank != nil {
                        Text(candidate.username)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
            .disabled(candidate.alreadyMember || pending)
            Spacer()
            if candidate.alreadyMember {
                TonePill(text: "Already a member", tone: .neutral, small: true)
            }
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.users.importCandidates(from: server)
            candidates = fresh
            selected = selected.filter { id in fresh.contains { $0.id == id && !$0.alreadyMember } }
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func importSelected() {
        let ids = (candidates ?? []).map(\.id).filter { selected.contains($0) }
        guard !ids.isEmpty else { return }
        pending = true
        error = nil
        result = nil
        let api = model.api
        Task {
            do {
                let outcome = try await api.users.importMembers(from: server, ids: ids)
                selected = []
                result = Self.summary(created: outcome.created.count, skipped: outcome.skipped)
                await load()
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }

    static func summary(created: Int, skipped: Int) -> String {
        let made = created == 1 ? "Imported 1 member." : "Imported \(created) members."
        return skipped > 0 ? "\(made) \(skipped) skipped (already members, or couldn't be added)." : made
    }
}
