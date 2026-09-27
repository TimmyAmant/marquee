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
        String(localized: "\(episodeCount) episodes")
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
        selected.isEmpty ? String(localized: "Request seasons") : String(localized: "Request \(selected.count) seasons")
    }
}

/// The picker's list, after Seerr's: a table of every season in the
/// accordion's order — a switch over the column that picks them all, then
/// each season's switch, name, episode count and a status pill ("Not
/// requested", "Requested", "Available", "Monitored").
struct SeasonPickerList: View {
    let rows: [SeasonPickerRow]
    @Binding var selection: SeasonPickerSelection
    /// Greys out the switches (while saving, or when the choice is "The whole series").
    var disabled = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
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
        }
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.bg2.opacity(0.5)))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
        .opacity(disabled ? 0.6 : 1)
    }

    /// The column heads, with the switch that picks every season.
    private var header: some View {
        HStack(spacing: 10) {
            Toggle("Select all", isOn: Binding(
                get: { selection.allSelected },
                set: { _ in selection.toggleAll() }
            ))
            .labelsHidden()
            .toggleStyle(.switch)
            .controlSize(.mini)
            .disabled(disabled || selection.requestable.isEmpty)
            .help(selection.allSelected ? String(localized: "Clear all") : String(localized: "Select all"))
            Text("Season")
            Spacer(minLength: 8)
            Text("Episodes")
                .frame(width: 64, alignment: .trailing)
            Text("Status")
                .frame(width: 104, alignment: .trailing)
        }
        .font(.system(size: 11, weight: .medium))
        .textCase(.uppercase)
        .foregroundStyle(Theme.textMuted)
        .padding(.horizontal, 12)
        .frame(height: 32)
    }

    @ViewBuilder
    private func row(_ season: SeasonPickerRow) -> some View {
        let state = season.state
        let pickable = state == .requestable
        HStack(spacing: 10) {
            Toggle(season.name, isOn: Binding(
                get: { pickable && selection.isSelected(season.seasonNumber) },
                set: { selection.set(season.seasonNumber, $0) }
            ))
            .labelsHidden()
            .toggleStyle(.switch)
            .controlSize(.mini)
            .disabled(disabled || !pickable)
            Text(season.name)
                .font(.system(size: 13, weight: pickable ? .medium : .regular))
                .foregroundStyle(pickable ? Theme.textPrimary : Theme.textSecondary)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(verbatim: "\(season.episodeCount)")
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 64, alignment: .trailing)
                .accessibilityLabel(season.episodeCountLabel)
            HStack {
                Spacer(minLength: 0)
                SeasonStatusPill(state: state)
            }
            .frame(width: 104)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 36)
        .contentShape(Rectangle())
        // The whole row picks it, as on the website.
        .onTapGesture {
            guard pickable, !disabled else { return }
            selection.set(season.seasonNumber, !selection.isSelected(season.seasonNumber))
        }
    }
}

/// A season's status in the picker: "Not requested" outlined, "Requested"
/// blue, "Available" green, "Monitored" in the downloading tone.
struct SeasonStatusPill: View {
    let state: API.SeasonRequestState

    var body: some View {
        switch state {
        case .requestable, .unavailable:
            Text(state.pillLabel)
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Theme.textMuted)
                .padding(.horizontal, 8)
                .frame(height: 20)
                .overlay(Capsule().strokeBorder(Theme.border))
                .lineLimit(1)
                .fixedSize()
        case .inLibrary:
            TonePill(text: state.pillLabel, tone: .owned, small: true)
        case .monitored:
            TonePill(text: state.pillLabel, tone: .downloading, small: true)
        case .requested:
            TonePill(text: state.pillLabel, tone: .info, small: true)
        }
    }
}

/// The web title page's season picker as a sheet: every season TMDb lists, in
/// the accordion's order, each with a checkbox or the reason it has none.
struct SeasonRequestSheet: View {
    let title: String
    let rows: [SeasonPickerRow]
    /// "This request will be approved automatically" (0.53+ servers say so).
    var autoApprove = false
    /// Sends the request and reloads the page; a throw stays in the sheet.
    let onSubmit: @MainActor ([Int]) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selection: SeasonPickerSelection
    @State private var pending = false
    @State private var error: String?

    init(
        title: String,
        seasons: [API.TitleDetail.SeasonSummary],
        autoApprove: Bool = false,
        onSubmit: @escaping @MainActor ([Int]) async throws -> Void
    ) {
        self.title = title
        self.rows = seasons.map(SeasonPickerRow.init)
        self.autoApprove = autoApprove
        self.onSubmit = onSubmit
        _selection = State(initialValue: SeasonPickerSelection(rows: rows))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Request seasons")
                .font(.marqueeDisplay(22))
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                .lineLimit(1)

            if autoApprove {
                Label("This request will be approved automatically.", systemImage: "info.circle")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.info)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.infoBg))
            }

            SeasonPickerList(rows: rows, selection: $selection, disabled: pending)

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? String(localized: "Requesting…") : selection.submitTitle) { submit() }
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
