import SwiftUI

/// The More tab: the Mac rail's other sections, Settings and Help.
struct PhoneMoreView: View {
    @Binding var showsNotifications: Bool
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    private static let sections: [SidebarItem] = [.movies, .series, .library, .favorites]

    var body: some View {
        List {
            Section {
                ForEach(Self.sections) { item in
                    row(item.title, systemImage: item.systemImage) { model.select(item) }
                }
            }
            Section {
                row(String(localized: "Notifications"), systemImage: model.unreadCount > 0 ? "bell.badge" : "bell") {
                    showsNotifications = true
                }
                row(String(localized: "Settings"), systemImage: SidebarItem.settings.systemImage) {
                    model.select(.settings)
                }
            }
            Section {
                row(String(localized: "Marquee Releases"), systemImage: "sparkles") {
                    model.open(.changelog)
                }
                row(String(localized: "Error Reference"), systemImage: "exclamationmark.bubble") {
                    model.open(.errorReference)
                }
                row(String(localized: "All Features"), systemImage: "list.bullet.rectangle") {
                    openURL(AppInfo.featuresURL)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg0)
        .navigationTitle("More")
        .navigationDestination(item: section) { item in
            PhoneSectionView(item: item)
                .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var section: Binding<SidebarItem?> {
        Binding(
            get: { model.moreSection },
            set: { section in
                model.moreSection = section
                // Back out of Settings: its pushed tab goes with it.
                if section != .settings { model.phoneSettingsTab = nil }
            }
        )
    }

    private func row(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Label {
                    Text(title).foregroundStyle(Theme.textPrimary)
                } icon: {
                    Image(systemName: systemImage).foregroundStyle(Theme.accent)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.textMuted)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A section opened from More: the shared screens, and the phone's Settings.
struct PhoneSectionView: View {
    let item: SidebarItem

    var body: some View {
        switch item {
        case .movies: BrowseView(mediaType: .movie)
        case .series: BrowseView(mediaType: .tv)
        case .library: LibraryView()
        case .favorites: FavoritesView()
        case .settings: PhoneSettingsScreen()
        case .discover: DiscoverView()
        case .calendar: PhoneCalendarView()
        case .requests: RequestsView()
        }
    }
}
