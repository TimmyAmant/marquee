import SwiftUI

/// The Calendar tab: the server's month (`GET /calendar`, the same data as
/// the Mac's grid) as a day list, a seven-day agenda or a month grid you tap
/// a day of. Week is the default; the choice is remembered.
struct PhoneCalendarView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case day, week, month
        var id: String { rawValue }

        var label: String {
            switch self {
            case .day: return String(localized: "Day")
            case .week: return String(localized: "Week")
            case .month: return String(localized: "Month")
            }
        }
    }

    @Environment(AppModel.self) private var model
    @AppStorage("marquee.calendar.phoneMode") private var mode: Mode = .week

    /// The day being looked at (its week, its month); nil is the server's today.
    @State private var anchor: API.CalendarDay?
    /// The month grid's tapped day.
    @State private var selected: API.CalendarDay?
    /// Loaded months: moving through a month's weeks and days needs no reload.
    @State private var pages: [API.CalendarMonth: API.CalendarMonthResponse] = [:]
    /// The server's today, from the first answer.
    @State private var today: API.CalendarDay?
    @State private var configured = true
    @State private var loading = true
    @State private var error: String?

    private var day: API.CalendarDay? { anchor ?? today }
    private var page: API.CalendarMonthResponse? { day?.calendarMonth.flatMap { pages[$0] } }

    var body: some View {
        Group {
            if !configured {
                EmptyStateView(
                    title: String(localized: "Calendar"),
                    message: model.viewer?.isAdmin == true
                        ? String(localized: "Connect Sonarr or Radarr to see upcoming releases and air dates here.")
                        : String(localized: "The household admin hasn't connected Sonarr or Radarr yet."),
                    systemImage: "calendar",
                    actionTitle: model.viewer?.isAdmin == true ? String(localized: "Connect an integration") : nil,
                    action: model.viewer?.isAdmin == true ? { model.openSettings(.services) } : nil
                )
                .padding(.horizontal, 16)
                .frame(maxHeight: .infinity)
            } else if let error, page == nil, !loading {
                EmptyStateView(
                    title: String(localized: "Couldn't load the calendar"),
                    message: error,
                    systemImage: "exclamationmark.triangle",
                    actionTitle: String(localized: "Try again"),
                    action: { model.reload() }
                )
                .padding(.horizontal, 16)
                .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Picker("Calendar view", selection: $mode) {
                            ForEach(Mode.allCases) { mode in
                                Text(mode.label).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()

                        controls

                        if let error { InlineMessage(text: error) }

                        if let page, let day {
                            switch mode {
                            case .day: dayList(day, page: page)
                            case .week: weekAgenda(day, page: page)
                            case .month: monthGrid(page)
                            }
                        } else {
                            LoadingView(label: String(localized: "Loading the calendar…"))
                                .frame(maxWidth: .infinity)
                                .padding(.top, 40)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
            }
        }
        .background(Theme.bg0)
        .navigationTitle("Calendar")
        .task(id: LoadKey(month: anchor?.calendarMonth, revision: model.events.remoteRevision(of: .library) &+ model.events.revision(of: .settings), reload: model.reloadToken)) {
            await load(anchor?.calendarMonth)
        }
    }

    // MARK: Controls

    private var controls: some View {
        HStack(spacing: 8) {
            Text(periodLabel)
                .font(.marqueeDisplay(20))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(.isHeader)
            if loading {
                ProgressView().controlSize(.small)
            }
            Spacer(minLength: 4)
            Button("Today") { goToToday() }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(isShowingToday)
            stepButton("chevron.left", label: String(localized: "Previous")) { step(-1) }
            stepButton("chevron.right", label: String(localized: "Next")) { step(1) }
        }
    }

    private func stepButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Theme.bg1))
                .overlay(Circle().strokeBorder(Theme.border))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(day == nil)
        .accessibilityLabel(Text(label))
    }

    /// "Sunday, September 27", "Sep 27 – Oct 3", "September 2026".
    private var periodLabel: String {
        guard let day, let date = day.date() else { return "" }
        switch mode {
        case .day:
            return date.formatted(.dateTime.weekday(.wide).month(.wide).day())
        case .week:
            guard let start = Self.weekStart(of: day).date(), let end = Self.weekStart(of: day).adding(days: 6)?.date() else { return "" }
            return (start..<end).formatted(.interval.month(.abbreviated).day())
        case .month:
            return day.calendarMonth?.label ?? ""
        }
    }

    private var isShowingToday: Bool {
        guard let today, let day else { return true }
        switch mode {
        case .day: return day == today
        case .week: return Self.weekStart(of: day) == Self.weekStart(of: today)
        case .month: return day.calendarMonth == today.calendarMonth
        }
    }

    private func goToToday() {
        anchor = nil
        selected = today
    }

    private func step(_ direction: Int) {
        guard let day else { return }
        switch mode {
        case .day:
            anchor = day.adding(days: direction)
        case .week:
            anchor = day.adding(days: 7 * direction)
        case .month:
            let target = direction < 0 ? page?.prevMonth : page?.nextMonth
            guard let first = target?.firstDay else { return }
            anchor = first
            selected = first.calendarMonth == today?.calendarMonth ? today : nil
        }
    }

    /// The Sunday a week starts on, like the server's grid.
    static func weekStart(of day: API.CalendarDay) -> API.CalendarDay {
        guard let date = day.date() else { return day }
        let weekday = API.CalendarDay.gregorian.component(.weekday, from: date) // 1 = Sunday
        return day.adding(days: -(weekday - 1)) ?? day
    }

    // MARK: Day

    private func dayList(_ day: API.CalendarDay, page: API.CalendarMonthResponse) -> some View {
        let entries = page.entriesByDay[day] ?? []
        return Group {
            if entries.isEmpty {
                emptyDay
            } else {
                entryCard(entries)
            }
        }
    }

    private var emptyDay: some View {
        Text("Nothing scheduled")
            .font(.system(size: Metrics.text(13)))
            .foregroundStyle(Theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
    }

    private func entryCard(_ entries: [API.CalendarEntry]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                if index > 0 { Divider().overlay(Theme.border).padding(.leading, 70) }
                PhoneCalendarRow(entry: entry) { model.openTitle(entry.titleID) }
            }
        }
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
    }

    // MARK: Week

    private func weekAgenda(_ day: API.CalendarDay, page: API.CalendarMonthResponse) -> some View {
        let start = Self.weekStart(of: day)
        let days = (0..<7).compactMap { start.adding(days: $0) }
        let byDay = page.entriesByDay
        return VStack(alignment: .leading, spacing: 18) {
            ForEach(days, id: \.self) { current in
                VStack(alignment: .leading, spacing: 8) {
                    dayHeading(current)
                    let entries = byDay[current] ?? []
                    if entries.isEmpty {
                        Text("Nothing scheduled")
                            .font(.system(size: Metrics.text(12.5)))
                            .foregroundStyle(Theme.textMuted)
                    } else {
                        entryCard(entries)
                    }
                }
            }
        }
    }

    private func dayHeading(_ day: API.CalendarDay) -> some View {
        HStack(spacing: 8) {
            Text(day.date()?.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()) ?? day.string)
                .font(.system(size: Metrics.text(14), weight: .semibold))
                .foregroundStyle(day == today ? Theme.accent : Theme.textPrimary)
            if day == today {
                TonePill(text: String(localized: "Today"), tone: .accent, small: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: Month

    private func monthGrid(_ page: API.CalendarMonthResponse) -> some View {
        let byDay = page.entriesByDay
        let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        return VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    ForEach(Array(API.CalendarDay.gregorian.veryShortWeekdaySymbols.enumerated()), id: \.offset) { _, label in
                        Text(label)
                            .font(.system(size: Metrics.text(11), weight: .semibold))
                            .foregroundStyle(Theme.textMuted)
                            .frame(maxWidth: .infinity)
                    }
                }
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(page.gridDays, id: \.self) { day in
                        PhoneMonthCell(
                            day: day,
                            isToday: day == page.today,
                            isSelected: day == selected,
                            inMonth: day.month == page.month.month && day.year == page.month.year,
                            entries: byDay[day] ?? []
                        ) {
                            selected = day
                        }
                    }
                }
            }
            .padding(8)
            .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))

            if let selected {
                VStack(alignment: .leading, spacing: 8) {
                    dayHeading(selected)
                    let entries = byDay[selected] ?? []
                    if entries.isEmpty {
                        emptyDay
                    } else {
                        entryCard(entries)
                    }
                }
            } else {
                Text("Tap a day to see what's on.")
                    .font(.system(size: Metrics.text(12.5)))
                    .foregroundStyle(Theme.textMuted)
            }
        }
    }

    // MARK: Loading

    private func load(_ month: API.CalendarMonth?) async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await model.api.calendar.month(month)
            if Task.isCancelled { return }
            configured = fresh.configured
            pages[fresh.month] = fresh
            if today == nil || month == nil {
                today = fresh.today
                if selected == nil { selected = fresh.today }
            }
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct LoadKey: Hashable {
    let month: API.CalendarMonth?
    let revision: Int
    let reload: Int
}

/// A release or an episode: poster, name, what it is ("S01E03", "Digital
/// release"), and the title page on a tap.
private struct PhoneCalendarRow: View {
    let entry: API.CalendarEntry
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                RemoteImage(entry.posterPath, size: .w92, showsShimmer: false)
                    .frame(width: 44, height: 66)
                    .background(Theme.bg2)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.name)
                        .font(.system(size: Metrics.text(14), weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        Text(entry.mediaType.typeLabel)
                            .font(.system(size: Metrics.text(9.5), weight: .bold))
                            .tracking(0.4)
                            .foregroundStyle(Theme.textMuted)
                        Text(entry.subtitle)
                            .font(.system(size: Metrics.text(12.5)))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
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

/// One day of the month grid: its number, up to two posters and "+N".
private struct PhoneMonthCell: View {
    let day: API.CalendarDay
    let isToday: Bool
    let isSelected: Bool
    let inMonth: Bool
    let entries: [API.CalendarEntry]
    let action: () -> Void

    private static let maxPosters = 2

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text("\(day.day)")
                    .font(.system(size: Metrics.text(13), weight: isToday || isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? Theme.bg0 : (isToday ? Theme.accent : Theme.textPrimary))
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(isSelected ? Theme.accent : .clear))
                HStack(spacing: 2) {
                    ForEach(entries.prefix(Self.maxPosters)) { entry in
                        RemoteImage(entry.posterPath, size: .w92, showsShimmer: false)
                            .frame(width: 16, height: 24)
                            .background(Theme.bg2)
                            .clipShape(RoundedRectangle(cornerRadius: 2))
                    }
                }
                .frame(height: 24)
                Text(entries.count > Self.maxPosters ? "+\(entries.count - Self.maxPosters)" : " ")
                    .font(.system(size: Metrics.text(10), weight: .medium))
                    .foregroundStyle(Theme.textSecondary)
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isSelected ? Theme.accent.opacity(0.10) : .clear)
            )
            .opacity(inMonth ? 1 : 0.4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(accessibilityText))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var accessibilityText: String {
        let date = day.date()?.formatted(.dateTime.weekday(.wide).month(.wide).day()) ?? day.string
        return entries.isEmpty ? date : String(localized: "\(date), \(entries.count) releases")
    }
}
