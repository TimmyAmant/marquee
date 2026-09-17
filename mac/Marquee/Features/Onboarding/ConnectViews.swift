import SwiftUI

/// The find-your-server card: one step at a time, in the auth card layout.
struct ConnectFlowView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let connect = model.connect
        switch connect.step {
        case .welcome:
            WelcomeStep(connect: connect)
        case .searching:
            SearchingStep(connect: connect, discovery: connect.discovery)
        case .localNetworkDenied:
            LocalNetworkDeniedStep(connect: connect)
        case .manual:
            ManualEntryStep(connect: connect)
        }
    }
}

// MARK: - Welcome

private struct WelcomeStep: View {
    let connect: ConnectModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(
                title: "Find your Marquee server",
                message: "Marquee for Mac connects to the Marquee server running on your home network, like the one on your Unraid box."
            )
            VStack(alignment: .leading, spacing: 14) {
                ConnectPoint(
                    systemImage: "wifi",
                    title: "Search your network",
                    text: "Marquee checks the computers on your local network for a Marquee server."
                )
                ConnectPoint(
                    systemImage: "lock.shield",
                    title: "Allow Local Network access",
                    text: "macOS will ask for permission first. Click Allow so Marquee can reach your server."
                )
            }
            .padding(.vertical, 2)

            Button {
                connect.searchNetwork()
            } label: {
                Text("Search my network").frame(maxWidth: .infinity)
            }
            .buttonStyle(AccentButtonStyle())
            .keyboardShortcut(.defaultAction)

            AuthLink("Enter address manually") {
                connect.enterManually()
            }
        }
    }
}

private struct ConnectPoint: View {
    let systemImage: String
    let title: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.accent)
                .frame(width: 30, height: 30)
                .background(Theme.accent.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                Text(text)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Searching

private struct SearchingStep: View {
    let connect: ConnectModel
    let discovery: ServerDiscovery

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(title: title, message: message)

            if discovery.isRunning || discovery.probed > 0 {
                VStack(alignment: .leading, spacing: 7) {
                    if discovery.state == .checkingAccess {
                        ProgressView()
                            .progressViewStyle(.linear)
                    } else {
                        ProgressView(value: discovery.fractionComplete)
                            .progressViewStyle(.linear)
                    }
                    Text(progressLabel)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                        .monospacedDigit()
                }
            }

            if discovery.state == .checkingAccess {
                AuthNotice(
                    text: "If macOS asks to find devices on your local network, click Allow.",
                    systemImage: "lock.shield"
                )
            }

            if !discovery.found.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SettingsSectionLabel(text: discovery.found.count == 1 ? "Found 1 server" : "Found \(discovery.found.count) servers")
                    ForEach(discovery.found) { server in
                        FoundServerRow(server: server) {
                            connect.select(server)
                        }
                    }
                }
            }

            if discovery.isRunning {
                Button {
                    connect.stopSearch()
                } label: {
                    Text("Stop").frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
                .keyboardShortcut(.cancelAction)
            } else {
                Button {
                    connect.searchNetwork()
                } label: {
                    Text("Search again").frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
            }

            AuthLink("Enter address manually") {
                connect.enterManually()
            }
        }
        .animation(.easeOut(duration: 0.2), value: discovery.found)
    }

    private var usableCount: Int {
        discovery.found.filter(\.isUsable).count
    }

    private var title: String {
        if discovery.isRunning { return "Searching your network" }
        if usableCount > 0 { return usableCount == 1 ? "Found your server" : "Choose your server" }
        if !discovery.found.isEmpty { return "Your server needs an update" }
        return "Search stopped"
    }

    private var message: String {
        if discovery.isRunning {
            if let networks = discovery.networkSummary {
                return "Looking for Marquee on \(networks). This usually takes under a minute."
            }
            return "Looking for Marquee on your local network."
        }
        if usableCount > 0 { return "Select your Marquee server to sign in." }
        if !discovery.found.isEmpty {
            return "Marquee is running on your network, but the Mac app needs server version \(ServerInfo.minimumServerVersion) or later."
        }
        return "No Marquee server turned up before the search was stopped."
    }

    private var progressLabel: String {
        switch discovery.state {
        case .checkingAccess:
            return "Checking Local Network access…"
        case .scanning:
            return "\(discovery.probed.formatted()) of \(discovery.total.formatted()) addresses checked"
        default:
            return "Checked \(discovery.probed.formatted()) of \(discovery.total.formatted()) addresses"
        }
    }
}

private struct FoundServerRow: View {
    let server: ServerDiscovery.FoundServer
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        if server.isUsable {
            Button(action: action) {
                content
            }
            .buttonStyle(.plain)
            .onHover { hovering = $0 }
            .help("Sign in to \(server.address.displayName)")
        } else {
            content
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "server.rack")
                    .font(.system(size: 13))
                    .foregroundStyle(server.isUsable ? Theme.accent : Theme.textMuted)
                    .frame(width: 30, height: 30)
                    .background((server.isUsable ? Theme.accent.opacity(0.12) : Theme.bg2), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(server.address.displayName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text(detail)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                switch server.kind {
                case .current:
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(hovering ? Theme.accent : Theme.textMuted)
                case .legacy:
                    TonePill(text: "Update required", tone: .accent, small: true)
                case .incompatible:
                    TonePill(text: "Update app", tone: .accent, small: true)
                }
            }
            if let explanation {
                Text(explanation)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(hovering && server.isUsable ? Theme.accent : Theme.border, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 10))
    }

    private var detail: String {
        switch server.kind {
        case let .current(info):
            var parts = ["Marquee \(info.version)"]
            if info.isDegraded {
                parts.append("database offline")
            } else if info.setupComplete == false {
                parts.append("not set up yet")
            }
            return parts.joined(separator: " · ")
        case .legacy:
            return "Marquee (older version)"
        case let .incompatible(info):
            return "Marquee \(info.version)"
        }
    }

    private var explanation: String? {
        switch server.kind {
        case .current:
            return nil
        case .legacy:
            return "Update this server to Marquee \(ServerInfo.minimumServerVersion) or later to use it with the Mac app."
        case .incompatible:
            return "This server is newer than this app supports. Update Marquee for Mac to connect."
        }
    }
}

// MARK: - Local Network denied

private struct LocalNetworkDeniedStep: View {
    let connect: ConnectModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(
                title: "Allow Local Network access",
                message: "Marquee needs permission to look for your server on your home network. If macOS just asked, click Allow and the search continues on its own."
            )

            VStack(alignment: .leading, spacing: 10) {
                SettingsStepRow(number: 1, text: "Open System Settings › Privacy & Security › Local Network.")
                SettingsStepRow(number: 2, text: "Turn on Marquee.")
                SettingsStepRow(number: 3, text: "Come back here. The search picks up again by itself.")
            }

            VStack(spacing: 10) {
                Button {
                    ConnectModel.openLocalNetworkSettings()
                } label: {
                    Text("Open System Settings").frame(maxWidth: .infinity)
                }
                .buttonStyle(AccentButtonStyle())
                .keyboardShortcut(.defaultAction)

                Button {
                    connect.searchNetwork()
                } label: {
                    Text("Try again").frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
            }

            AuthLink("Enter address manually") {
                connect.enterManually()
            }
        }
    }
}

private struct SettingsStepRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(number)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 20, height: 20)
                .background(Theme.accent.opacity(0.12), in: Circle())
            Text(text)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Manual entry

private struct ManualEntryStep: View {
    @Bindable var connect: ConnectModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(
                title: "Connect to your server",
                message: "Enter the IP address or URL of the computer running Marquee. The port is usually 3000."
            )

            if let notice = connect.manualNotice {
                AuthNotice(text: notice, systemImage: "magnifyingglass")
            }

            AuthField(
                label: "IP address or URL",
                text: $connect.manualAddress,
                placeholder: "192.168.1.20:3000",
                autofocus: true
            )
            .disabled(connect.isConnecting)
            .onSubmit { connect.connectManually() }

            if let error = connect.manualError {
                InlineMessage(text: error)
            }

            if connect.manualNeedsLocalNetwork {
                Button {
                    ConnectModel.openLocalNetworkSettings()
                } label: {
                    Text("Open System Settings").frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
            }

            Button {
                connect.connectManually()
            } label: {
                Text(connect.isConnecting ? "Connecting…" : "Connect").frame(maxWidth: .infinity)
            }
            .buttonStyle(AccentButtonStyle())
            .keyboardShortcut(.defaultAction)
            .disabled(connect.isConnecting || connect.manualAddress.trimmingCharacters(in: .whitespaces).isEmpty)

            AuthLink("Search my network") {
                connect.searchNetwork()
            }
        }
    }
}
