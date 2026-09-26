import SwiftUI

/// Settings › Integrations › Sign-in (0.44+): loads `GET /settings/sso` and
/// shows the single sign-on card. An older server without it (404) shows
/// nothing at all.
struct SsoSettingsSection: View {
    @Environment(AppModel.self) private var model
    @State private var settings: API.SsoSettings?
    @State private var loadError: String?

    var body: some View {
        Group {
            if settings != nil || loadError != nil {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionLabel(text: "Sign-in")
                    if let settings {
                        SsoSettingsCard(saved: settings) { self.settings = $0 }
                    } else if let loadError {
                        InlineMessage(text: loadError)
                    }
                }
                .padding(.top, 8)
            }
        }
        .task(id: model.reloadToken) {
            do {
                let fresh = try await model.api.integrations.sso.settings()
                if Task.isCancelled { return }
                settings = fresh
                loadError = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if settings == nil { loadError = error.localizedDescription }
            }
        }
    }
}

/// components/sso-settings-card.tsx: any OpenID Connect provider (Authentik,
/// Authelia, Pocket ID, Keycloak, Google…). The client secret is write-only:
/// the card only knows whether one is saved.
struct SsoSettingsCard: View {
    let saved: API.SsoSettings
    /// The settings the server answered a save or "Turn off" with.
    let onChange: (API.SsoSettings) -> Void

    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var publicUrl = ""
    @State private var issuer = ""
    @State private var clientId = ""
    @State private var clientSecret = ""
    @State private var clearClientSecret = false
    @State private var scopes = API.SsoSettings.defaultScopes
    @State private var allowSignup = false
    @State private var matchEmail = false
    @State private var requiredGroup = ""
    @State private var trustedGroup = ""
    @State private var groupsClaim = API.SsoSettings.defaultGroupsClaim
    @State private var prefilled = false

    @State private var testing = false
    @State private var test: Result<API.SsoTestResult, TestFailure>?
    @State private var pending = false
    @State private var message: (String, Bool)?
    @State private var confirmingRemove = false
    @State private var removing = false

    struct TestFailure: Error {
        let message: String
    }

    var body: some View {
        IntegrationCard(
            title: "Single sign-on",
            description: "Adds “Sign in with …” for your own identity provider — Authentik, Authelia, Pocket ID, Keycloak, Google, or anything else that speaks OpenID Connect — on the website and the Mac and Windows apps.",
            connected: saved.configured,
            connectedLabel: "On"
        ) {
            HintedField(
                label: "Button name", text: $name, placeholder: "Authentik",
                hint: "The sign-in button says “Sign in with \(name.nonBlank ?? "<name>")”."
            )
            HintedField(
                label: "Marquee's address", text: $publicUrl, placeholder: "https://marquee.example.com",
                hint: "The address people use to reach Marquee from outside."
            )
            CopyField(
                value: API.SsoSettings.callbackURL(for: publicUrl),
                label: "Redirect URI — add this to the provider exactly"
            )

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .bottom, spacing: 8) {
                    SettingsField(
                        label: "Issuer URL", text: $issuer,
                        placeholder: "https://auth.example.com/application/o/marquee/"
                    )
                    Button(testing ? "Testing…" : "Test") { runTest() }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(testing || issuer.nonBlank == nil)
                }
                hint("The provider's issuer, or its …/.well-known/openid-configuration address.")
            }
            testOutcome

            SettingsField(label: "Client ID", text: $clientId)
            SettingsField(
                label: "Client secret", text: $clientSecret,
                placeholder: saved.hasClientSecret ? "(saved — enter to replace)" : "Leave empty for a public client",
                secure: true
            )
            if saved.hasClientSecret {
                Toggle("Remove the saved secret (a public client)", isOn: $clearClientSecret)
                    .toggleStyle(.checkbox)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
            HintedField(
                label: "Scopes", text: $scopes,
                hint: "Add “groups” for Authelia and Pocket ID if you use groups below."
            )

            VStack(alignment: .leading, spacing: 10) {
                HintedToggle(
                    label: "New accounts from single sign-on", isOn: $allowSignup,
                    hint: "Anyone your provider lets in gets a member account on first sign-in. Off: only accounts that linked it can use it."
                )
                HintedToggle(
                    label: "Match existing accounts by verified email", isOn: $matchEmail,
                    hint: "First sign-in links an account whose username is the person's email — only when the provider says the email is verified, and never the admin account."
                )
            }
            .padding(.top, 2)

            HintedField(
                label: "Required group (optional)", text: $requiredGroup, placeholder: "marquee-users",
                hint: "Only people in this group can sign in with it."
            )
            HintedField(
                label: "Trusted group (optional)", text: $trustedGroup, placeholder: "marquee-trusted",
                hint: "Members in this group become Trusted when they sign in. Nobody is ever made an admin this way."
            )
            SettingsField(label: "Groups claim", text: $groupsClaim)

            if let message { InlineMessage(text: message.0, isError: message.1) }
            HStack(spacing: 12) {
                Button(pending ? "Checking…" : "Test & save") { save() }
                    .buttonStyle(AccentButtonStyle())
                    .disabled(pending || removing)
                if saved.configured { removeControl }
            }
        }
        .onAppear { prefill(saved) }
    }

    @ViewBuilder
    private var testOutcome: some View {
        switch test {
        case let .success(result):
            VStack(alignment: .leading, spacing: 4) {
                InlineMessage(text: "Found \(result.issuer)", isError: false)
                ForEach(result.warnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.circle")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.accent)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        case let .failure(failure):
            InlineMessage(text: failure.message)
        case nil:
            EmptyView()
        }
    }

    /// "Turn off single sign-on", confirmed inline like Disconnect.
    @ViewBuilder
    private var removeControl: some View {
        if confirmingRemove {
            HStack(spacing: 8) {
                Text("Turn off single sign-on?")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                Button(removing ? "Turning off…" : "Confirm") { remove() }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .disabled(removing)
                Button("Cancel") { confirmingRemove = false }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(removing)
            }
            .font(.system(size: 12))
        } else {
            Button("Turn off single sign-on") { confirmingRemove = true }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12))
                .disabled(pending)
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11.5))
            .foregroundStyle(Theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// The form as the server expects it; the server trims and checks it.
    private var request: API.SsoSettingsRequest {
        API.SsoSettingsRequest(
            name: name,
            issuer: issuer,
            clientId: clientId,
            // Blank keeps the saved secret.
            clientSecret: clientSecret.nonBlank,
            clearClientSecret: saved.hasClientSecret && clearClientSecret ? true : nil,
            scopes: scopes,
            publicUrl: publicUrl,
            allowSignup: allowSignup,
            matchEmail: matchEmail,
            requiredGroup: requiredGroup.nonBlank,
            trustedGroup: trustedGroup.nonBlank,
            groupsClaim: groupsClaim
        )
    }

    private func prefill(_ settings: API.SsoSettings) {
        guard !prefilled else { return }
        prefilled = true
        name = settings.name
        publicUrl = settings.publicUrl
        issuer = settings.issuer
        clientId = settings.clientId
        scopes = settings.scopes
        allowSignup = settings.allowSignup
        matchEmail = settings.matchEmail
        requiredGroup = settings.requiredGroup ?? ""
        trustedGroup = settings.trustedGroup ?? ""
        groupsClaim = settings.groupsClaim
    }

    private func runTest() {
        testing = true
        test = nil
        let api = model.api
        let issuer = issuer
        Task {
            do {
                test = .success(try await api.integrations.sso.test(issuer: issuer))
            } catch {
                test = .failure(TestFailure(message: error.localizedDescription))
            }
            testing = false
        }
    }

    private func save() {
        pending = true
        message = nil
        let api = model.api
        let request = request
        let session = model.session
        Task {
            do {
                let fresh = try await api.integrations.sso.save(request)
                clientSecret = ""
                clearClientSecret = false
                // The issuer as the provider states it.
                issuer = fresh.issuer
                onChange(fresh)
                message = ("Saved. The sign-in button is live.", false)
                // The sign-in screen and Linked accounts read server-info.
                await session.refreshInfo()
            } catch {
                message = (error.localizedDescription, true)
            }
            pending = false
        }
    }

    private func remove() {
        removing = true
        message = nil
        let api = model.api
        let session = model.session
        Task {
            do {
                let fresh = try await api.integrations.sso.remove()
                clientSecret = ""
                clearClientSecret = false
                confirmingRemove = false
                onChange(fresh)
                message = ("Single sign-on is off. Accounts keep their links in case you set it up again.", false)
                await session.refreshInfo()
            } catch {
                message = (error.localizedDescription, true)
            }
            removing = false
        }
    }
}

/// A settings field with the website's hint line under it.
private struct HintedField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var hint: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            SettingsField(label: label, text: $text, placeholder: placeholder)
            if let hint {
                Text(hint)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// A checkbox with its explanation under the label, like the website's.
private struct HintedToggle: View {
    let label: String
    @Binding var isOn: Bool
    let hint: String

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textPrimary)
                Text(hint)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .toggleStyle(.checkbox)
    }
}
