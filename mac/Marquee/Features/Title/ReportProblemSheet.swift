import SwiftUI

/// The report dialog's fields, apart from the view so the rules are testable:
/// what's wrong (required), for TV an optional season and an episode of it,
/// and a note (required for "Something else").
struct ProblemReportForm: Hashable, Sendable {
    var kind: API.IssueKind?
    /// nil = "Whole show".
    var season: Int?
    /// The Episode field as typed; only sent with a season.
    var episode = ""
    var message = ""

    /// "What's wrong?" for "Something else", else "Anything else? (optional)".
    var messageLabel: String {
        kind == .other ? "What's wrong?" : "Anything else? (optional)"
    }

    /// The body to send, or the message to show instead (the server's own
    /// wording, so an older check here and the server's agree).
    func report() -> Result<API.IssueReport, ProblemReportError> {
        guard let kind else { return .failure(.init("Pick what's wrong.")) }
        let note = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if kind == .other, note.isEmpty { return .failure(.init("Say what's wrong.")) }
        if note.unicodeScalars.count > API.IssueReport.maxMessageLength {
            return .failure(.init("Keep it under 1000 characters."))
        }
        var episodeNumber: Int?
        let typed = episode.trimmingCharacters(in: .whitespaces)
        if season != nil, !typed.isEmpty {
            guard let number = Int(typed), number >= 1 else {
                return .failure(.init("Season and episode are whole numbers."))
            }
            episodeNumber = number
        }
        return .success(API.IssueReport(kind: kind, message: note, seasonNumber: season, episodeNumber: episodeNumber))
    }
}

struct ProblemReportError: Error, Hashable, Sendable {
    let message: String
    init(_ message: String) { self.message = message }
}

/// components/report-problem-button.tsx's dialog as a sheet.
struct ReportProblemSheet: View {
    let mediaType: API.MediaType
    /// A show's season numbers, for the season picker; empty for a movie.
    let seasonNumbers: [Int]
    /// Sends the report; a throw stays in the sheet.
    let onSubmit: @MainActor (API.IssueReport) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var form = ProblemReportForm()
    @State private var pending = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Report a problem")
                    .font(.marqueeDisplay(22))
                Text("The admin is told, and you'll hear back when it's fixed.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Picker("What's wrong", selection: $form.kind) {
                ForEach(API.IssueKind.knownCases, id: \.self) { kind in
                    Text(kind.label).tag(Optional(kind))
                }
            }
            .pickerStyle(.radioGroup)
            .labelsHidden()
            .font(.system(size: 13))
            .disabled(pending)

            if mediaType == .tv, !seasonNumbers.isEmpty {
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Season (optional)")
                        Picker("Season (optional)", selection: $form.season) {
                            Text("Whole show").tag(Int?.none)
                            ForEach(seasonNumbers, id: \.self) { number in
                                Text(number == 0 ? "Specials" : "Season \(number)").tag(Optional(number))
                            }
                        }
                        .labelsHidden()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Episode")
                        TextField("", text: $form.episode)
                            .textFieldStyle(.roundedBorder)
                            .disabled(form.season == nil)
                    }
                    .frame(width: 100)
                }
                .disabled(pending)
            }

            VStack(alignment: .leading, spacing: 6) {
                fieldLabel(form.messageLabel)
                TextField("e.g. The audio drifts out of sync after about 20 minutes.", text: $form.message, axis: .vertical)
                    .lineLimit(3...6)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))
                    .disabled(pending)
                    .onChange(of: form.message) { _, value in
                        let scalars = value.unicodeScalars
                        if scalars.count > API.IssueReport.maxMessageLength {
                            form.message = String(scalars.prefix(API.IssueReport.maxMessageLength))
                        }
                    }
            }

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? "Sending…" : "Send report") { submit() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending)
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Theme.bg1)
        .onChange(of: form.season) { _, season in
            if season == nil { form.episode = "" }
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.textSecondary)
    }

    private func submit() {
        guard !pending else { return }
        let report: API.IssueReport
        switch form.report() {
        case let .success(value): report = value
        case let .failure(failure):
            error = failure.message
            return
        }
        pending = true
        error = nil
        Task {
            do {
                try await onSubmit(report)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}
