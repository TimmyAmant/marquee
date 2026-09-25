import SwiftUI

/// components/push-prompt.tsx — after signing in, asks whether this Mac
/// should get notifications. Only a card: macOS's own permission prompt opens
/// when "Turn on" is pressed, never before (see `NotificationConsent`).
struct NotificationPromptCard: View {
    @Environment(AppModel.self) private var model
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Get notifications on this Mac?")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("Hear when a request is approved or declined and when something you asked for is ready to watch. They come straight from your Marquee server.")
                .font(.system(size: 13))
                .lineSpacing(2)
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            HStack(spacing: 8) {
                Spacer()
                Button("Not now") {
                    model.notificationConsent.notNow()
                }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 13))
                .padding(.horizontal, 10)
                Button(busy ? "Turning on…" : "Turn on") {
                    turnOn()
                }
                .buttonStyle(AccentButtonStyle())
                .disabled(busy)
            }
            .padding(.top, 12)
        }
        .padding(16)
        .frame(width: 340)
        .glassSurface(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Get notifications on this Mac?")
    }

    private func turnOn() {
        busy = true
        let consent = model.notificationConsent
        Task {
            await consent.turnOn()
            busy = false
            if consent.authorization == .denied {
                model.flash("Notifications for Marquee are off in System Settings › Notifications.")
            }
        }
    }
}
