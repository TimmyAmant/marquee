import SwiftUI

/// components/media-list.tsx — the person/studio list's client-side search,
/// type filter, sort and grid/table toggle over cards the server already sent.
struct MediaListView: View {
    let cards: [API.TitleCard]
    /// The table's second column header ("Role" on a person page).
    var subtitleLabel: String?
    /// "12 titles": the count line over the list.
    var countLabel: (Int) -> String = { String(localized: "\($0) titles") }
    var showTypeFilter = false
    var showSearch = false
    var emptyMessage = String(localized: "Nothing found.")

    @Environment(AppModel.self) private var model
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    /// An iPhone: the controls in rows that fit, the list as simple rows.
    private var isPhone: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    enum TypeFilter: String, CaseIterable, Identifiable {
        case all, movie, tv
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return String(localized: "All")
            case .movie: return String(localized: "Movies")
            case .tv: return String(localized: "TV")
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
                .font(.system(size: Metrics.text(13)))
                .foregroundStyle(Theme.textMuted)
        } else {
            let rows = visible
            VStack(alignment: .leading, spacing: isPhone ? 14 : 20) {
                if isPhone {
                    phoneControls(count: rows.count)
                } else {
                    controls(count: rows.count)
                }
                if rows.isEmpty {
                    Text("No titles match these filters.")
                        .font(.system(size: Metrics.text(13)))
                        .foregroundStyle(Theme.textMuted)
                } else if layout == .grid {
                    grid(rows)
                } else if isPhone {
                    phoneList(rows)
                } else {
                    table(rows)
                }
            }
        }
    }

    private func controls(count: Int) -> some View {
        FlowLayout(spacing: 10, lineSpacing: 10) {
            Text(countLabel(count))
                .font(.system(size: Metrics.text(13)))
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

    /// At phone width: the search field and the grid/list switch, then the
    /// type and the order, then the count.
    private func phoneControls(count: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if showSearch {
                    HStack(spacing: 6) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(Theme.textMuted)
                        TextField("Search these titles…", text: $query)
                            .textFieldStyle(.plain)
                            .autocorrectionDisabled()
                    }
                    .font(.system(size: Metrics.text(14)))
                    .padding(.horizontal, 12)
                    .frame(height: 38)
                    .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.border))
                } else {
                    Spacer(minLength: 0)
                }
                Picker("Layout", selection: $layout) {
                    Image(systemName: "square.grid.2x2").tag(Layout.grid)
                        .accessibilityLabel(Text("Grid"))
                    Image(systemName: "list.bullet").tag(Layout.table)
                        .accessibilityLabel(Text("List"))
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 96)
            }
            HStack(spacing: 10) {
                if showTypeFilter {
                    Picker("Type", selection: $typeFilter) {
                        ForEach(TypeFilter.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()
                }
                Spacer(minLength: 0)
                Picker("Sort", selection: $order) {
                    ForEach(API.TitleListOrder.allCases) { Text($0.label).tag($0) }
                }
                .labelsHidden()
                .fixedSize()
            }
            HStack(spacing: 10) {
                Text(countLabel(count))
                    .font(.system(size: Metrics.text(13)))
                    .foregroundStyle(Theme.textSecondary)
                Spacer(minLength: 0)
                if layout == .grid {
                    StatusColorKey()
                }
            }
        }
    }

    /// The list at phone width: one title per row, the table's columns
    /// under its name.
    private func phoneList(_ rows: [API.TitleCard]) -> some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, card in
                if index > 0 { Divider().overlay(Theme.border).padding(.leading, 64) }
                Button {
                    model.openTitle(card.id)
                } label: {
                    HStack(spacing: 12) {
                        RemoteImage(card.posterPath, size: .w92, showsShimmer: false)
                            .frame(width: 40, height: 60)
                            .background(Theme.bg2)
                            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(card.name)
                                .font(.system(size: Metrics.text(14), weight: .medium))
                                .foregroundStyle(Theme.textPrimary)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            let detail = subtitleLabel == nil ? card.mediaType.label : card.subtitle
                            Text([detail, card.year].compactMap(\.nonBlank).joined(separator: " · "))
                                .font(.system(size: Metrics.text(12)))
                                .foregroundStyle(Theme.textSecondary)
                                .lineLimit(1)
                            if let status = card.status, status.isKnown {
                                StatusBadge(status: status, compact: true)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.textMuted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
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
            TableColumn(subtitleLabel ?? String(localized: "Type")) { card in
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
