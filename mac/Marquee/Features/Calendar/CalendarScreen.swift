import SwiftUI

/// app/calendar/page.tsx — the server's month grid of Radarr releases and
/// Sonarr air dates, in the server's time zone.
struct CalendarScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openSettings) private var openSettings

    /// nil until the first load: the server picks its own current month.
    @State private var month: API.CalendarMonth?
    @State private var page: API.CalendarMonthResponse?
    @State private var loading = true
    @State private var error: String?

    private static let maxVisiblePerDay = 4

    var body: some View {
        Group {
            if let page, !page.configured {
                EmptyStateView(
                    title: "Calendar",
                    message: model.viewer?.isAdmin == true
                        ? "Connect Sonarr or Radarr to see upcoming releases and air dates here."
                        : "The household admin hasn't connected Sonarr or Radarr yet.",
                    systemImage: "calendar",
                    actionTitle: model.viewer?.isAdmin == true ? "Connect an integration" : nil,
                    action: model.viewer?.isAdmin == true ? { model.settingsTab = .integrations; openSettings() } : nil
                )
                .frame(maxHeight: .infinity)
            } else if let error, page == nil {
                EmptyStateView(
                    title: "Couldn't load the calendar",
                    message: error,
                    systemImage: "exclamationmark.triangle",
                    actionTitle: "Try again",
                    action: { model.reload() }
                )
                .frame(maxHeight: .infinity)
            } else if let page {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        header(page)
                        if let error { InlineMessage(text: error) }
                        grid(page)
                    }
                    .padding(.horizontal, 32)
                    .padding(.vertical, 28)
                    .frame(maxWidth: 1240)
                    .frame(maxWidth: .infinity)
                }
            } else {
                LoadingView(label: "Loading the calendar…")
                    .frame(maxHeight: .infinity)
            }
        }
        .background(Theme.bg0)
        .navigationTitle("Calendar")
        .task(id: CalendarKey(month: month, revision: model.events.remoteRevision(of: .library) &+ model.events.revision(of: .settings), reload: model.reloadToken)) {
            await load()
        }
    }

    private func header(_ page: API.CalendarMonthResponse) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Calendar")
                    .font(.marqueeDisplay(32))
                    .foregroundStyle(Theme.textPrimary)
                Text(page.month.label)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.textSecondary)
            }
            if loading {
                ProgressView().controlSize(.small).padding(.leading, 8)
            }
            Spacer()
            Button("Today") { month = nil }
                .buttonStyle(OutlineButtonStyle())
            Button("← Prev") { month = page.prevMonth }
                .buttonStyle(OutlineButtonStyle())
            Button("Next →") { month = page.nextMonth }
                .buttonStyle(OutlineButtonStyle())
        }
    }

    private func grid(_ page: API.CalendarMonthResponse) -> some View {
        let byDay = page.entriesByDay
        return VStack(spacing: 1) {
            HStack(spacing: 1) {
                ForEach(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], id: \.self) { label in
                    Text(label)
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Theme.bg1)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 1), count: 7), spacing: 1) {
                ForEach(page.gridDays, id: \.self) { day in
                    DayCell(
                        day: day.day,
                        isToday: day == page.today,
                        inMonth: day.month == page.month.month && day.year == page.month.year,
                        entries: byDay[day] ?? [],
                        maxVisible: Self.maxVisiblePerDay
                    ) { entry in
                        model.openTitle(entry.titleID)
                    }
                }
            }
        }
        .background(Theme.border)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border))
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await model.api.calendar.month(month)
            if Task.isCancelled { return }
            page = fresh
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct CalendarKey: Hashable {
    let month: API.CalendarMonth?
    let revision: Int
    let reload: Int
}

private struct DayCell: View {
    let day: Int
    let isToday: Bool
    let inMonth: Bool
    let entries: [API.CalendarEntry]
    let maxVisible: Int
    let open: (API.CalendarEntry) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(day)")
                .font(.system(size: 11.5, weight: isToday ? .semibold : .regular))
                .foregroundStyle(isToday ? Theme.bg0 : Theme.textSecondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(Capsule().fill(isToday ? Theme.accent : .clear))

            ForEach(entries.prefix(maxVisible)) { entry in
                EntryRow(entry: entry) { open(entry) }
            }
            if entries.count > maxVisible {
                Text("+\(entries.count - maxVisible) more")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.textSecondary)
                    .padding(.leading, 4)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
        .background(Theme.bg0)
        .opacity(inMonth ? 1 : 0.4)
    }
}

private struct EntryRow: View {
    let entry: API.CalendarEntry
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                RemoteImage(entry.posterPath, size: .w92, showsShimmer: false)
                    .frame(width: 16, height: 24)
                    .background(Theme.bg2)
                    .clipShape(RoundedRectangle(cornerRadius: 2))
                Text(entry.name)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 5).fill(hovering ? Theme.bg1 : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("\(entry.name) — \(entry.subtitle)")
        .onHover { hovering = $0 }
    }
}
