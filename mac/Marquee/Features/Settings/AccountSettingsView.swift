import SwiftUI
import UniformTypeIdentifiers

/// Settings › Account (app/settings/page.tsx), everyone's: who you are, your
/// own row of the household list, linked accounts, Trakt lists, and how
/// Marquee looks on this Mac. The household's accounts are under Members.
struct AccountSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system.rawValue
    /// Settings › Menu position (`NavRailPosition`), per Mac.
    @AppStorage(NavRailPosition.storageKey) private var menuPosition = NavRailPosition.left.rawValue
    /// Settings › Show menu labels, per Mac.
    @AppStorage(NavRailPosition.labelsStorageKey) private var menuLabels = false

    @State private var watchlist: API.PlexWatchlist?

    var body: some View {
        SettingsPane(
            title: String(localized: "Account"),
            subtitle: String(localized: "Your profile, how you sign in, and how Marquee looks on this device.")
        ) {
            if let viewer = model.viewer {
                SettingsSection(title: String(localized: "Profile")) {
                    SettingsGroup {
                        SettingsRow(label: String(localized: "Name")) { SettingsValue(text: viewer.displayName.nonBlank ?? "—") }
                        SettingsRow(label: String(localized: "Username")) { SettingsValue(text: viewer.username) }
                        SettingsRow(label: String(localized: "Role")) { SettingsValue(text: viewer.roleLabel) }
                        SettingsRow(label: String(localized: "Server")) { SettingsValue(text: model.session.server?.displayName ?? "—") }
                        SettingsRow(
                            label: String(localized: "Sign out"),
                            help: String(localized: "Signs you out of Marquee on this Mac.")
                        ) {
                            Button("Sign out") { model.signOut() }
                                .buttonStyle(OutlineButtonStyle())
                        }
                    }
                }

                SettingsSection(
                    title: String(localized: "Your account"),
                    subtitle: String(localized: "Edit your name, username, or password below.")
                ) {
                    HouseholdMembersCard(onlyYou: true)
                }

                // Servers with Plex/Jellyfin sign-in send `linked` on /me.
                if viewer.linked != nil {
                    SettingsSection(title: String(localized: "Linked accounts")) {
                        LinkedAccountsCard(viewer: viewer)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardSurface()
                        if watchlist?.available == true {
                            PlexWatchlistCard(state: $watchlist)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .cardSurface()
                        }
                    }
                }

                // 0.49+: keep public Trakt lists in sync (every account).
                TraktSyncsSection()

                // This Mac's own look: the theme, and which edge of the
                // window the menu floats on.
                SettingsSection(
                    title: String(localized: "Appearance"),
                    subtitle: String(localized: "How Marquee looks on this device.")
                ) {
                    SettingsGroup {
                        SettingsRow(label: String(localized: "Appearance")) {
                            Picker("Appearance", selection: $appearance) {
                                ForEach(AppearancePreference.allCases) { preference in
                                    Text(preference.label).tag(preference.rawValue)
                                }
                            }
                            .pickerStyle(.segmented)
                            .labelsHidden()
                            .frame(width: 210)
                        }
                        SettingsRow(
                            label: String(localized: "Menu position"),
                            help: String(localized: "Which edge of the window the menu sits on.")
                        ) {
                            Picker("Menu position", selection: $menuPosition) {
                                ForEach(NavRailPosition.allCases) { position in
                                    Text(position.label).tag(position.rawValue)
                                }
                            }
                            .pickerStyle(.segmented)
                            .labelsHidden()
                            .frame(width: 280)
                        }
                        SettingsRow(
                            label: String(localized: "Show menu labels"),
                            help: String(localized: "Names beside the menu's icons, and the server's version at the end.")
                        ) {
                            Toggle("Show menu labels", isOn: $menuLabels)
                                .toggleStyle(.switch)
                                .labelsHidden()
                        }
                        // 0.50+: the account's language, the same one the
                        // website uses; an older server can't keep one.
                        if viewer.sendsLanguage {
                            SettingsRow(
                                label: String(localized: "Language"),
                                help: String(localized: "The language Marquee is shown in for your account, on every device.")
                            ) {
                                LanguagePicker(viewer: viewer)
                            }
                        }
                    }
                }
            }
        }
        .task {
            // Which of Plex/Jellyfin are connected now (server-info.signIn).
            await model.session.refreshInfo()
        }
        .task(id: model.viewer?.linked) {
            // "Request from my Plex Watchlist" is on offer while Plex is
            // linked; unlinking also turns it off on the server. An older
            // server without it answers `.unavailable`.
            guard model.viewer?.linked != nil else { return }
            do {
                let fresh = try await model.api.plexWatchlist.state()
                if Task.isCancelled { return }
                watchlist = fresh
            } catch {
                // The card stays as it was; nothing else here depends on it.
            }
        }
    }
}

/// Settings › Members (the admin's): every account, adding one by hand or
/// from Plex/Jellyfin, and single sign-on.
struct MembersSettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        SettingsPane(
            title: String(localized: "Household members"),
            subtitle: String(localized: "Everyone with an account on this Marquee server.")
        ) {
            HouseholdMembersCard(onlyYou: false)

            SettingsSection(
                title: String(localized: "Add a household member"),
                subtitle: String(localized: "There's no public signup — create accounts for other people in your household here.")
            ) {
                CreateMemberForm()
                    .frame(maxWidth: .infinity)
                    .cardSurface()
            }

            if model.viewer?.linked != nil {
                SettingsSection(title: String(localized: "Plex and \(model.session.serverInfo.jellyfinName) members")) {
                    MediaServerMembersCard()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface()
                }
            }

            // 0.44+: single sign-on; nothing at all from an older server.
            SsoSettingsSection()
        }
        .task {
            await model.session.refreshInfo()
        }
    }
}

/// Settings › Blocklist: the admin's, or a member's it was handed to (0.48+).
struct BlocklistSettingsView: View {
    var body: some View {
        SettingsPane(
            title: String(localized: "Request blocklist"),
            subtitle: String(localized: "Titles and keywords nobody can request. You can still add them yourself.")
        ) {
            BlocklistSettingsSection()
        }
    }
}

/// household-members-list.tsx: `GET /users` returns every account for an
/// admin and only your own for a member. `onlyYou` keeps just your own row
/// (Settings › Account); Members shows them all.
private struct HouseholdMembersCard: View {
    let onlyYou: Bool

    @Environment(AppModel.self) private var model
    @State private var members: [API.HouseholdMember]?
    @State private var loadError: String?
    @State private var editing: API.HouseholdMember?
    @State private var removing: API.HouseholdMember?
    @State private var removeError: String?
    /// Whose profile is open (0.53+).
    @State private var profileOf: API.HouseholdMember?

    var body: some View {
        let isAdmin = model.viewer?.isAdmin == true
        let shown = onlyYou ? members?.filter(\.isCurrentUser) : members

        VStack(alignment: .leading, spacing: 12) {
            if let shown {
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { index, member in
                        if index > 0 { Divider().overlay(Theme.border) }
                        memberRow(member, isAdmin: isAdmin)
                    }
                }
                .frame(maxWidth: .infinity)
                .cardSurface(padding: 0)
            } else if let loadError {
                InlineMessage(text: loadError)
            } else {
                ProgressView().controlSize(.small)
            }

            if let removeError { InlineMessage(text: removeError) }
        }
        .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .users))) {
            do {
                let fresh = try await model.api.users.list()
                if Task.isCancelled { return }
                members = fresh
                loadError = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if members == nil { loadError = error.localizedDescription }
            }
        }
        .sheet(item: $editing) { member in
            EditMemberSheet(member: member)
                .environment(model)
        }
        .sheet(item: $profileOf) { member in
            MemberProfileSheet(member: member)
                .environment(model)
        }
        .confirmationDialog(
            removing.map { String(localized: "Remove \($0.username)?") } ?? String(localized: "Remove this member?"),
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            presenting: removing
        ) { member in
            Button("Remove", role: .destructive) { remove(member) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Their favorites, requests, and notifications are removed with the account.")
        }
    }

    private func memberRow(_ member: API.HouseholdMember, isAdmin: Bool) -> some View {
        HStack(spacing: 10) {
            UserAvatarView(label: member.label, avatarUrl: member.avatarUrl, size: 36)
                .padding(.trailing, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(member.label)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.textPrimary)
                if member.displayName.nonBlank != nil {
                    Text(member.username)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
                // Admin only, not on their own row (like the website).
                if isAdmin && !member.isCurrentUser, let lastActive = member.lastActiveLine() {
                    Text(lastActive)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            Spacer()
            if member.linked?.plex == true {
                TonePill(text: "Plex", tone: .info, small: true)
            }
            if member.linked?.jellyfin == true {
                TonePill(text: model.session.serverInfo.jellyfinName, tone: .info, small: true)
            }
            if member.linked?.sso == true {
                TonePill(text: "SSO", tone: .info, small: true)
            }
            if member.isAdmin {
                TonePill(text: String(localized: "Admin"), tone: .accent, small: true)
            }
            // "Trusted" or "Custom" (0.48+: from their switches).
            if let tag = member.presetTag {
                TonePill(text: tag, tone: .accent, small: true)
            }
            if member.isCurrentUser {
                TonePill(text: String(localized: "You"), tone: .neutral, small: true)
            }
            if (isAdmin || member.isCurrentUser) && model.session.serverInfo?.hasProfiles == true {
                Button("Profile") { profileOf = member }
                    .buttonStyle(QuietButtonStyle())
                    .font(.system(size: 12))
            }
            if isAdmin || member.isCurrentUser {
                Button("Edit") { editing = member }
                    .buttonStyle(QuietButtonStyle())
                    .font(.system(size: 12))
            }
            if isAdmin && !member.isAdmin {
                Button("Remove") { removing = member }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private func remove(_ member: API.HouseholdMember) {
        let previous = members
        // Drop the row straight away, like the web list.
        members?.removeAll { $0.id == member.id }
        removing = nil
        let api = model.api
        Task {
            do {
                try await api.users.remove(member.id)
                removeError = nil
            } catch {
                members = previous
                removeError = error.localizedDescription
            }
        }
    }
}

/// Settings › Account › Language (like the website's Appearance): Automatic
/// follows this Mac, or one of `AppLanguage`, saved on the account
/// (`PATCH /me`). The new language shows after a restart (`AppLanguage`).
private struct LanguagePicker: View {
    let viewer: API.User

    @Environment(AppModel.self) private var model
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        let chosen = AppLanguage(code: viewer.language)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Picker("Language", selection: Binding(get: { chosen }, set: { save($0) })) {
                    Text("Automatic (system language)").tag(AppLanguage?.none)
                    Divider()
                    ForEach(AppLanguage.allCases) { language in
                        Text(verbatim: language.nativeName).tag(AppLanguage?.some(language))
                    }
                }
                .labelsHidden()
                .frame(width: 210)
                .disabled(saving)
                if saving { ProgressView().controlSize(.small) }
            }
            if AppLanguage.needsRestart(toShow: chosen), !saving {
                HStack(spacing: 10) {
                    Text("Takes effect when Marquee restarts.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                    Button("Restart") { AppLanguage.relaunch() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
            }
            if let error { InlineMessage(text: error) }
        }
    }

    private func save(_ language: AppLanguage?) {
        guard language != AppLanguage(code: viewer.language) else { return }
        saving = true
        error = nil
        Task {
            do {
                try await model.setLanguage(language)
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

/// app/settings/push-settings.tsx's switch, for this Mac: banners for this
/// account's notifications, which come straight from the Marquee server over
/// `LiveUpdates`' stream. The bell has them either way.
struct NotificationSettingsCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    /// System Settings › Notifications › Marquee.
    private static let systemSettingsURL = URL(
        string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(Bundle.main.bundleIdentifier ?? "com.timmyamant.Marquee")"
    )!

    var body: some View {
        let consent = model.notificationConsent

        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Show notifications on this Mac")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                Toggle("Show notifications on this Mac", isOn: Binding(
                    get: { consent.isEnabled },
                    set: { on in
                        if on {
                            Task { await consent.turnOn() }
                        } else {
                            consent.turnOff()
                        }
                    }
                ))
                .toggleStyle(.switch)
                .labelsHidden()
            }

            Text("When a request is approved or declined, and when something you asked for is ready to watch. They come straight from your Marquee server; the bell keeps them either way.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if consent.choice == .on, consent.authorization == .denied {
                HStack(spacing: 10) {
                    Text("Notifications for Marquee are turned off in System Settings.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open System Settings") { openURL(Self.systemSettingsURL) }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
            }

            streamStatus
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
        }
    }

    @ViewBuilder
    private var streamStatus: some View {
        if model.live.isStreaming {
            Label("Connected: new ones arrive the moment they happen.", systemImage: "dot.radiowaves.left.and.right")
        } else if model.live.streamUnsupported {
            Label("This server is too old to send them live, so they arrive within a minute.", systemImage: "clock")
        } else {
            Label("Connecting to your server…", systemImage: "arrow.triangle.2.circlepath")
        }
    }
}

/// household-members-list.tsx `PhotoField` — the edit sheet's profile photo,
/// saved the moment one is picked or removed, on its own endpoint: the
/// sheet's Save isn't involved. The photo stays on the Marquee server.
private struct MemberPhotoField: View {
    let member: API.HouseholdMember

    @Environment(AppModel.self) private var model
    @State private var avatarUrl: String?
    @State private var choosing = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        HStack(spacing: 16) {
            UserAvatarView(label: member.label, avatarUrl: avatarUrl, size: 64)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    Button(busy ? String(localized: "Saving…") : (avatarUrl == nil ? String(localized: "Add photo") : String(localized: "Change photo"))) {
                        choosing = true
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    if avatarUrl != nil {
                        Button("Remove") { remove() }
                            .buttonStyle(QuietButtonStyle())
                            .font(.system(size: 12))
                    }
                }
                .disabled(busy)
                Text("Kept on this server and shown in the menu and the apps.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if let error { InlineMessage(text: error) }
            }
        }
        .onAppear {
            avatarUrl = member.avatarUrl
        }
        .fileImporter(isPresented: $choosing, allowedContentTypes: [.image]) { result in
            switch result {
            case let .success(url): upload(url)
            case let .failure(failure): error = failure.localizedDescription
            }
        }
    }

    private func upload(_ file: URL) {
        let api = model.api
        let id = member.id
        run {
            let prepared = try await AvatarUpload.prepare(fileAt: file)
            return try await api.users.setAvatar(id, data: prepared.data, contentType: prepared.contentType)
        }
    }

    private func remove() {
        let api = model.api
        let id = member.id
        run {
            try await api.users.removeAvatar(id)
            return nil
        }
    }

    /// Runs one change and shows where the photo is now.
    private func run(_ change: @escaping @MainActor () async throws -> String?) {
        busy = true
        error = nil
        Task {
            do {
                avatarUrl = try await change()
                // The rail and the menu show your own photo from `/me`.
                if member.isCurrentUser { model.refreshViewer() }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

private struct CreateMemberForm: View {
    @Environment(AppModel.self) private var model
    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var pending = false
    @State private var error: String?
    @State private var createdName: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsField(label: String(localized: "Name"), text: $displayName)
            SettingsField(label: String(localized: "Username"), text: $username)
            SettingsField(label: String(localized: "Password"), text: $password, secure: true)
            SettingsSaveBar(
                title: String(localized: "Create account"),
                pendingTitle: String(localized: "Creating…"),
                pending: pending,
                message: error.map { ($0, true) }
                    ?? createdName.map { (String(localized: "Account created — \($0) can now sign in."), false) },
                action: create
            )
        }
    }

    private func create() {
        error = nil
        createdName = nil
        pending = true
        let request = API.CreateUserRequest(
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password,
            displayName: displayName.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let api = model.api
        Task {
            do {
                let created = try await api.users.create(request)
                createdName = created.label
                displayName = ""
                username = ""
                password = ""
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

private struct EditMemberSheet: View {
    let member: API.HouseholdMember

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var currentPassword = ""
    /// What they may do (the switches, or an older server's role and
    /// auto-approval); set up in `onAppear`.
    @State private var access: MemberAccessEditor?
    /// The fields' own height, so the sheet fits them (up to a cap).
    @State private var fieldsHeight: CGFloat = 0
    @State private var movieLimit = ""
    @State private var movieDays = "7"
    @State private var tvLimit = ""
    @State private var tvDays = "7"
    @State private var pending = false
    @State private var error: String?

    /// Your own account, unless it has no password yet (`hasPassword` false).
    private var needsCurrentPassword: Bool {
        member.isCurrentUser && member.hasPassword != false
    }

    /// Only the admin changes what someone may do, and never the admin's.
    private var isAdminEditingMember: Bool {
        model.viewer?.isAdmin == true && !member.isAdmin
    }

    /// Request limits (0.39+): the admin, on another non-admin member of a
    /// server that has them.
    private var showsLimits: Bool {
        isAdminEditingMember && !member.isCurrentUser && member.reportsRequestLimits
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // As tall as the fields, up to 640pt; the permission switches
            // scroll past that.
            ScrollView {
                fields
                    .padding(24)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { fieldsHeight = $0 }
            }
            .frame(height: min(max(fieldsHeight, 1), 640))

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? "Saving…" : "Save") { save() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending)
            }
            .padding([.horizontal, .bottom], 24)
        }
        .toggleStyle(.checkbox)
        .frame(width: 460)
        .background(Theme.bg1)
        .onAppear {
            displayName = member.displayName ?? ""
            username = member.username
            access = MemberAccessEditor(member: member, viewerIsAdmin: model.viewer?.isAdmin == true)
            movieLimit = member.movieQuotaLimit.map(String.init) ?? ""
            movieDays = String(member.movieQuotaDays ?? 7)
            tvLimit = member.tvQuotaLimit.map(String.init) ?? ""
            tvDays = String(member.tvQuotaDays ?? 7)
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Edit \(member.username)")
                .font(.marqueeDisplay(22))
            MemberPhotoField(member: member)
            SettingsField(label: String(localized: "Name"), text: $displayName)
            SettingsField(label: String(localized: "Username"), text: $username)
            SettingsField(label: String(localized: "New password"), text: $password, placeholder: String(localized: "Leave blank to keep current password"), secure: true)
            // The server wants it whenever you set a new password on your
            // own account; the admin resetting a member's doesn't know theirs.
            // An account made by Plex/Jellyfin sign-in has none to give.
            if needsCurrentPassword {
                SettingsField(label: String(localized: "Current password"), text: $currentPassword, placeholder: String(localized: "Needed only when setting a new password"), secure: true)
            }

            if let access, access.showsPermissions(isCurrentUser: member.isCurrentUser) {
                MemberPermissionsEditor(editor: Binding(get: { access }, set: { self.access = $0 }))
            } else if let access, access.showsLegacyAutoApproval {
                legacyAccessFields(access)
            }

            if showsLimits {
                VStack(alignment: .leading, spacing: 8) {
                    Text(access?.mode == .permissions
                         ? "Request limits (blank for none; not for someone with No request limits)"
                         : "Request limits (blank for none; trusted members have none)")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                    limitRow(String(localized: "Movies"), limit: $movieLimit, days: $movieDays)
                    limitRow(String(localized: "TV"), limit: $tvLimit, days: $tvDays)
                }
            }

            if member.isCurrentUser {
                Text("Setting a new password signs you out of every device, including this Mac.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let error { InlineMessage(text: error) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// An older server (no `permissions`): auto-approval, and the role (0.39+).
    @ViewBuilder
    private func legacyAccessFields(_ access: MemberAccessEditor) -> some View {
        Toggle("Auto-approve movie requests", isOn: Binding(
            get: { access.autoApproveMovies }, set: { self.access?.autoApproveMovies = $0 }
        ))
        Toggle("Auto-approve TV requests", isOn: Binding(
            get: { access.autoApproveTv }, set: { self.access?.autoApproveTv = $0 }
        ))
        if access.showsLegacyRole {
            VStack(alignment: .leading, spacing: 6) {
                Text("Role")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                Picker("Role", selection: Binding(get: { access.role }, set: { self.access?.role = $0 })) {
                    Text("Member").tag(API.UserRole.member)
                    Text("Trusted — can approve requests and handle problem reports").tag(API.UserRole.trusted)
                }
                .labelsHidden()
            }
        }
    }

    /// "Movies [  ] every [7] days"
    private func limitRow(_ label: String, limit: Binding<String>, days: Binding<String>) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                .frame(width: 56, alignment: .leading)
            TextField(label, text: limit, prompt: Text("No limit"))
                .labelsHidden()
                .textFieldStyle(.roundedBorder)
                .frame(width: 80)
            Text("every")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
            TextField("\(label) days", text: days)
                .labelsHidden()
                .textFieldStyle(.roundedBorder)
                .frame(width: 56)
            Text("days")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
        }
    }

    private func save() {
        var movieQuota: API.UpdateUserRequest.QuotaChange?
        var tvQuota: API.UpdateUserRequest.QuotaChange?
        if showsLimits {
            movieQuota = .init(limitText: movieLimit, daysText: movieDays)
            tvQuota = .init(limitText: tvLimit, daysText: tvDays)
            guard movieQuota != nil, tvQuota != nil else {
                error = String(localized: "Request limits are whole numbers.")
                return
            }
        }
        pending = true
        error = nil
        var request = API.UpdateUserRequest(
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password.nonBlank,
            currentPassword: needsCurrentPassword ? currentPassword.nonBlank : nil,
            movieQuota: movieQuota,
            tvQuota: tvQuota
        )
        access?.apply(to: &request, isCurrentUser: member.isCurrentUser)
        let api = model.api
        Task {
            do {
                let result = try await api.users.update(member.id, request)
                dismiss()
                // Changing your own password revoked this Mac's token.
                if result.tokensRevoked && member.isCurrentUser {
                    model.signOut()
                }
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

/// app/settings/permissions-editor.tsx (0.48+): "What they can do" — a
/// preset picker that fills in the switches (and reads Custom by itself when
/// they match neither), then the switches in groups, each with what it does.
private struct MemberPermissionsEditor: View {
    @Binding var editor: MemberAccessEditor

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("What they can do")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                Picker("What they can do", selection: Binding(get: { editor.preset }, set: { editor.pick($0) })) {
                    ForEach(API.PermissionPreset.allCases, id: \.self) { preset in
                        Text(MemberAccessEditor.pickerLabel(preset))
                            .tag(preset)
                            .selectionDisabled(!editor.isPickable(preset))
                    }
                }
                .labelsHidden()
            }

            ForEach(API.PermissionGroup.all) { group in
                VStack(alignment: .leading, spacing: 8) {
                    SettingsSectionLabel(text: group.title)
                    ForEach(group.items) { item in
                        Toggle(isOn: Binding(
                            get: { editor.isOn(item.permission) },
                            set: { editor.set(item.permission, on: $0) }
                        )) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.label)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.textPrimary)
                                Text(editor.description(for: item))
                                    .font(.system(size: 11.5))
                                    .foregroundStyle(Theme.textMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .disabled(editor.isLocked(item.permission))
                    }
                }
            }

            Text(API.PermissionGroup.footer)
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
