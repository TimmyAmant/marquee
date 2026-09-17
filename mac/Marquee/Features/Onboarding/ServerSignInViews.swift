import SwiftUI

/// Sign-in for the chosen server, or its first-run setup when no account
/// exists there yet (server-info `setupComplete == false`).
struct ServerSignInView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.authForm {
        case .setup:
            SetupForm()
        case .signIn:
            SignInForm()
        }
    }
}

/// app/(auth)/setup/setup-form.tsx, against `POST /api/v1/auth/setup`.
struct SetupForm: View {
    @Environment(AppModel.self) private var model
    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?
    @State private var pending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(
                title: "Set up Marquee",
                message: "Create the first account on this server. It becomes the admin, and accounts for other household members can be added later from Settings."
            )
            if let server = model.session.server {
                ServerChip(address: server, version: model.session.serverInfo?.version) {
                    model.changeServer()
                }
            }
            AuthField(label: "Name", text: $displayName, contentType: .name, autofocus: true)
            AuthField(label: "Username", text: $username, contentType: .username)
            AuthField(label: "Password", text: $password, secure: true, contentType: .newPassword)
            if let error { InlineMessage(text: error) }
            Button {
                submit()
            } label: {
                Text(pending ? "Creating account…" : "Create admin account")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(AccentButtonStyle())
            .keyboardShortcut(.defaultAction)
            .disabled(pending)

            AuthDivider()
            VStack(spacing: 8) {
                Text("Already have an account?")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
                Button {
                    model.showAuthForm(.signIn)
                } label: {
                    Text("Log in").frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
                .disabled(pending)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func submit() {
        guard !pending else { return }
        pending = true
        error = nil
        Task {
            defer { pending = false }
            do {
                let user = try await model.session.setup(displayName: displayName, username: username, password: password)
                password = ""
                model.completeSignIn(user)
            } catch APIError.setupComplete {
                // Someone finished setup (maybe on the web) since the probe.
                await model.session.refreshInfo()
                model.authNotice = APIError.setupComplete.localizedDescription
                model.showAuthForm(.signIn)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// app/(auth)/login/login-form.tsx, against `POST /api/v1/auth/login`.
struct SignInForm: View {
    @Environment(AppModel.self) private var model
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?
    @State private var pending = false

    var body: some View {
        let info = model.session.serverInfo
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(title: "Welcome back", message: "Sign in to your Marquee account.")
            if let server = model.session.server {
                ServerChip(address: server, version: info?.version) {
                    model.changeServer()
                }
            }
            if let notice = model.authNotice {
                AuthNotice(text: notice)
            }
            AuthField(label: "Username", text: $username, contentType: .username, autofocus: true)
            AuthField(label: "Password", text: $password, secure: true, contentType: .password)
            if info?.isDegraded == true {
                InlineMessage(text: "Your server can't reach its database right now, so signing in may fail.")
            }
            if let error { InlineMessage(text: error) }
            Button {
                submit()
            } label: {
                Text(pending ? "Signing in…" : "Sign in").frame(maxWidth: .infinity)
            }
            .buttonStyle(AccentButtonStyle())
            .keyboardShortcut(.defaultAction)
            .disabled(pending)

            // Setup is only offered while the server has no accounts; after
            // that, new household members are added by an admin in Settings.
            if info?.setupComplete == false {
                AuthDivider()
                VStack(spacing: 8) {
                    Text("New to Marquee?")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                    Button {
                        model.showAuthForm(.setup)
                    } label: {
                        Text("Create an account").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(OutlineButtonStyle())
                    .disabled(pending)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func submit() {
        guard !pending else { return }
        pending = true
        error = nil
        Task {
            defer { pending = false }
            do {
                let user = try await model.session.login(username: username, password: password)
                password = ""
                model.completeSignIn(user)
            } catch {
                password = ""
                self.error = error.localizedDescription
            }
        }
    }
}

/// A saved server that couldn't be used at launch (or on Retry).
struct ServerUnreachableView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let problem = model.connectionProblem ?? .unreachable(.noResponse)
        VStack(alignment: .leading, spacing: 18) {
            AuthHeading(title: title(problem), message: explanation(problem))
            if let server = model.session.server {
                ServerChip(address: server, version: model.session.serverInfo?.version)
                if let detail = problem.problemMessage(for: server) {
                    InlineMessage(text: detail)
                }
            }

            VStack(spacing: 10) {
                if problem == .unreachable(.localNetworkDenied) {
                    Button {
                        ConnectModel.openLocalNetworkSettings()
                    } label: {
                        Text("Open System Settings").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(OutlineButtonStyle())
                }
                Button {
                    model.retryConnection()
                } label: {
                    Text(model.isRetryingConnection ? "Connecting…" : "Retry").frame(maxWidth: .infinity)
                }
                .buttonStyle(AccentButtonStyle())
                .keyboardShortcut(.defaultAction)
                .disabled(model.isRetryingConnection)

                Button {
                    model.changeServer()
                } label: {
                    Text("Change server").frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
                .disabled(model.isRetryingConnection)
            }
        }
    }

    private func title(_ problem: ProbeOutcome) -> String {
        switch problem {
        case .legacy, .incompatible: return "Update needed"
        case .notMarquee: return "That's not your Marquee server"
        case .unreachable(.localNetworkDenied): return "Allow Local Network access"
        default: return "Can't reach your server"
        }
    }

    private func explanation(_ problem: ProbeOutcome) -> String {
        switch problem {
        case .legacy:
            return "Your Marquee server is running an older version. Update it, then try again."
        case .incompatible:
            return "Your Marquee server is newer than this app. Update Marquee for Mac, then try again."
        case .notMarquee:
            return "Something else is answering at your server's address now. Its IP address may have changed."
        case .unreachable(.localNetworkDenied):
            return "macOS is blocking Marquee from your home network. Turn it on in System Settings, then try again."
        default:
            return "Make sure the computer running Marquee is on and connected to your network, then try again."
        }
    }
}
