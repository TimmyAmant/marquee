import SwiftUI

/// app/calendar/page.tsx — the server's month grid of Radarr releases and
/// Sonarr air dates, in the server's time zone.
struct CalendarScreen: View {
    @Environment(AppModel.self) private var model

    /// nil until the first load: the server picks its own current month.
    @State private var month: API.CalendarMonth?
    @State private var page: API.CalendarMonthResponse?
    @State private var loading = true
    @State private var error: String?

    private static let maxVisiblePerDay = 4
    /// Days whose "+N more" was clicked: every title shows.
    @State private var expandedDays: Set<API.CalendarDay> = []

    var body: some View {
        Group {
            if let page, !page.configured {
                EmptyStateView(
                    title: String(localized: "Calendar"),
                    message: model.viewer?.isAdmin == true
                        ? String(localized: "Connect Sonarr or Radarr to see upcoming releases and air dates here.")
                        : String(localized: "The household admin hasn't connected Sonarr or Radarr yet."),
                    systemImage: "calendar",
                    actionTitle: model.viewer?.isAdmin == true ? String(localized: "Connect an integration") : nil,
                    action: model.viewer?.isAdmin == true ? { model.openSettings(.services) } : nil
                )
                .frame(maxHeight: .infinity)
            } else if let error, page == nil {
                EmptyStateView(
                    title: String(localized: "Couldn't load the calendar"),
                    message: error,
                    systemImage: "exclamationmark.triangle",
                    actionTitle: String(localized: "Try again"),
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
                    .frame(maxWidth: 1680)
                    .frame(maxWidth: .infinity)
                }
                .scrollsUnderNavRail()
            } else {
                LoadingView(label: String(localized: "Loading the calendar…"))
                    .frame(maxHeight: .infinity)
            }
        }
        .background(Theme.bg0)
        .navigationTitle("Calendar")
        .headingIsThePageTitle()
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
                    .macPageHeading()
                Text(page.month.label)
                    .font(.system(size: Metrics.text(14)))
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
                // Sunday first, like the server's grid, in the app's language.
                ForEach(Array(API.CalendarDay.gregorian.shortWeekdaySymbols.enumerated()), id: \.offset) { _, label in
                    Text(label)
                        .font(.system(size: Metrics.text(13), weight: .semibold))
                        .foregroundStyle(Theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Theme.bg1)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 1), count: 7), spacing: 1) {
                ForEach(page.gridDays, id: \.self) { day in
                    DayCell(
                        day: day.day,
                        isToday: day == page.today,
                        inMonth: day.month == page.month.month && day.year == page.month.year,
                        titles: API.CalendarDayTitle.group(byDay[day] ?? []),
                        maxVisible: expandedDays.contains(day) ? .max : Self.maxVisiblePerDay,
                        expand: { expandedDays.insert(day) }
                    ) { title in
                        model.openTitle(title.titleID)
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
    let titles: [API.CalendarDayTitle]
    let maxVisible: Int
    let expand: () -> Void
    let open: (API.CalendarDayTitle) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(day)")
                .font(.system(size: Metrics.text(14), weight: isToday ? .bold : .medium))
                .monospacedDigit()
                .foregroundStyle(isToday ? Theme.bg0 : Theme.textSecondary)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(Capsule().fill(isToday ? Theme.accent : .clear))

            ForEach(titles.prefix(maxVisible)) { title in
                EntryRow(title: title) { open(title) }
            }
            if titles.count > maxVisible {
                Button(action: expand) {
                    Text("+\(titles.count - maxVisible) more")
                        .font(.system(size: Metrics.text(12), weight: .medium))
                        .foregroundStyle(Theme.accent)
                        .padding(.leading, 6)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 168, alignment: .topLeading)
        .background(isToday ? Theme.bg1 : Theme.bg0)
        .opacity(inMonth ? 1 : 0.4)
    }
}

private struct EntryRow: View {
    let title: API.CalendarDayTitle
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                RemoteImage(title.posterPath, size: .w92, showsShimmer: false)
                    .frame(width: 26, height: 39)
                    .background(Theme.bg2)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title.name)
                        .font(.system(size: Metrics.text(13), weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(title.subtitle)
                        .font(.system(size: Metrics.text(11.5)))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 5)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 6).fill(hovering ? Theme.bg2 : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("\(title.name) — \(title.subtitle)")
        .onHover { hovering = $0 }
    }
}
