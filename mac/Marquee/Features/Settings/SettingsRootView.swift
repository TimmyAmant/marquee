import SwiftUI

/// Settings' tabs, in the website's order (lib/settings/tabs.ts) and the
/// Windows app's (Marquee.Core/Settings/SettingsTabs.cs).
enum SettingsTab: String, Hashable, CaseIterable {
    case account, general, members, mediaServers, services, notifications, discover, blocklist, jobs, logs, activity, about
}

extension SettingsTab {
    var title: String {
        switch self {
        case .account: return String(localized: "Account")
        case .general: return String(localized: "General")
        case .members: return String(localized: "Members")
        case .mediaServers: return String(localized: "Media servers")
        case .services: return String(localized: "Services")
        case .notifications: return String(localized: "Notifications")
        case .discover: return String(localized: "Discover")
        case .blocklist: return String(localized: "Blocklist")
        case .jobs: return String(localized: "Jobs")
        case .logs: return String(localized: "Logs")
        case .activity: return String(localized: "Activity")
        case .about: return String(localized: "About")
        }
    }

    /// Who sees it: everyone, the admin, or (Blocklist) whoever may manage
    /// the blocklist — the admin, or a member it was handed to.
    func isVisible(isAdmin: Bool, canManageBlocklist: Bool) -> Bool {
        switch self {
        case .account, .notifications, .about: return true
        case .blocklist: return isAdmin || canManageBlocklist
        case .general, .members, .mediaServers, .services, .discover, .jobs, .logs, .activity: return isAdmin
        }
    }

    /// The tabs this viewer gets, in order. Discover also needs a server
    /// that has it (0.49+).
    static func visible(isAdmin: Bool, canManageBlocklist: Bool, hasDiscover: Bool = true) -> [SettingsTab] {
        allCases.filter {
            $0.isVisible(isAdmin: isAdmin, canManageBlocklist: canManageBlocklist) && ($0 != .discover || hasDiscover)
        }
    }

    /// The tab to show for `requested`: one the viewer can't see (an old
    /// link, a demotion) lands on Account.
    static func current(_ requested: SettingsTab, in tabs: [SettingsTab]) -> SettingsTab {
        tabs.contains(requested) ? requested : .account
    }
}

/// Settings › Notifications' own tabs (the website's per-agent tabs): yours,
/// then the household's channels, the admin's.
enum NotificationsSubTab: String, Hashable, CaseIterable {
    case personal, household, discord, ntfy, telegram, pushover, email, gotify, slack, pushbullet, webhook

    var title: String {
        switch self {
        case .personal: return String(localized: "Personal")
        case .household: return String(localized: "Household events")
        case .discord: return "Discord" // i18n-ignore: brand
        case .ntfy: return "ntfy" // i18n-ignore: brand
        case .telegram: return "Telegram" // i18n-ignore: brand
        case .pushover: return "Pushover" // i18n-ignore: brand
        case .email: return String(localized: "Email")
        case .gotify: return "Gotify" // i18n-ignore: brand
        case .slack: return "Slack" // i18n-ignore: brand
        case .pushbullet: return "Pushbullet" // i18n-ignore: brand
        case .webhook: return String(localized: "Webhook")
        }
    }

    static func visible(isAdmin: Bool) -> [NotificationsSubTab] {
        isAdmin ? allCases : [.personal]
    }
}

/// How wide Settings' column is: the header and every tab share it, centered
/// in the window.
enum SettingsLayout {
    static let columnWidth: CGFloat = 820
}

/// app/settings/layout.tsx with components/settings-nav.tsx: Settings as a
/// page of the main window (your photo on the rail, ⌘,), the tabs across
/// the top (scrolling sideways when the window is narrow) and the chosen
/// one below.
struct SettingsRootView: View {
    @Environment(AppModel.self) private var model
    /// A server older than 0.49 has no Settings › Discover (it answers 404).
    @State private var discoverUnavailable = false

    var body: some View {
        let isAdmin = model.viewer?.isAdmin == true
        let tabs = SettingsTab.visible(
            isAdmin: isAdmin,
            canManageBlocklist: model.viewer?.can(.manageBlocklist) == true,
            hasDiscover: !discoverUnavailable
        )
        let current = SettingsTab.current(model.settingsTab, in: tabs)

        // One scroll view for the header and the tab, so both center on the
        // same width whether or not a scroll bar takes room at the edge.
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 14) {
                    // Opened from a page ("Connect Radarr…" on a title, say):
                    // the way back to it.
                    if let back = model.settingsReturn {
                        Button {
                            model.returnFromSettings()
                        } label: {
                            Label(back.path.isEmpty ? "Back to \(back.selection.title)" : "Back", systemImage: "chevron.left")
                                .font(.system(size: 12.5, weight: .medium))
                        }
                        .buttonStyle(QuietButtonStyle())
                        .keyboardShortcut("[", modifiers: .command)
                    }
                    Text("Settings")
                        .font(.marqueeDisplay(30))
                        .foregroundStyle(Theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    VStack(spacing: 10) {
                        // Wraps onto a second line rather than scrolling:
                        // a sideways-scrolling row hid Activity and About
                        // off the right edge with nothing to say they were there.
                        FlowLayout(spacing: 2, lineSpacing: 6, centersLines: true) {
                            ForEach(tabs, id: \.self) { tab in
                                SettingsTabButton(title: tab.title, current: tab == current) {
                                    model.settingsTab = tab
                                }
                            }
                        }
                        Divider().overlay(Theme.border)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.top, 24)
                .padding(.bottom, 4)
                .frame(maxWidth: SettingsLayout.columnWidth, alignment: .leading)
                .frame(maxWidth: .infinity)

                Group {
                    switch current {
                    case .account: AccountSettingsView()
                    case .general: IntegrationsSettingsView(part: .general)
                    case .members: MembersSettingsView()
                    case .mediaServers: IntegrationsSettingsView(part: .mediaServers)
                    case .services: IntegrationsSettingsView(part: .services)
                    case .notifications: NotificationsSettingsView()
                    case .discover: DiscoverSettingsView()
                    case .blocklist: BlocklistSettingsView()
                    case .jobs: JobsSettingsView()
                    case .logs: LogsSettingsView()
                    case .activity: ActivitySettingsView()
                    case .about: AboutSettingsView()
                    }
                }
                .environment(\.settingsPaneScrolls, false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.bg0)
        .tint(Theme.accent)
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
}

/// One of the tabs: a pill, solid for the current one. Notifications' own
/// tabs use the smaller, outlined `small` kind.
struct SettingsTabButton: View {
    let title: String
    let current: Bool
    var small = false
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: small ? 12 : 13, weight: .medium))
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, small ? 11 : 12)
                .frame(height: small ? 26 : 30)
                .foregroundStyle(foreground)
                .background(Capsule().fill(fill))
                .overlay {
                    if small {
                        Capsule().strokeBorder(current ? Theme.accent : Theme.border)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
        .accessibilityAddTraits(current ? .isSelected : [])
    }

    private var foreground: Color {
        if small { return current || hovering ? Theme.textPrimary : Theme.textSecondary }
        return current ? Theme.bg0 : (hovering ? Theme.textPrimary : Theme.textSecondary)
    }

    private var fill: Color {
        if small { return current ? Theme.accent.opacity(0.15) : .clear }
        return current ? Theme.textPrimary : (hovering ? Theme.textPrimary.opacity(0.1) : .clear)
    }
}

extension EnvironmentValues {
    /// False inside `SettingsRootView`, whose one scroll view holds the
    /// header and the pane together.
    @Entry var settingsPaneScrolls = true
}

/// A titled group of settings (components/settings/settings-ui.tsx's
/// SettingsSection): the title, a line under it, then its content.
struct SettingsSection<Content: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            content()
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Rows in one card with a hairline between each (SettingsGroup on the web).
struct SettingsGroup<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content()) { rows in
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { Divider().overlay(Theme.border) }
                    row
                }
            }
        }
        .frame(maxWidth: .infinity)
        .cardSurface(padding: 0)
    }
}

/// One setting: its label and a short help text on the left, the control on
/// the right (SettingRow on the web).
struct SettingsRow<Control: View>: View {
    let label: String
    var help: String?
    @ViewBuilder let control: () -> Control

    var body: some View {
        HStack(alignment: .center, spacing: 24) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                if let help {
                    Text(help)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            control()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
    }
}

/// A read-only value on the right of a row.
struct SettingsValue: View {
    let text: String
    var mono = false

    var body: some View {
        Text(text)
            .font(.system(size: 13, design: mono ? .monospaced : .default))
            .foregroundStyle(Theme.textPrimary)
            .textSelection(.enabled)
    }
}

/// Shared scaffolding for each settings pane.
struct SettingsPane<Content: View>: View {
    let title: String
    var subtitle: String?
    var trailing: AnyView?
    @ViewBuilder let content: () -> Content

    @Environment(\.settingsPaneScrolls) private var scrolls

    var body: some View {
        if scrolls {
            ScrollView { column }
                .background(Theme.bg0)
        } else {
            column
        }
    }

    private var column: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.marqueeDisplay(24))
                        .foregroundStyle(Theme.textPrimary)
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer()
                if let trailing { trailing }
            }
            content()
        }
        .padding(28)
        // The page's column, centered; the scroll view stays full width
        // so its scroll bar sits at the window's edge.
        .frame(maxWidth: SettingsLayout.columnWidth, alignment: .leading)
        .frame(maxWidth: .infinity)
    }
}

/// A text input as a settings row (the website's SettingRow): the label and
/// any help on the left, the field on the right — or the label above the
/// field where the row is too narrow for both (a sheet).
struct SettingsField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var secure = false
    var help: String?

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 24) {
                caption
                    .frame(minWidth: 160, maxWidth: .infinity, alignment: .leading)
                field
                    .frame(width: 320)
            }
            VStack(alignment: .leading, spacing: 5) {
                caption
                field
            }
        }
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.textPrimary)
            if let help {
                Text(help)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var field: some View {
        Group {
            if secure {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
            }
        }
        .textFieldStyle(.plain)
        .font(.system(size: 13))
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border))
        .accessibilityLabel(label)
    }
}

/// A form's one Save, at its foot (the website's SaveBar): what happened on
/// the left, any other actions, then the main button on the right.
struct SettingsSaveBar<Secondary: View>: View {
    let title: String
    var pendingTitle: String?
    var pending = false
    var disabled = false
    var message: (String, Bool)?
    let action: () -> Void
    @ViewBuilder var secondary: () -> Secondary

    var body: some View {
        VStack(spacing: 12) {
            Divider().overlay(Theme.border)
            HStack(spacing: 12) {
                if let message {
                    InlineMessage(text: message.0, isError: message.1)
                }
                Spacer(minLength: 0)
                secondary()
                Button(pending ? (pendingTitle ?? title) : title, action: action)
                    .buttonStyle(AccentButtonStyle())
                    .disabled(pending || disabled)
            }
        }
        .padding(.top, 4)
    }
}

extension SettingsSaveBar where Secondary == EmptyView {
    init(title: String, pendingTitle: String? = nil, pending: Bool = false, disabled: Bool = false, message: (String, Bool)? = nil, action: @escaping () -> Void) {
        self.init(title: title, pendingTitle: pendingTitle, pending: pending, disabled: disabled, message: message, action: action) { EmptyView() }
    }
}

struct ConnectedPill: View {
    var text = String(localized: "Connected")

    var body: some View {
        TonePill(text: text, tone: .owned, small: true)
    }
}

/// A key/value row in a settings card.
struct SettingsStatRow: View {
    let label: String
    let value: String
    var last = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(label).foregroundStyle(Theme.textSecondary)
                Spacer()
                Text(value)
                    .font(.system(size: 12.5, design: .monospaced))
                    .foregroundStyle(Theme.textPrimary)
                    .textSelection(.enabled)
            }
            .font(.system(size: 13))
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            if !last { Divider().overlay(Theme.border) }
        }
    }
}

// MARK: - Activity (app/settings/activity/page.tsx)

struct ActivitySettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var events: [API.ActivityItem]?
    @State private var error: String?

    var body: some View {
        SettingsPane(title: String(localized: "Activity"), subtitle: String(localized: "Who requested what, and who reviewed it — most recent first.")) {
            if let events {
                if events.isEmpty {
                    Text("Nothing yet.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                            if index > 0 { Divider().overlay(Theme.border) }
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                (Text(event.actor.label).fontWeight(.medium).foregroundStyle(Theme.textPrimary)
                                    + Text(" \(event.verb)").foregroundStyle(Theme.textSecondary))
                                    .font(.system(size: 13))
                                Button(event.title) {
                                    model.openTitle(event.titleID)
                                    model.showMainWindow()
                                }
                                .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                                .font(.system(size: 13))
                                Spacer()
                                Text(Format.dateTime(event.createdAt))
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.textMuted)
                            }
                            .padding(.horizontal, 18)
                            .padding(.vertical, 12)
                        }
                    }
                    .cardSurface(padding: 0)
                }
            } else if let error {
                InlineMessage(text: error)
            } else {
                LoadingView()
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .requests))) {
            do {
                let fresh = try await model.api.activity.recent()
                if Task.isCancelled { return }
                events = fresh
                error = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if events == nil { self.error = error.localizedDescription }
            }
        }
    }
}

// MARK: - Jobs (app/settings/jobs/page.tsx)

struct JobsSettingsView: View {
    /// What this Mac has seen a job do since Settings was opened. The server
    /// keeps no run history of its own (`GET /settings/jobs` is schedules only).
    private struct Run: Equatable {
        var finishedAt: Date?
        var error: String?
    }

    @Environment(AppModel.self) private var model
    @State private var jobs: [API.Job]?
    @State private var loadError: String?
    @State private var runs: [String: Run] = [:]
    @State private var running: Set<String> = []

    var body: some View {
        SettingsPane(
            title: String(localized: "Jobs"),
            subtitle: String(localized: "Your Marquee server runs these maintenance tasks on a schedule — you can also trigger one manually below. Running a job now doesn't change its schedule.")
        ) {
            if let jobs {
                if jobs.isEmpty {
                    Text("This server reports no scheduled jobs.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(jobs.enumerated()), id: \.element.id) { index, job in
                            if index > 0 { Divider().overlay(Theme.border) }
                            jobRow(job)
                        }
                    }
                    .cardSurface(padding: 0)
                }
            } else if let loadError {
                InlineMessage(text: loadError)
            } else {
                LoadingView()
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .settings))) {
            do {
                let fresh = try await model.api.jobs.list()
                if Task.isCancelled { return }
                jobs = fresh
                loadError = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if jobs == nil { loadError = error.localizedDescription }
            }
        }
    }

    private func jobRow(_ job: API.Job) -> some View {
        let isRunning = running.contains(job.id)
        let run = runs[job.id]

        return HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(job.name)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                Text(job.description)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if job.interval != nil {
                    // 0.58+: how often it runs, and when it runs next.
                    JobIntervalSetting(job: job) { updated in
                        jobs = jobs?.map { $0.id == updated.id ? updated : $0 }
                    }
                } else {
                    HStack(spacing: 10) {
                        Text(job.schedule)
                        if let finishedAt = run?.finishedAt {
                            Text("Ran from this Mac \(Format.timeAgo(finishedAt))")
                        }
                    }
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                }
                // 0.46+: the Can't Find Check's wait (components/not-found-hours-setting.tsx).
                if job.id == API.Job.notFoundCheckID {
                    NotFoundHoursSetting()
                }
                if let error = run?.error {
                    InlineMessage(text: error)
                } else if run?.finishedAt != nil {
                    InlineMessage(text: String(localized: "Done."), isError: false)
                }
            }
            Spacer()
            Button(isRunning ? "Running…" : "Run now") { runNow(job) }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(isRunning)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    private func runNow(_ job: API.Job) {
        guard !running.contains(job.id) else { return }
        running.insert(job.id)
        runs[job.id] = nil
        let api = model.api
        Task {
            do {
                try await api.jobs.run(job.id)
                runs[job.id] = Run(finishedAt: Date(), error: nil)
            } catch {
                runs[job.id] = Run(finishedAt: nil, error: error.localizedDescription)
            }
            running.remove(job.id)
        }
    }
}

/// Settings › Jobs, under the Can't Find Check: "Flag a request after [24]
/// hours without a find". Nothing when the server doesn't have the setting.
private struct NotFoundHoursSetting: View {
    @Environment(AppModel.self) private var model
    /// What the server has; nil until loaded (or on an older server).
    @State private var saved: Int?
    @State private var value = API.NotFoundSettings.defaultAfterHours
    @State private var busy = false
    @State private var message: (String, Bool)?

    var body: some View {
        Group {
            if let saved {
                HStack(spacing: 8) {
                    Text("Flag a request after")
                    TextField("", value: $value, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 56)
                        .multilineTextAlignment(.trailing)
                        .onSubmit { save() }
                        .accessibilityLabel("Hours")
                    Stepper("", value: $value, in: API.NotFoundSettings.allowedHours)
                        .labelsHidden()
                    Text("hours without a find")
                    if value != saved {
                        Button(busy ? "Saving…" : "Save") { save() }
                            .buttonStyle(AccentButtonStyle(compact: true))
                            .disabled(busy)
                    }
                    if let message, value == saved || message.1 {
                        Text(message.0)
                            .foregroundStyle(message.1 ? Theme.danger : Theme.owned)
                    }
                }
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textSecondary)
                .padding(.top, 4)
            }
        }
        .task(id: model.reloadToken) {
            // An older server (404) or a failure: leave the row as it was.
            guard let settings = try? await model.api.jobs.notFoundSettings(), !Task.isCancelled else { return }
            saved = settings.afterHours
            value = settings.afterHours
        }
    }

    private func save() {
        guard !busy, value != saved else { return }
        busy = true
        message = nil
        let api = model.api
        let hours = value
        Task {
            do {
                let result = try await api.jobs.saveNotFoundSettings(API.NotFoundSettings(afterHours: hours))
                saved = result.afterHours
                value = result.afterHours
                message = (String(localized: "Saved"), false)
            } catch {
                message = (error.localizedDescription, true)
            }
            busy = false
        }
    }
}

// MARK: - About (app/settings/about/page.tsx)

struct AboutSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL

    @State private var info: API.AboutInfo?
    @State private var error: String?

    var body: some View {
        SettingsPane(title: String(localized: "About Marquee"), subtitle: String(localized: "Version, library stats, and where to get help.")) {
            SettingsSectionTitle(text: String(localized: "Updates"))
            VStack(alignment: .leading, spacing: 14) {
                UpdateStatusView(style: .settings)
                ServerUpdateLine(
                    // This page's own GET /settings/about: the server-info
                    // probe isn't made when a saved sign-in is restored.
                    server: (info?.version ?? model.session.serverInfo?.version).flatMap { AppVersion($0) },
                    latest: model.updater.latestRelease
                )
            }
            .cardSurface(padding: 18)

            if let info {
                VStack(spacing: 0) {
                    SettingsStatRow(label: String(localized: "Server Version"), value: info.versionLabel)
                    SettingsStatRow(label: String(localized: "App Version"), value: "v\(AppInfo.version) (\(AppInfo.build))")
                    SettingsStatRow(label: String(localized: "Movies"), value: "\(info.movieCount)")
                    SettingsStatRow(label: String(localized: "TV Shows"), value: "\(info.tvCount)")
                    SettingsStatRow(label: String(localized: "Tracked (not yet owned)"), value: "\(info.trackedCount)")
                    SettingsStatRow(label: String(localized: "Total Requests"), value: "\(info.totalRequests)")
                    SettingsStatRow(label: String(localized: "Server"), value: model.session.server?.displayName ?? "—")
                    SettingsStatRow(label: String(localized: "Time Zone"), value: info.timeZone, last: true)
                }
                .cardSurface(padding: 0)

                SettingsSectionTitle(text: String(localized: "Getting Support"))
                VStack(spacing: 0) {
                    linkRow(String(localized: "Releases")) { openWindow(id: "changelog") }
                    linkRow(String(localized: "What the colors mean")) { openWindow(id: "status-colors") }
                    linkRow(String(localized: "Error reference")) { openWindow(id: "error-reference") }
                    if let repo = info.repoURL {
                        linkRow("GitHub") { openURL(repo) }
                    }
                    if let issues = info.issuesURL {
                        linkRow(String(localized: "Report an issue"), last: true) { openURL(issues) }
                    }
                }
                .cardSurface(padding: 0)
            } else if let error {
                InlineMessage(text: error)
            } else {
                LoadingView()
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .requests]))) {
            do {
                let fresh = try await model.api.about.info()
                if Task.isCancelled { return }
                info = fresh
                error = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if info == nil { self.error = error.localizedDescription }
            }
        }
    }

    private func linkRow(_ label: String, last: Bool = false, action: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Button(action: action) {
                HStack {
                    Text(label)
                    Spacer()
                    Image(systemName: "arrow.right")
                }
                .font(.system(size: 13))
                .padding(.horizontal, 18)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(QuietButtonStyle())
            if !last { Divider().overlay(Theme.border) }
        }
    }
}

/// Settings › About's line about the server, under a hairline: whether it
/// runs the newest release, and if not, how to get it. The server updates by
/// pulling its Docker image, which the app can't do for you. Nothing until
/// both versions are known (the first update check hasn't answered yet, or
/// the server didn't say).
struct ServerUpdateLine: View {
    let server: AppVersion?
    let latest: AppVersion?

    var body: some View {
        if let server, let latest {
            Divider().overlay(Theme.border)
            if server >= latest {
                Label("Your server is up to date (Marquee \(server.description)).", systemImage: "checkmark.circle")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
            } else {
                Label {
                    Text("Your server is on \(server.description); \(latest.description) is out. Update it by pulling the new Docker image (on Unraid: the Docker tab › Check for Updates, then apply the update).")
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(Theme.accent)
                }
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textPrimary)
            }
        }
    }
}

/// A settings section's title, where a card brings its own layout
/// (`SettingsSection` for the rest).
struct SettingsSectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }
}
