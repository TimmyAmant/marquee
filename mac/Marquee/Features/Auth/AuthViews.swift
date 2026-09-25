import SwiftUI

/// Chooses between connecting to a server, sign-in, and the main window.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Group {
            switch model.phase {
            case .launching:
                LaunchingView()
            case .connect:
                AuthScreen { ConnectFlowView() }
            case .signIn:
                AuthScreen { ServerSignInView() }
            case .unreachable:
                AuthScreen { ServerUnreachableView() }
            case .ready:
                MainWindowView()
            }
        }
        .background(Theme.bg0)
        .tint(Theme.accent)
        .overlay(alignment: .bottomTrailing) {
            if let pinned = model.session.pinned, !PinnedServerBadge.hiddenForScreenshots {
                PinnedServerBadge(server: pinned.address.displayName)
            }
        }
        .onAppear {
            let open = openWindow
            model.openMainWindow = { open(id: "main") }
        }
    }
}

/// Always-visible marker for a pinned run (MARQUEE_PINNED_SERVER), so it's
/// obvious on screen that this window isn't talking to the real server.
private struct PinnedServerBadge: View {
    let server: String

    /// MARQUEE_SCREENSHOTS=1, for the README's captures of a test run
    /// (scripts/landing). Debug builds only: a release always shows it.
    static var hiddenForScreenshots: Bool {
        #if DEBUG
        ProcessInfo.processInfo.environment["MARQUEE_SCREENSHOTS"] == "1"
        #else
        false
        #endif
    }

    var body: some View {
        Text("TEST RUN · \(server)")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(Theme.bg0)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(Theme.accent))
            .padding(10)
            .allowsHitTesting(false)
    }
}

private struct LaunchingView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Theme.bg0.overlay {
            VStack(spacing: 14) {
                ProgressView()
                if let server = model.session.server {
                    Text("Connecting to \(server.displayName)…")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
    }
}

/// The (auth) route group layout — a centered card over the brand glow.
struct AuthScreen<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            Theme.bg0.ignoresSafeArea()
            RadialGradient(colors: [Theme.accent.opacity(0.16), .clear], center: .top, startRadius: 0, endRadius: 560)
                .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 28) {
                    MarqueeWordmark(size: 34)
                    content()
                        .frame(width: 380)
                        .cardSurface(padding: 28, radius: 20)
                }
                .padding(.vertical, 60)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

/// Serif title plus a line of explanation, at the top of every auth card.
struct AuthHeading: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.marqueeDisplay(26))
                .foregroundStyle(Theme.textPrimary)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct AuthField: View {
    let label: String
    @Binding var text: String
    var secure = false
    var placeholder: String?
    var contentType: NSTextContentType?
    /// Focus this field when the card appears.
    var autofocus = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
            Group {
                if secure {
                    SecureField("", text: $text, prompt: prompt)
                } else {
                    TextField("", text: $text, prompt: prompt)
                }
            }
            .textFieldStyle(.plain)
            .textContentType(contentType)
            .font(.system(size: 13.5))
            .focused($focused)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Theme.border))
        }
        .onAppear {
            if autofocus { focused = true }
        }
    }

    private var prompt: Text? {
        placeholder.map { Text($0).foregroundStyle(Theme.textMuted) }
    }
}

/// Thin rule with a centered "or", separating the primary action from the
/// switch-form link.
struct AuthDivider: View {
    var body: some View {
        HStack(spacing: 10) {
            Rectangle().fill(Theme.border).frame(height: 1)
            Text("or")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
            Rectangle().fill(Theme.border).frame(height: 1)
        }
    }
}

/// A centered text link under a card's buttons ("Enter address manually").
struct AuthLink: View {
    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12.5, weight: .medium))
        }
        .buttonStyle(QuietButtonStyle())
        .frame(maxWidth: .infinity)
    }
}

/// A neutral note with an icon: hints and "nothing found" messages that
/// aren't errors (InlineMessage is for those).
struct AuthNotice: View {
    let text: String
    var systemImage = "info.circle"

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(Theme.accent)
            Text(text)
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .font(.system(size: 12))
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Theme.accent.opacity(0.25)))
    }
}

/// The chosen server, with an optional "Change" link back to the connect flow.
struct ServerChip: View {
    let address: ServerAddress
    var version: String?
    var onChange: (() -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "server.rack")
                .font(.system(size: 13))
                .foregroundStyle(Theme.accent)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 1) {
                Text(address.displayName)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let version {
                    Text("Marquee \(version)")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            Spacer(minLength: 8)
            if let onChange {
                Button("Change", action: onChange)
                    .buttonStyle(QuietButtonStyle(color: Theme.accent))
                    .font(.system(size: 12, weight: .medium))
                    .help("Connect to a different Marquee server")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Theme.border))
    }
}
