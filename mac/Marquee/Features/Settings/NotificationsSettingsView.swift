import SwiftUI

/// Settings › Notifications (app/settings/notifications): your own first —
/// this Mac's banners, your channels and what you hear about — then, for
/// the admin, a tab per household channel (the website's per-agent tabs).
struct NotificationsSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var subTab: NotificationsSubTab = .personal

    var body: some View {
        let tabs = NotificationsSubTab.visible(isAdmin: model.viewer?.isAdmin == true)
        let current = tabs.contains(subTab) ? subTab : .personal

        SettingsPane(
            title: String(localized: "Notifications"),
            subtitle: String(localized: "Your own notifications, and the channels the whole household hears from.")
        ) {
            if tabs.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(tabs, id: \.self) { tab in
                            SettingsTabButton(title: tab.title, current: tab == current, small: true) {
                                subTab = tab
                            }
                        }
                    }
                }
            }

            if current == .personal {
                SettingsSection(
                    title: String(localized: "Notifications"),
                    subtitle: String(localized: "Requests approved or declined, and titles ready to watch, on this device.")
                ) {
                    NotificationSettingsCard()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface()
                }
                // 0.45+: your own channels and what you hear about.
                PersonalNotificationsSection()
            } else {
                IntegrationsSettingsView(part: .channel(current))
                    .id(current)
            }
        }
    }
}
