import SwiftUI

/// The season picker's selection, apart from the view so its rules are testable:
/// only requestable seasons can be picked, and "Select all" toggles all of them.
struct SeasonPickerSelection: Hashable, Sendable {
    /// The seasons with a checkbox, in the picker's order.
    let requestable: [Int]
    private(set) var selected: Set<Int> = []

    init(seasons: [API.TitleDetail.SeasonSummary]) {
        requestable = seasons.filter { $0.requestState == .requestable }.map(\.seasonNumber)
    }

    var allSelected: Bool {
        !requestable.isEmpty && requestable.allSatisfy(selected.contains)
    }

    func isSelected(_ season: Int) -> Bool { selected.contains(season) }

    mutating func set(_ season: Int, _ on: Bool) {
        guard requestable.contains(season) else { return }
        if on { selected.insert(season) } else { selected.remove(season) }
    }

    /// "Select all": everything when anything is unticked, else nothing.
    mutating func toggleAll() {
        selected = allSelected ? [] : Set(requestable)
    }

    /// What the request sends, sorted.
    var seasons: [Int] { selected.sorted() }

    /// "Request 1 season" / "Request 3 seasons".
    var submitTitle: String {
        "Request \(selected.count) season\(selected.count == 1 ? "" : "s")"
    }
}

/// The web title page's season picker as a sheet: every season TMDb lists, in
/// the accordion's order, each with a checkbox or the reason it has none.
struct SeasonRequestSheet: View {
    let title: String
    let seasons: [API.TitleDetail.SeasonSummary]
    /// Sends the request and reloads the page; a throw stays in the sheet.
    let onSubmit: @MainActor ([Int]) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selection: SeasonPickerSelection
    @State private var pending = false
    @State private var error: String?

    init(title: String, seasons: [API.TitleDetail.SeasonSummary], onSubmit: @escaping @MainActor ([Int]) async throws -> Void) {
        self.title = title
        self.seasons = seasons
        self.onSubmit = onSubmit
        _selection = State(initialValue: SeasonPickerSelection(seasons: seasons))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Request seasons")
                .font(.marqueeDisplay(22))
            Text("Pick the seasons of \"\(title)\" you'd like added. Seasons already in the library or on their way can't be picked again.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if !selection.requestable.isEmpty {
                Toggle("Select all", isOn: Binding(
                    get: { selection.allSelected },
                    set: { _ in selection.toggleAll() }
                ))
                .toggleStyle(.checkbox)
                .font(.system(size: 13, weight: .medium))
                .disabled(pending)
            }

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(seasons.enumerated()), id: \.element.id) { index, season in
                        if index > 0 { Divider().overlay(Theme.border) }
                        row(season)
                    }
                }
            }
            .frame(maxHeight: 340)
            .fixedSize(horizontal: false, vertical: true)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.bg2.opacity(0.5)))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? "Requesting…" : selection.submitTitle) { submit() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending || selection.seasons.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Theme.bg1)
    }

    @ViewBuilder
    private func row(_ season: API.TitleDetail.SeasonSummary) -> some View {
        let state = season.requestState
        HStack(spacing: 10) {
            if state == .requestable {
                Toggle(isOn: Binding(
                    get: { selection.isSelected(season.seasonNumber) },
                    set: { selection.set(season.seasonNumber, $0) }
                )) {
                    label(season, dimmed: false)
                }
                .toggleStyle(.checkbox)
                .disabled(pending)
            } else {
                label(season, dimmed: true)
                    // Lines the name up with the checkbox rows' labels.
                    .padding(.leading, 20)
            }
            Spacer(minLength: 8)
            if let tag = state.tag {
                TonePill(text: tag, tone: state == .inLibrary ? .owned : .tracked, small: true)
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 36)
    }

    private func label(_ season: API.TitleDetail.SeasonSummary, dimmed: Bool) -> some View {
        HStack(spacing: 8) {
            Text(season.name)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(dimmed ? Theme.textSecondary : Theme.textPrimary)
                .lineLimit(1)
            Text(season.episodeCountLabel)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)
                .lineLimit(1)
        }
    }

    private func submit() {
        let seasons = selection.seasons
        guard !seasons.isEmpty, !pending else { return }
        pending = true
        error = nil
        Task {
            do {
                try await onSubmit(seasons)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}
