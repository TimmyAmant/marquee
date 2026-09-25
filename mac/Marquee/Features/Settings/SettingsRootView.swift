import SwiftUI

enum SettingsTab: String, Hashable, CaseIterable {
    case account, integrations, activity, jobs, about
}

extension SettingsTab {
    var title: String {
        switch self {
        case .account: return "Account"
        case .integrations: return "Integrations"
        case .activity: return "Activity"
        case .jobs: return "Jobs"
        case .about: return "About"
        }
    }

    var systemImage: String {
        switch self {
        case .account: return "person.crop.circle"
        case .integrations: return "powerplug"
        case .activity: return "clock"
        case .jobs: return "arrow.triangle.2.circlepath"
        case .about: return "info.circle"
        }
    }

    /// Integrations, Activity and Jobs are the admin's.
    var isAdminOnly: Bool {
        switch self {
        case .integrations, .activity, .jobs: return true
        case .account, .about: return false
        }
    }
}

/// How wide Settings' column is: the header and every tab share it, centered
/// in the window.
enum SettingsLayout {
    static let columnWidth: CGFloat = 760
}

/// app/settings/layout.tsx with components/settings-nav.tsx: Settings as a
/// page of the main window (your photo on the rail, ⌘,), the tabs across
/// the top and the chosen one below.
struct SettingsRootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let isAdmin = model.viewer?.isAdmin == true
        let tabs = SettingsTab.allCases.filter { isAdmin || !$0.isAdminOnly }
        // A member sent to an admin-only tab (an old link) lands on Account.
        let current = tabs.contains(model.settingsTab) ? model.settingsTab : .account

        // One scroll view for the header and the tab, so both center on the
        // same width whether or not a scroll bar takes room at the edge.
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Settings")
                        .font(.marqueeDisplay(30))
                        .foregroundStyle(Theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    HStack(spacing: 6) {
                        ForEach(tabs, id: \.self) { tab in
                            SettingsTabButton(tab: tab, current: tab == current) {
                                model.settingsTab = tab
                            }
                        }
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
                    case .integrations: IntegrationsSettingsView()
                    case .activity: ActivitySettingsView()
                    case .jobs: JobsSettingsView()
                    case .about: AboutSettingsView()
                    }
                }
                .environment(\.settingsPaneScrolls, false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.bg0)
        .tint(Theme.accent)
    }
}

/// One of the tabs: a pill, solid for the current one.
private struct SettingsTabButton: View {
    let tab: SettingsTab
    let current: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Label(tab.title, systemImage: tab.systemImage)
                .font(.system(size: 13, weight: .medium))
                .padding(.horizontal, 14)
                .frame(height: 32)
                .foregroundStyle(current ? Theme.bg0 : (hovering ? Theme.textPrimary : Theme.textSecondary))
                .background(
                    Capsule().fill(current ? Theme.textPrimary : (hovering ? Theme.textPrimary.opacity(0.1) : .clear))
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
        .accessibilityAddTraits(current ? .isSelected : [])
    }
}

extension EnvironmentValues {
    /// False inside `SettingsRootView`, whose one scroll view holds the
    /// header and the pane together.
    @Entry var settingsPaneScrolls = true
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

/// Labeled text input styled like the web forms.
struct SettingsField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var secure = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
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
        }
    }
}

struct ConnectedPill: View {
    var text = "Connected"

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
        SettingsPane(title: "Activity", subtitle: "Who requested what, and who reviewed it — most recent first.") {
            if let events {
                if events.isEmpty {
                    Text("Nothing yet.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    VStack(spacing: 8) {
                        ForEach(events) { event in
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
                            .cardSurface(padding: 12, radius: 12)
                        }
                    }
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
            title: "Jobs",
            subtitle: "Your Marquee server runs these maintenance tasks on a schedule — you can also trigger one manually below. Running a job now doesn't change its schedule."
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
                HStack(spacing: 10) {
                    Text(job.schedule)
                    if let finishedAt = run?.finishedAt {
                        Text("Ran from this Mac \(Format.timeAgo(finishedAt))")
                    }
                }
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textSecondary)
                if let error = run?.error {
                    InlineMessage(text: error)
                } else if run?.finishedAt != nil {
                    InlineMessage(text: "Done.", isError: false)
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

// MARK: - About (app/settings/about/page.tsx)

struct AboutSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL

    @State private var info: API.AboutInfo?
    @State private var error: String?

    var body: some View {
        SettingsPane(title: "About Marquee", subtitle: "Version, library stats, and where to get help.") {
            SettingsSectionLabel(text: "Updates")
            UpdateStatusView(style: .settings)
                .cardSurface(padding: 18)

            if let info {
                VStack(spacing: 0) {
                    SettingsStatRow(label: "Server Version", value: info.versionLabel)
                    SettingsStatRow(label: "App Version", value: "v\(AppInfo.version) (\(AppInfo.build))")
                    SettingsStatRow(label: "Movies", value: "\(info.movieCount)")
                    SettingsStatRow(label: "TV Shows", value: "\(info.tvCount)")
                    SettingsStatRow(label: "Tracked (not yet owned)", value: "\(info.trackedCount)")
                    SettingsStatRow(label: "Total Requests", value: "\(info.totalRequests)")
                    SettingsStatRow(label: "Server", value: model.session.server?.displayName ?? "—")
                    SettingsStatRow(label: "Time Zone", value: info.timeZone, last: true)
                }
                .cardSurface(padding: 0)

                SettingsSectionLabel(text: "Getting Support")
                VStack(spacing: 0) {
                    linkRow("Releases") { openWindow(id: "changelog") }
                    linkRow("Error reference") { openWindow(id: "error-reference") }
                    if let repo = info.repoURL {
                        linkRow("GitHub") { openURL(repo) }
                    }
                    if let issues = info.issuesURL {
                        linkRow("Report an issue", last: true) { openURL(issues) }
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
