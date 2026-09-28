import SwiftUI
import UIKit

/// The iPhone app's compact Settings: the account, the server, notifications,
/// appearance, language and About. Everything an admin configures (the
/// General, Members, Media servers and Services tabs) opens on the website.
struct PhoneSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system.rawValue
    @State private var confirmingSignOut = false
    @State private var confirmingChangeServer = false

    var body: some View {
        Form {
            if let viewer = model.viewer {
                Section("Account") {
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
                    if viewer.sendsLanguage {
                        PhoneLanguagePicker(viewer: viewer)
                    }
                }
            }

            Section("Server") {
                if let server = model.session.server {
                    LabeledContent("Server", value: server.displayName)
                }
                if let version = model.session.serverInfo?.version {
                    LabeledContent("Marquee", value: version)
                }
                if let server = model.session.server {
                    Link(destination: server.baseURL) {
                        Label("Open in Browser", systemImage: "safari")
                    }
                }
                Button("Change Server…") { confirmingChangeServer = true }
            }

            if model.viewer?.isAdmin == true, let server = model.session.server {
                Section {
                    ForEach(Self.adminTabs, id: \.self) { tab in
                        Link(destination: server.baseURL.appending(path: tab.webPath)) {
                            Label(tab.title, systemImage: tab.systemImage)
                        }
                    }
                } header: {
                    Text("Server settings")
                } footer: {
                    Text("These open on your Marquee server's website.")
                }
            }

            Section {
                Toggle("Show notifications on this iPhone", isOn: notificationsOn)
                if model.notificationConsent.choice == .on, model.notificationConsent.authorization == .denied {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                            Platform.open(url)
                        }
                    }
                }
                if let server = model.session.server {
                    // Which kinds go where, and personal channels (the
                    // website's Notifications tab).
                    Link(destination: server.baseURL.appending(path: SettingsTab.notifications.webPath)) {
                        Text("Choose what you're notified about")
                    }
                }
            } header: {
                Text("Notifications")
            } footer: {
                Text("While Marquee is open, from your Marquee server. The bell keeps them either way; for alerts when the app is closed, add a personal channel (ntfy, Pushover, Telegram…) on the website.")
            }

            Section("Appearance") {
                Picker("Appearance", selection: $appearance) {
                    ForEach(AppearancePreference.allCases) { option in
                        Text(option.label).tag(option.rawValue)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            Section("About") {
                LabeledContent("Marquee for iPhone", value: AppInfo.version)
                Button("Marquee Releases") {
                    model.select(.discover)
                    model.open(.changelog)
                }
                Link("All features", destination: AppInfo.featuresURL)
                Link(destination: AppInfo.repositoryURL) {
                    Text(verbatim: "GitHub")
                }
            }

            Section {
                Button("Sign Out", role: .destructive) { confirmingSignOut = true }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg0)
        .navigationTitle("Settings")
        .confirmationDialog("Sign out of Marquee?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { model.signOut() }
        }
        .confirmationDialog("Change Server…", isPresented: $confirmingChangeServer, titleVisibility: .visible) {
            Button("Change Server…", role: .destructive) { model.changeServer() }
        } message: {
            Text("You'll be signed out of this server.")
        }
    }

    /// The website's admin tabs (0.56+), in its order.
    private static let adminTabs: [SettingsTab] = [.general, .mediaServers, .services, .members]

    private var notificationsOn: Binding<Bool> {
        let consent = model.notificationConsent
        return Binding(
            get: { consent.isEnabled || (consent.choice == .on && consent.authorization == .notDetermined) },
            set: { on in
                if on {
                    Task {
                        await consent.turnOn()
                        if consent.authorization == .denied {
                            model.flash(String(localized: "Notifications for Marquee are off in the Settings app."))
                        }
                    }
                } else {
                    consent.turnOff()
                }
            }
        )
    }
}

/// The account's language (`PATCH /me`), like the Mac's Settings › Account ›
/// Language. iOS applies it the next time Marquee opens.
private struct PhoneLanguagePicker: View {
    let viewer: API.User
    @Environment(AppModel.self) private var model
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        let chosen = AppLanguage(code: viewer.language)
        Picker("Language", selection: Binding(get: { chosen }, set: { save($0) })) {
            Text("Automatic (system language)").tag(AppLanguage?.none)
            ForEach(AppLanguage.allCases) { language in
                Text(verbatim: language.nativeName).tag(AppLanguage?.some(language))
            }
        }
        .disabled(saving)
        if AppLanguage.needsRestart(toShow: chosen), !saving {
            Text("Takes effect when Marquee restarts.")
                .font(.footnote)
                .foregroundStyle(Theme.textSecondary)
        }
        if let error {
            Text(error)
                .font(.footnote)
                .foregroundStyle(Theme.danger)
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
