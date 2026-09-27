import AppKit
import SwiftUI
import Observation

// Settings › Integrations › API keys (0.47+, api-v1.md §16): keys for
// dashboards like Homepage or Homarr, scripts and other apps. The secret is
// shown once, right after it's made. An older server (404) shows nothing.

/// The card's state, apart from the view so it's testable.
@MainActor
@Observable
final class ApiKeysModel {
    /// "Expires": the website's choices.
    enum Expiry: CaseIterable, Hashable, Sendable {
        case never
        case days30
        case days90
        case year

        /// `expiresInDays`; nil never expires.
        var days: Int? {
            switch self {
            case .never: return nil
            case .days30: return 30
            case .days90: return 90
            case .year: return 365
            }
        }

        var label: String {
            switch self {
            case .never: return String(localized: "Never")
            case .days30: return String(localized: "30 days")
            case .days90: return String(localized: "90 days")
            case .year: return String(localized: "1 year")
            }
        }
    }

    /// The server's own message for a blank name, checked here first.
    static let blankNameMessage = String(localized: "Give the key a name, like Homepage.")

    /// nil until the first load answers.
    private(set) var keys: [API.ApiKey]?
    private(set) var loadError: String?
    /// The server has no API keys (older than 0.47), or this account can't
    /// manage them: the card isn't shown at all.
    private(set) var isUnavailable = false
    /// Who a key can act as, besides the admin.
    private(set) var members: [API.HouseholdMember] = []

    // The "Create a key" form.
    var name = ""
    var scope: API.ApiKeyScope = .read
    /// nil: the admin (you).
    var actAsUserId: UUID?
    var expiry: Expiry = .never
    private(set) var isCreating = false
    private(set) var createError: String?
    /// The new key's secret, until Done. Never stored anywhere else.
    private(set) var createdSecret: String?

    /// The row asking "Revoke …?".
    var confirmingRevokeId: String?
    private(set) var revokingId: String?
    private(set) var revokeErrors: [String: String] = [:]

    var isVisible: Bool { !isUnavailable && (keys != nil || loadError != nil) }
    var canCreate: Bool { !isCreating }

    func load(_ api: MarqueeAPI) async {
        do {
            let fresh = try await api.apiKeys.list()
            if Task.isCancelled { return }
            keys = fresh
            loadError = nil
            isUnavailable = false
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            isUnavailable = true
            return
        } catch APIError.forbidden {
            isUnavailable = true
            return
        } catch {
            if keys == nil { loadError = error.localizedDescription }
            return
        }
        // Everyone but the admin, for "Act as". Without them the key can
        // still be the admin's.
        if let users = try? await api.users.list(), !Task.isCancelled {
            members = users.filter { !$0.isCurrentUser && !$0.isAdmin }
            if let actAsUserId, !members.contains(where: { $0.id == actAsUserId }) {
                self.actAsUserId = nil
            }
        }
    }

    /// The form as the server expects it; nil (and the server's message)
    /// for a blank name, without asking the server.
    var request: API.CreateApiKeyRequest? {
        guard let trimmed = name.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        return API.CreateApiKeyRequest(
            name: trimmed,
            scope: scope,
            actAsUserId: actAsUserId.map { $0.uuidString.lowercased() },
            expiresInDays: expiry.days
        )
    }

    func create(_ api: MarqueeAPI) async {
        guard canCreate else { return }
        guard let request else {
            createError = Self.blankNameMessage
            return
        }
        isCreating = true
        createError = nil
        do {
            let created = try await api.apiKeys.create(request)
            createdSecret = created.key
            var list = keys ?? []
            list.removeAll { $0.id == created.apiKey.id }
            list.append(created.apiKey)
            keys = list
            name = ""
            scope = .read
            actAsUserId = nil
            expiry = .never
        } catch APIError.notFound {
            createError = String(localized: "That household member doesn't exist any more.")
        } catch {
            createError = error.localizedDescription
        }
        isCreating = false
    }

    /// "Done": the secret is gone for good.
    func dismissSecret() {
        createdSecret = nil
    }

    func revoke(_ key: API.ApiKey, _ api: MarqueeAPI) async {
        guard revokingId == nil else { return }
        revokingId = key.id
        revokeErrors[key.id] = nil
        do {
            try await api.apiKeys.revoke(key.id)
            removeKey(key.id)
        } catch APIError.notFound {
            // Already gone.
            removeKey(key.id)
        } catch {
            revokeErrors[key.id] = error.localizedDescription
        }
        revokingId = nil
    }

    private func removeKey(_ id: String) {
        keys?.removeAll { $0.id == id }
        if confirmingRevokeId == id { confirmingRevokeId = nil }
    }

    // MARK: Labels

    /// "as Kid" when the key acts as a household member.
    static func actAsLabel(_ key: API.ApiKey) -> String? {
        key.actAs.map { String(localized: "as \($0.label)") }
    }

    /// "Created Sep 20, 2026".
    static func createdLabel(_ key: API.ApiKey, timeZone: TimeZone = .current, locale: Locale = .current) -> String {
        let day = dayString(key.createdAt, timeZone: timeZone, locale: locale)
        return String(localized: "Created \(day)")
    }

    /// "Expires Dec 19, 2026", "Never expires" or "Expired".
    static func expiryLabel(_ key: API.ApiKey, now: Date = Date(), timeZone: TimeZone = .current, locale: Locale = .current) -> String {
        if isExpired(key, now: now) { return String(localized: "Expired") }
        guard let expiresAt = key.expiresAt else { return String(localized: "Never expires") }
        let day = dayString(expiresAt, timeZone: timeZone, locale: locale)
        return String(localized: "Expires \(day)")
    }

    static func isExpired(_ key: API.ApiKey, now: Date = Date()) -> Bool {
        if key.expired { return true }
        guard let expiresAt = key.expiresAt else { return false }
        return expiresAt <= now
    }

    /// "Last used 2 minutes ago" / "Never used".
    static func lastUsedLabel(_ key: API.ApiKey, now: Date = Date(), timeZone: TimeZone = .current, locale: Locale = .current) -> String {
        guard let lastUsedAt = key.lastUsedAt else { return String(localized: "Never used") }
        let minute: TimeInterval = 60
        let hour = 60 * minute
        let day = 24 * hour
        let ago = max(0, now.timeIntervalSince(lastUsedAt))
        if ago < 2 * minute { return String(localized: "Last used just now") }
        if ago < hour {
            let minutes = Int(ago / minute)
            return String(localized: "Last used \(minutes) minutes ago")
        }
        if ago < day {
            let hours = Int(ago / hour)
            return String(localized: "Last used \(hours) hours ago")
        }
        if ago < 2 * day { return String(localized: "Last used yesterday") }
        if ago < 30 * day {
            let days = Int(ago / day)
            return String(localized: "Last used \(days) days ago")
        }
        let date = dayString(lastUsedAt, timeZone: timeZone, locale: locale)
        return String(localized: "Last used \(date)")
    }

    private static func dayString(_ date: Date, timeZone: TimeZone, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("MMMdyyyy")
        return formatter.string(from: date)
    }
}

/// The "API keys" section: hidden entirely until the server answers, and
/// for good on an older server.
struct ApiKeysSection: View {
    @Environment(AppModel.self) private var model
    @State private var keys = ApiKeysModel()

    var body: some View {
        Group {
            if keys.isVisible {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionLabel(text: String(localized: "API keys"))
                    ApiKeysCard(keys: keys)
                }
                .padding(.top, 8)
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .settings))) {
            await keys.load(model.api)
        }
    }
}

struct ApiKeysCard: View {
    @Bindable var keys: ApiKeysModel
    @Environment(AppModel.self) private var model

    var body: some View {
        IntegrationCard(
            title: String(localized: "API keys"),
            description: String(localized: "Let dashboards like Homepage or Homarr, scripts and other apps use Marquee. A key works like signing in, so keep it secret.")
        ) {
            if let loadError = keys.loadError, keys.keys == nil {
                InlineMessage(text: loadError)
            }
            if let list = keys.keys {
                if list.isEmpty {
                    Text("No keys yet.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(list.enumerated()), id: \.element.id) { index, key in
                            if index > 0 { Divider().overlay(Theme.border) }
                            row(key)
                        }
                    }
                }
            }
            if let secret = keys.createdSecret {
                secretPanel(secret)
            }
            Divider().overlay(Theme.border)
            createForm
        }
    }

    // MARK: Rows

    private func row(_ key: API.ApiKey) -> some View {
        let expired = ApiKeysModel.isExpired(key)
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(key.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text(key.scope.label)
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                    if let actAs = ApiKeysModel.actAsLabel(key) {
                        Text(actAs)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                HStack(spacing: 6) {
                    Text(key.hint)
                        .font(.system(size: 11.5, design: .monospaced))
                        .textSelection(.enabled)
                    Text("·")
                    Text(ApiKeysModel.createdLabel(key))
                    Text("·")
                    Text(ApiKeysModel.lastUsedLabel(key))
                    Text("·")
                    Text(ApiKeysModel.expiryLabel(key))
                        .foregroundStyle(expired ? Theme.danger : Theme.textMuted)
                }
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
                if let error = keys.revokeErrors[key.id] {
                    InlineMessage(text: error)
                }
            }
            Spacer(minLength: 8)
            revokeControl(key)
        }
        .padding(.vertical, 10)
    }

    /// "Revoke", confirmed inline like Disconnect.
    @ViewBuilder
    private func revokeControl(_ key: API.ApiKey) -> some View {
        let revoking = keys.revokingId == key.id
        if keys.confirmingRevokeId == key.id {
            HStack(spacing: 8) {
                Text("Revoke \(key.name)?")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                Button(revoking ? "Revoking…" : "Confirm") { revoke(key) }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .disabled(revoking)
                Button("Cancel") { keys.confirmingRevokeId = nil }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(revoking)
            }
            .font(.system(size: 12))
        } else {
            Button("Revoke") { keys.confirmingRevokeId = key.id }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(keys.revokingId != nil)
        }
    }

    // MARK: The new key's secret

    private func secretPanel(_ secret: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            InlineMessage(text: String(localized: "Copy this key now — it won't be shown again."), isError: false)
            HStack(spacing: 8) {
                Text(secret)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Theme.textPrimary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border))
                SecretCopyButton(value: secret)
            }
            Button("Done") { keys.dismissSecret() }
                .buttonStyle(AccentButtonStyle(compact: true))
        }
        .padding(12)
        .background(Theme.bg2, in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Create

    private var createForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Create a key")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            SettingsField(label: String(localized: "Name"), text: $keys.name, placeholder: "Homepage")
            Picker("Access", selection: $keys.scope) {
                Text(API.ApiKeyScope.read.label).tag(API.ApiKeyScope.read)
                Text(API.ApiKeyScope.full.label).tag(API.ApiKeyScope.full)
            }
            Picker("Act as", selection: $keys.actAsUserId) {
                Text("Admin (you)").tag(UUID?.none)
                ForEach(keys.members) { member in
                    Text(member.label).tag(Optional(member.id))
                }
            }
            Picker("Expires", selection: $keys.expiry) {
                ForEach(ApiKeysModel.Expiry.allCases, id: \.self) { expiry in
                    Text(expiry.label).tag(expiry)
                }
            }
            if let error = keys.createError { InlineMessage(text: error) }
            Button(keys.isCreating ? "Creating…" : "Create key") { create() }
                .buttonStyle(AccentButtonStyle())
                .disabled(!keys.canCreate)
        }
        .pickerStyle(.menu)
        .font(.system(size: 12.5))
        .frame(maxWidth: 420, alignment: .leading)
    }

    private func create() {
        let api = model.api
        Task { await keys.create(api) }
    }

    private func revoke(_ key: API.ApiKey) {
        let api = model.api
        Task { await keys.revoke(key, api) }
    }
}

/// Copy, then "Copied" for a moment.
private struct SecretCopyButton: View {
    let value: String
    @State private var copied = false

    var body: some View {
        Button(copied ? "Copied" : "Copy") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(value, forType: .string)
            copied = true
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                copied = false
            }
        }
        .buttonStyle(OutlineButtonStyle(compact: true))
    }
}
