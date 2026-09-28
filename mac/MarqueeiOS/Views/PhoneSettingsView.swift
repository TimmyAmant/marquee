import SwiftUI

/// Settings on iPhone and iPad, from More (or the iPad's sidebar): at a
/// regular width (an iPad), the Mac's page with its row of tabs
/// (`SettingsRootView`); at a compact one, a list of the same tabs, each
/// pushing the Mac's pane (`PhoneSettingsView`).
struct PhoneSettingsScreen: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        if horizontalSizeClass == .regular {
            SettingsRootView()
        } else {
            PhoneSettingsView()
        }
    }
}

/// The iPhone's Settings: who you are, then the Mac's and the website's
/// tabs (the same ones, for the same people — `SettingsTab.visible`), each
/// opening its page; the server, and signing out.
struct PhoneSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmingSignOut = false
    @State private var confirmingChangeServer = false
    /// A server older than 0.49 has no Settings › Discover (it answers 404).
    @State private var discoverUnavailable = false

    var body: some View {
        let isAdmin = model.viewer?.isAdmin == true
        let tabs = SettingsTab.visible(
            isAdmin: isAdmin,
            canManageBlocklist: model.viewer?.can(.manageBlocklist) == true,
            hasDiscover: !discoverUnavailable
        )

        Form {
            if let viewer = model.viewer {
                Section {
                    HStack(spacing: 14) {
                        UserAvatarView(label: viewer.label, avatarUrl: viewer.avatarUrl, size: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(viewer.label)
                                .font(.headline)
                                .foregroundStyle(Theme.textPrimary)
                            Text(verbatim: "@\(viewer.username) · \(viewer.role.label)")
                                .font(.subheadline)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                ForEach(tabs, id: \.self) { tab in
                    row(tab)
                }
            } footer: {
                if let server = model.session.server {
                    Link(destination: server.baseURL.appending(path: SettingsTab.account.webPath)) {
                        Text("Open on the website")
                            .font(.footnote)
                    }
                    .foregroundStyle(Theme.accent)
                }
            }

            Section("Server") {
                if let server = model.session.server {
                    LabeledContent("Server", value: server.displayName)
                }
                if let version = model.session.serverInfo?.version {
                    LabeledContent("Marquee", value: version)
                }
                Button("Change Server…") { confirmingChangeServer = true }
            }

            Section {
                Button("Sign Out", role: .destructive) { confirmingSignOut = true }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg0)
        .navigationTitle("Settings")
        .navigationDestination(item: pushedTab) { tab in
            PhoneSettingsTabView(tab: tab)
        }
        .confirmationDialog("Sign out of Marquee?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { model.signOut() }
        }
        .confirmationDialog("Change Server…", isPresented: $confirmingChangeServer, titleVisibility: .visible) {
            Button("Change Server…", role: .destructive) { model.changeServer() }
        } message: {
            Text("You'll be signed out of this server.")
        }
        .task(id: isAdmin) {
            // Only the admin sees the tab; an older server has none.
            guard isAdmin else { return }
            do {
                _ = try await model.api.discoverSettings.load()
                discoverUnavailable = false
            } catch APIError.notFound {
                discoverUnavailable = true
            } catch {
                // Anything else: keep the tab; it shows the error itself.
            }
        }
    }

    private var pushedTab: Binding<SettingsTab?> {
        Binding(get: { model.phoneSettingsTab }, set: { model.phoneSettingsTab = $0 })
    }

    private func row(_ tab: SettingsTab) -> some View {
        Button {
            model.phoneSettingsTab = tab
        } label: {
            HStack {
                Label {
                    Text(tab.title).foregroundStyle(Theme.textPrimary)
                } icon: {
                    Image(systemName: tab.systemImage).foregroundStyle(Theme.accent)
                }
                Spacer()
                chevron
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Theme.textMuted)
    }
}

/// One Settings tab pushed from the iPhone's list: the Mac's pane, its name
/// in the bar, and the website's page for it in the bar's menu.
struct PhoneSettingsTabView: View {
    let tab: SettingsTab

    var body: some View {
        SettingsTabContent(tab: tab)
            .environment(\.settingsPaneTitleInBar, true)
            .tint(Theme.accent)
            .navigationTitle(tab.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SettingsWebsiteButton(tab: tab)
                }
            }
    }
}
