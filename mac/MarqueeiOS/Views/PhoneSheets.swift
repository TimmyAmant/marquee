import SwiftUI

/// The bell's list as a sheet (the Mac's popover, `NotificationsPopover`).
struct PhoneNotificationsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            NotificationsPopover(dismiss: { dismiss() }, fillsSpace: true)
                .background(Theme.bg1)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
                .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDragIndicator(.visible)
    }
}

/// components/push-prompt.tsx after signing in: whether this iPhone should
/// show notifications. iOS's own permission prompt only opens on Turn on.
struct PhoneNotificationPrompt: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "bell.badge")
                .font(.system(size: 34))
                .foregroundStyle(Theme.accent)
            Text("Get notifications on this iPhone?")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("Hear when a request is approved or declined and when something you asked for is ready to watch. They come straight from your Marquee server.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button {
                turnOn()
            } label: {
                Text(busy ? "Turning on…" : "Turn on")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .disabled(busy)
            Button {
                model.notificationConsent.notNow()
            } label: {
                Text("Not now").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderless)
            .tint(Theme.textSecondary)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.bg1)
    }

    private func turnOn() {
        busy = true
        let consent = model.notificationConsent
        Task {
            await consent.turnOn()
            busy = false
            if consent.authorization == .denied {
                model.flash(String(localized: "Notifications for Marquee are off in the Settings app."))
            }
        }
    }
}

/// "What's new" after the server or this app is upgraded.
struct PhoneWhatsNewView: View {
    let content: WhatsNew.Content
    @Environment(AppModel.self) private var model

    var body: some View {
        WhatsNewSheet(content: content) {
            model.select(.discover)
            model.open(.changelog)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg1)
    }
}
