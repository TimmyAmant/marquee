import SwiftUI
import UniformTypeIdentifiers

// The Settings parts of 0.58's admin tools (components/job-schedule-setting.tsx
// and components/log-viewer.tsx on the website): how often each job runs,
// and the Logs tab.

/// Settings › Jobs, under each job: how often it runs (a preset, or once a
/// day at a time), Save, "Back to the default", and when it runs next and
/// last ran. Only for a server that sends `interval` (0.58+).
struct JobIntervalSetting: View {
    let job: API.Job
    let onSaved: (API.Job) -> Void

    @Environment(AppModel.self) private var model
    @State private var draft: API.JobInterval
    @State private var saving = false
    @State private var error: String?

    init(job: API.Job, onSaved: @escaping (API.Job) -> Void) {
        self.job = job
        self.onSaved = onSaved
        _draft = State(initialValue: job.interval ?? .hours(1))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Picker("How often \(job.name) runs", selection: menuSelection) {
                    ForEach(API.JobInterval.menuChoices, id: \.menuKey) { choice in
                        Text(choice.menuTitle).tag(choice.menuKey)
                    }
                }
                .labelsHidden()
                .fixedSize()
                if case let .daily(hour, minute) = draft {
                    DatePicker("Time of day", selection: dailyTime(hour: hour, minute: minute), displayedComponents: .hourAndMinute)
                        .labelsHidden()
                        .fixedSize()
                }
                if draft != job.interval {
                    Button(saving ? "Saving…" : "Save") { save(draft) }
                        .buttonStyle(AccentButtonStyle(compact: true))
                        .disabled(saving)
                } else if let defaultInterval = job.defaultInterval, defaultInterval != job.interval {
                    Button("Back to the default") { save(nil) }
                        .buttonStyle(QuietButtonStyle())
                        .font(.system(size: 11.5))
                        .disabled(saving)
                }
            }
            if let nextRunAt = job.nextRunAt {
                Group {
                    if let lastRunAt = job.lastRunAt {
                        Text("Next run \(nextRunAt.formatted(date: .abbreviated, time: .shortened)) · last ran \(lastRunAt.formatted(date: .abbreviated, time: .shortened))")
                    } else {
                        Text("Next run \(nextRunAt.formatted(date: .abbreviated, time: .shortened))")
                    }
                }
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
            }
            if let error { InlineMessage(text: error) }
        }
        .onChange(of: job.interval) { _, fresh in
            if let fresh { draft = fresh }
        }
    }

    private var menuSelection: Binding<String> {
        Binding(
            get: { draft.menuKey },
            set: { key in
                if key == "daily" {
                    if case .daily = draft { return }
                    draft = .daily(hour: 3, minute: 0)
                } else if let choice = API.JobInterval.menuChoices.first(where: { $0.menuKey == key }) {
                    draft = choice
                }
            }
        )
    }

    /// The daily time as a Date today, for the time picker.
    private func dailyTime(hour: Int, minute: Int) -> Binding<Date> {
        Binding(
            get: { Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date() },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                draft = .daily(hour: parts.hour ?? 3, minute: parts.minute ?? 0)
            }
        )
    }

    private func save(_ interval: API.JobInterval?) {
        saving = true
        error = nil
        let api = model.api
        let id = job.id
        Task {
            do {
                let updated = try await api.jobs.setInterval(interval, of: id)
                onSaved(updated)
                draft = updated.interval ?? draft
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

/// Settings › Logs (admin, 0.58+): the server's recent lines, secrets
/// masked, filtered by level and text, refreshed every few seconds unless
/// paused, and copied or saved as text.
struct LogsSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var level: API.LogLevel = .info
    @State private var query = ""
    @State private var entries: [API.LogEntry] = []
    @State private var latestId: Int?
    @State private var paused = false
    @State private var loaded = false
    @State private var unsupported = false
    @State private var loadError: String?
    @State private var copied = false
    @State private var exporting = false

    private static let keep = 2000

    var body: some View {
        SettingsPane(
            title: String(localized: "Logs"),
            subtitle: String(localized: "What the server has been doing, newest at the bottom. Keys, tokens and passwords are masked.")
        ) {
            if unsupported {
                InlineMessage(text: String(localized: "This server doesn't keep its log for Settings yet. Update it to see it here."), isError: false)
            } else {
                toolbar
                Text(statusLine)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                if let loadError { InlineMessage(text: loadError) }
                lines
            }
        }
        .task(id: FilterKey(level: level, query: query)) {
            // A new filter starts over, after a pause while typing.
            try? await Task.sleep(for: .milliseconds(250))
            if Task.isCancelled { return }
            await load(fresh: true)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                if Task.isCancelled { return }
                if !paused { await load(fresh: false) }
            }
        }
    }

    private struct FilterKey: Hashable {
        let level: API.LogLevel
        let query: String
    }

    private var statusLine: String {
        paused
            ? String(localized: "Paused · \(entries.count) lines")
            : String(localized: "Updating every few seconds · \(entries.count) lines")
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            Picker("Level", selection: $level) {
                ForEach(API.LogLevel.knownCases, id: \.self) { level in
                    Text("\(level.title) and up").tag(level)
                }
            }
            .labelsHidden()
            .fixedSize()
            TextField("Filter lines", text: $query)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 260)
            Spacer()
            Button(paused ? "Resume" : "Pause") { paused.toggle() }
                .buttonStyle(OutlineButtonStyle(compact: true))
            Button(copied ? "Copied" : "Copy") { copy() }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(entries.isEmpty)
            Button("Download") { exporting = true }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(entries.isEmpty)
                .fileExporter(
                    isPresented: $exporting,
                    document: LogDocument(text: logText),
                    contentType: .plainText,
                    defaultFilename: "marquee.log"
                ) { _ in }
        }
    }

    private var logText: String {
        entries.map(\.textLine).joined(separator: "\n")
    }

    @ViewBuilder
    private var lines: some View {
        if loaded && entries.isEmpty {
            Text("Nothing logged that matches.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface(padding: 0)
        } else if !entries.isEmpty {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { Divider().overlay(Theme.border) }
                    LogLineRow(entry: entry)
                }
            }
            .cardSurface(padding: 0)
        } else if !loaded {
            LoadingView()
        }
    }

    private func copy() {
        Platform.copy(logText)
        copied = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            copied = false
        }
    }

    private func load(fresh: Bool) async {
        do {
            let response = try await model.api.logs.list(
                level: level, query: query, after: fresh ? nil : latestId
            )
            if Task.isCancelled { return }
            entries = fresh ? response.results : Array((entries + response.results).suffix(Self.keep))
            latestId = response.latestId
            loaded = true
            loadError = nil
        } catch APIError.notFound {
            unsupported = true
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            loadError = error.localizedDescription
        }
    }
}

/// One log line: when, how bad, from where, and what.
private struct LogLineRow: View {
    let entry: API.LogEntry

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(entry.time.formatted(date: .abbreviated, time: .standard))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 150, alignment: .leading)
            Text(entry.level.title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(tone)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .overlay(Capsule().strokeBorder(tone.opacity(0.5)))
            Text(entry.source)
                .foregroundStyle(Theme.textSecondary)
                .lineLimit(1)
                .frame(width: 110, alignment: .leading)
            Text(entry.message)
                .foregroundStyle(Theme.textPrimary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 11.5, design: .monospaced))
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
    }

    private var tone: Color {
        switch entry.level {
        case .error: return Theme.missing
        case .warn: return Theme.unmonitored
        case .info: return Theme.info
        default: return Theme.textMuted
        }
    }
}

/// The lines shown, as the text file Download saves.
private struct LogDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.plainText]
    var text: String

    init(text: String) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data((text + "\n").utf8))
    }
}
