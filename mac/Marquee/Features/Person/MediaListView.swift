import SwiftUI

/// components/media-list.tsx — the person/studio list's client-side search,
/// type filter, sort and grid/table toggle over cards the server already sent.
struct MediaListView: View {
    let cards: [API.TitleCard]
    /// The table's second column header ("Role" on a person page).
    var subtitleLabel: String?
    var itemLabel = "titles"
    var showTypeFilter = false
    var showSearch = false
    var emptyMessage = "Nothing found."

    @Environment(AppModel.self) private var model

    enum TypeFilter: String, CaseIterable, Identifiable {
        case all, movie, tv
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "All"
            case .movie: return "Movies"
            case .tv: return "TV"
            }
        }

        var mediaType: API.MediaType? {
            switch self {
            case .all: return nil
            case .movie: return .movie
            case .tv: return .tv
            }
        }
    }

    enum Layout: String, CaseIterable, Identifiable {
        case grid, table
        var id: String { rawValue }
    }

    @State private var query = ""
    @State private var order: API.TitleListOrder = .newestFirst
    @State private var typeFilter: TypeFilter = .all
    @AppStorage("marquee.mediaList.layout") private var layout: Layout = .grid

    private var visible: [API.TitleCard] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return cards
            .filter { card in
                if let wanted = typeFilter.mediaType, card.mediaType != wanted { return false }
                if !needle.isEmpty && !card.name.lowercased().contains(needle) { return false }
                return true
            }
            .sorted(by: order)
    }

    var body: some View {
        if cards.isEmpty {
            Text(emptyMessage)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textMuted)
        } else {
            let rows = visible
            VStack(alignment: .leading, spacing: 20) {
                controls(count: rows.count)
                if rows.isEmpty {
                    Text("No titles match these filters.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                } else if layout == .grid {
                    grid(rows)
                } else {
                    table(rows)
                }
            }
        }
    }

    private func controls(count: Int) -> some View {
        FlowLayout(spacing: 10, lineSpacing: 10) {
            Text("\(count) \(itemLabel)")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                .padding(.trailing, 8)

            if showSearch {
                TextField("Search these titles…", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
            }
            if showTypeFilter {
                Picker("Type", selection: $typeFilter) {
                    ForEach(TypeFilter.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }
            Picker("Sort", selection: $order) {
                ForEach(API.TitleListOrder.allCases) { Text($0.label).tag($0) }
            }
            .labelsHidden()
            .fixedSize()
            Picker("Layout", selection: $layout) {
                Image(systemName: "square.grid.2x2").tag(Layout.grid)
                Image(systemName: "list.bullet").tag(Layout.table)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
            if layout == .grid {
                StatusColorKey()
            }
        }
    }

    private func grid(_ rows: [API.TitleCard]) -> some View {
        PosterGrid {
            ForEach(rows) { card in
                PosterCard(card: card) { model.openTitle(card.id) }
            }
        }
    }

    private func table(_ rows: [API.TitleCard]) -> some View {
        Table(rows) {
            TableColumn("Title") { card in
                Button(card.name) { model.openTitle(card.id) }
                    .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
            }
            .width(min: 200, ideal: 320)
            TableColumn(subtitleLabel ?? "Type") { card in
                Text(subtitleLabel == nil ? card.mediaType.label : (card.subtitle ?? "—"))
                    .foregroundStyle(Theme.textSecondary)
            }
            .width(min: 100, ideal: 200)
            TableColumn("Year") { card in
                Text(card.year ?? "—").foregroundStyle(Theme.textSecondary)
            }
            .width(56)
            TableColumn("Status") { card in
                if let status = card.status {
                    StatusBadge(status: status, compact: true)
                } else {
                    Text("—").foregroundStyle(Theme.textMuted)
                }
            }
            .width(min: 90, ideal: 140)
        }
        .frame(minHeight: CGFloat(min(rows.count, 18)) * 28 + 40)
        .scrollContentBackground(.hidden)
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border))
    }
}
