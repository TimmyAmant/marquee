import SwiftUI

/// One row of the season picker, whichever list it came from: the title's
/// seasons (Request) or a request's edit options (Edit).
struct SeasonPickerRow: Hashable, Sendable, Identifiable {
    let seasonNumber: Int
    let name: String
    let episodeCount: Int
    let state: API.SeasonRequestState

    var id: Int { seasonNumber }

    /// "1 episode" / "10 episodes".
    var episodeCountLabel: String {
        "\(episodeCount) episode\(episodeCount == 1 ? "" : "s")"
    }

    init(seasonNumber: Int, name: String, episodeCount: Int, state: API.SeasonRequestState) {
        self.seasonNumber = seasonNumber
        self.name = name
        self.episodeCount = episodeCount
        self.state = state
    }

    init(_ season: API.TitleDetail.SeasonSummary) {
        self.init(seasonNumber: season.seasonNumber, name: season.name, episodeCount: season.episodeCount, state: season.requestState)
    }

    init(_ row: API.RequestEditOptions.SeasonRow) {
        self.init(seasonNumber: row.seasonNumber, name: row.name, episodeCount: row.episodeCount, state: row.requestState)
    }
}

/// The season picker's selection, apart from the view so its rules are testable:
/// only requestable seasons can be picked, and "Select all" toggles all of them.
struct SeasonPickerSelection: Hashable, Sendable {
    /// The seasons with a checkbox, in the picker's order.
    let requestable: [Int]
    private(set) var selected: Set<Int> = []

    init(seasons: [API.TitleDetail.SeasonSummary]) {
        self.init(rows: seasons.map(SeasonPickerRow.init))
    }

    /// `selected`: what starts ticked (a request's own seasons), limited to
    /// the ones that can be picked.
    init(rows: [SeasonPickerRow], selected: [Int] = []) {
        requestable = rows.filter { $0.state == .requestable }.map(\.seasonNumber)
        self.selected = Set(selected).intersection(requestable)
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
        // Nothing picked yet (the button is disabled): no "0", as on the website.
        selected.isEmpty ? "Request seasons" : "Request \(selected.count) season\(selected.count == 1 ? "" : "s")"
    }
}

/// The picker's list: every season in the accordion's order, each with a
/// checkbox or the reason it has none, and "Select all" over it.
struct SeasonPickerList: View {
    let rows: [SeasonPickerRow]
    @Binding var selection: SeasonPickerSelection
    /// Greys out the checkboxes (while saving, or when the choice is "The whole series").
    var disabled = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !selection.requestable.isEmpty {
                Toggle("Select all", isOn: Binding(
                    get: { selection.allSelected },
                    set: { _ in selection.toggleAll() }
                ))
                .toggleStyle(.checkbox)
                .font(.system(size: 13, weight: .medium))
                .disabled(disabled)
            }

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, season in
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
            .opacity(disabled ? 0.6 : 1)
        }
    }

    @ViewBuilder
    private func row(_ season: SeasonPickerRow) -> some View {
        let state = season.state
        HStack(spacing: 10) {
            if state == .requestable {
                Toggle(isOn: Binding(
                    get: { selection.isSelected(season.seasonNumber) },
                    set: { selection.set(season.seasonNumber, $0) }
                )) {
                    label(season, dimmed: false)
                }
                .toggleStyle(.checkbox)
                .disabled(disabled)
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

    private func label(_ season: SeasonPickerRow, dimmed: Bool) -> some View {
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
}

/// The web title page's season picker as a sheet: every season TMDb lists, in
/// the accordion's order, each with a checkbox or the reason it has none.
struct SeasonRequestSheet: View {
    let title: String
    let rows: [SeasonPickerRow]
    /// Sends the request and reloads the page; a throw stays in the sheet.
    let onSubmit: @MainActor ([Int]) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selection: SeasonPickerSelection
    @State private var pending = false
    @State private var error: String?

    init(title: String, seasons: [API.TitleDetail.SeasonSummary], onSubmit: @escaping @MainActor ([Int]) async throws -> Void) {
        self.title = title
        self.rows = seasons.map(SeasonPickerRow.init)
        self.onSubmit = onSubmit
        _selection = State(initialValue: SeasonPickerSelection(rows: rows))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Request seasons")
                .font(.marqueeDisplay(22))
            Text("Pick the seasons of \"\(title)\" you'd like added. Seasons already in the library or on their way can't be picked again.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            SeasonPickerList(rows: rows, selection: $selection, disabled: pending)

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
