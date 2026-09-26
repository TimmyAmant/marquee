import SwiftUI

/// app/settings/personal-notifications.tsx — Settings › Account ›
/// Notifications, below this Mac's own switch: the account's own channels
/// (Telegram, Pushover, email, Discord, ntfy, a webhook) and which events
/// reach the bell, devices and each channel. A server before 0.45 answers
/// 404 and the whole section stays hidden.
struct PersonalNotificationsSection: View {
    @Environment(AppModel.self) private var model

    @State private var channels: API.PersonalNotificationChannels?
    @State private var matrix: PreferenceMatrix?
    @State private var unsupported = false
    @State private var loadError: String?
    @State private var adding = false
    @State private var notice: String?
    @State private var matrixError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            if unsupported {
                EmptyView()
            } else if let channels, let matrix {
                channelsSection(channels)
                matrixSection(matrix, channels: channels)
            } else if let loadError {
                InlineMessage(text: loadError)
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: model.reloadToken) { await load() }
        .sheet(isPresented: $adding) {
            if let channels {
                AddNotificationChannelSheet(channels: channels) { message in
                    notice = message
                    reload()
                }
                .environment(model)
            }
        }
    }

    // MARK: Your channels

    @ViewBuilder
    private func channelsSection(_ channels: API.PersonalNotificationChannels) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SettingsSectionLabel(text: "Your channels")
            Text("Get your notifications on Telegram, Pushover, email, Discord, ntfy or a webhook. Only you can see these.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        VStack(alignment: .leading, spacing: 0) {
            if channels.channels.isEmpty {
                Text("No channels yet. Add one below.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                Divider().overlay(Theme.border)
            }
            ForEach(channels.channels) { channel in
                NotificationChannelRow(
                    channel: channel,
                    onChange: { self.channels = self.channels?.replacing($0) },
                    onReload: reload
                )
                Divider().overlay(Theme.border)
            }
            VStack(alignment: .leading, spacing: 8) {
                if let notice { InlineMessage(text: notice, isError: false) }
                if !channels.offeredKinds.isEmpty {
                    Button("Add a channel") {
                        notice = nil
                        adding = true
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                }
                if let missing = ChannelForm.missingNote(channels) {
                    Text(missing)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(padding: 0)
    }

    // MARK: What you hear about

    @ViewBuilder
    private func matrixSection(_ matrix: PreferenceMatrix, channels: API.PersonalNotificationChannels) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SettingsSectionLabel(text: "What you hear about")
            Text("Choose where each kind of notification goes. The bell is the list at the top of every page; devices are the browsers, Macs and PCs you turned notifications on for.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        let columns = PreferenceMatrix.columns(for: channels.channels)
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 10) {
                    GridRow {
                        header("Event")
                        ForEach(columns, id: \.self) { column in
                            header(title(of: column, in: channels))
                                .gridColumnAlignment(.center)
                        }
                    }
                    ForEach(matrix.everyone) { row in
                        matrixRow(row, columns: columns, channels: channels)
                    }
                    if !matrix.reviewers.isEmpty {
                        GridRow {
                            SettingsSectionLabel(text: "For reviewers")
                                .padding(.top, 6)
                                .gridCellColumns(columns.count + 1)
                        }
                        ForEach(matrix.reviewers) { row in
                            matrixRow(row, columns: columns, channels: channels)
                        }
                    }
                }
                .padding(.bottom, 2)
            }
            .scrollIndicators(.automatic)
            if let matrixError {
                InlineMessage(text: matrixError)
            } else if matrix.isSaving {
                Text("Saving…")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func header(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11.5, weight: .medium))
            .foregroundStyle(Theme.textMuted)
            .lineLimit(1)
    }

    private func title(of column: PreferenceMatrix.Column, in channels: API.PersonalNotificationChannels) -> String {
        switch column {
        case .bell: return "Bell"
        case .devices: return "Devices"
        case let .channel(id): return channels.channels.first { $0.id == id }?.label ?? "Channel"
        }
    }

    private func matrixRow(
        _ row: API.NotificationPreferenceRow,
        columns: [PreferenceMatrix.Column],
        channels: API.PersonalNotificationChannels
    ) -> some View {
        GridRow {
            Text(row.label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(columns, id: \.self) { column in
                Toggle(
                    "\(row.label): \(title(of: column, in: channels))",
                    isOn: Binding(
                        get: { PreferenceMatrix.value(row, column) },
                        set: { set(row.event, column, on: $0) }
                    )
                )
                .toggleStyle(.checkbox)
                .labelsHidden()
            }
        }
    }

    private func set(_ event: String, _ column: PreferenceMatrix.Column, on: Bool) {
        guard var current = matrix else { return }
        let (token, change) = current.toggle(event: event, column: column, on: on)
        matrix = current
        matrixError = nil
        let api = model.api
        Task {
            do {
                let answer = try await api.notificationPreferences.save([change])
                matrix?.saved(answer.events, token: token)
            } catch {
                matrix?.failed(token: token)
                matrixError = error.localizedDescription
            }
        }
    }

    // MARK: Loading

    private func reload() {
        Task { await load() }
    }

    private func load() async {
        let api = model.api
        do {
            let freshChannels = try await api.notificationChannels.list()
            let freshPreferences = try await api.notificationPreferences.get()
            if Task.isCancelled { return }
            guard let freshChannels, let freshPreferences else {
                unsupported = true
                return
            }
            unsupported = false
            channels = freshChannels
            // A toggle on its way keeps showing; its answer brings the rest.
            if matrix?.isSaving != true {
                matrix = PreferenceMatrix(rows: freshPreferences.events)
            }
            loadError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if channels == nil { loadError = error.localizedDescription }
        }
    }
}

/// personal-notifications.tsx `ChannelRow`: the channel, its switch, "Send a
/// test", Remove, and for one still waiting to be confirmed (an email
/// address, a typed-in Telegram chat), the code.
private struct NotificationChannelRow: View {
    let channel: API.PersonalNotificationChannel
    let onChange: (API.PersonalNotificationChannel) -> Void
    /// After a change that moves more than this row (removed, confirmed).
    let onReload: () -> Void

    @Environment(AppModel.self) private var model
    @State private var busy = false
    @State private var message: (text: String, isError: Bool)?
    @State private var code = ""
    @State private var confirmingRemove = false

    /// A kind this app doesn't know is shown read-only (it can still go).
    private var known: Bool { channel.kind.isKnown }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 0) {
                        Text(channel.label)
                            .foregroundStyle(Theme.textPrimary)
                        if channel.name.nonBlank != nil {
                            Text(" · \(channel.kind.label)")
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                    .font(.system(size: 13.5))
                    Text(channel.target)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 8)
                if known && channel.verified {
                    Toggle("On", isOn: Binding(
                        get: { channel.enabled },
                        set: { on in
                            run { api in try await api.notificationChannels.update(channel.id, .init(enabled: on)) }
                        }
                    ))
                    .toggleStyle(.switch)
                    .controlSize(.small)
                    .font(.system(size: 12))
                    Button("Send a test") {
                        run(ok: "Sent. It should arrive in a moment.") { api in
                            try await api.notificationChannels.test(channel.id)
                        }
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                } else if !channel.verified {
                    TonePill(text: "Waiting for the code", tone: .neutral, small: true)
                }
                Button("Remove") { confirmingRemove = true }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
            }

            if known && !channel.verified {
                codeForm
            }

            if let status = channel.statusLine() {
                Text(status.text)
                    .font(.system(size: 11.5))
                    .foregroundStyle(status.isError ? Theme.danger : Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let message {
                InlineMessage(text: message.text, isError: message.isError)
            }
        }
        .disabled(busy)
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .confirmationDialog(
            "Remove \(channel.label)?",
            isPresented: $confirmingRemove
        ) {
            Button("Remove", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Notifications stop going to \(channel.target). You can add it again later.")
        }
    }

    private var codeForm: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(channel.codeSentLine)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                TextField("Confirmation code", text: $code, prompt: Text("123456"))
                    .labelsHidden()
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 110)
                    .onSubmit(confirm)
                Button("Confirm", action: confirm)
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).count < 6)
                Button("Send a new code") {
                    run(ok: "A new code is on its way.") { api in
                        try await api.notificationChannels.resendCode(channel.id)
                    }
                }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12))
            }
        }
    }

    private func confirm() {
        let code = self.code
        guard code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 6 else { return }
        run(ok: "Confirmed. Notifications will go here now.", reloads: true) { api in
            try await api.notificationChannels.verify(channel.id, code: code)
        }
    }

    /// One change to this channel; the answer replaces the row.
    private func run(
        ok: String? = nil,
        reloads: Bool = false,
        _ action: @escaping @MainActor (MarqueeAPI) async throws -> API.PersonalNotificationChannel
    ) {
        busy = true
        message = nil
        let api = model.api
        Task {
            do {
                let updated = try await action(api)
                onChange(updated)
                if let ok { message = (ok, false) }
                if reloads {
                    code = ""
                    // Now confirmed, it's a column in "What you hear about".
                    onReload()
                }
            } catch {
                message = (error.localizedDescription, true)
            }
            busy = false
        }
    }

    private func remove() {
        busy = true
        message = nil
        let api = model.api
        let id = channel.id
        Task {
            do {
                try await api.notificationChannels.remove(id)
                onReload()
            } catch {
                message = (error.localizedDescription, true)
            }
            busy = false
        }
    }
}

/// personal-notifications.tsx `AddChannel`, as a sheet: pick a kind the
/// household offers, fill in its details and "Test & add" (email: "Send
/// code"). Telegram with a household bot also offers "Connect with
/// Telegram", which finds the chat by itself.
private struct AddNotificationChannelSheet: View {
    let channels: API.PersonalNotificationChannels
    /// With the notice to show once it's added.
    let onAdded: (String) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var form: ChannelForm
    @State private var busy = false
    @State private var error: String?
    @State private var link: API.TelegramLinkStart?
    @State private var linkTask: Task<Void, Never>?

    init(channels: API.PersonalNotificationChannels, onAdded: @escaping (String) -> Void) {
        self.channels = channels
        self.onAdded = onAdded
        _form = State(initialValue: ChannelForm(channels: channels))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Add a channel")
                .font(.marqueeDisplay(22))
                .foregroundStyle(Theme.textPrimary)

            Picker("Kind", selection: $form.kind) {
                ForEach(channels.offeredKinds, id: \.self) { kind in
                    Text(kind.label).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if form.kind == .telegram, let bot = channels.telegramBot {
                telegramBox(bot)
            }

            if form.kind == .ntfy, channels.ntfyHouseholdServer != nil {
                Picker("Where", selection: $form.ntfyMode) {
                    Text("A topic on the household's server").tag(ChannelForm.NtfyMode.household)
                    Text("A full topic URL").tag(ChannelForm.NtfyMode.url)
                }
                .pickerStyle(.radioGroup)
                .horizontalRadioGroupLayout()
                .labelsHidden()
                .font(.system(size: 12))
            }

            ForEach(form.fields(channels)) { field in
                VStack(alignment: .leading, spacing: 4) {
                    SettingsField(
                        label: field.label,
                        text: Binding(get: { form.value(field) }, set: { form.setValue($0, for: field) }),
                        placeholder: field.placeholder,
                        secure: field.secure
                    )
                    if let hint = field.hint {
                        Text(hint)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            SettingsField(label: "Name (optional)", text: $form.name, placeholder: "My phone")

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(busy ? form.busyTitle : form.submitTitle) { submit() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(busy || link != nil)
            }
        }
        .padding(24)
        .frame(width: 480)
        .background(Theme.bg1)
        .onChange(of: form.kind) {
            error = nil
            stopLink()
        }
        .onDisappear { stopLink() }
    }

    private func telegramBox(_ bot: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Quickest: open the household's bot, @\(bot), press Start, and come back. Marquee finds your chat by itself.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Button(link == nil ? "Connect with Telegram" : "Waiting for Start…") { connectTelegram() }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(link != nil || busy)
                if let link, let url = URL(string: link.url) {
                    Button("Open Telegram again") { openURL(url) }
                        .buttonStyle(QuietButtonStyle(color: Theme.accent))
                        .font(.system(size: 12))
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border))
    }

    private func submit() {
        let request: API.CreateNotificationChannelRequest
        do {
            request = try form.request(channels)
        } catch {
            self.error = error.localizedDescription
            return
        }
        busy = true
        error = nil
        let notice = form.successNotice
        let api = model.api
        Task {
            do {
                _ = try await api.notificationChannels.add(request)
                onAdded(notice)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    /// `telegram-link`, open Telegram, then ask every 3 seconds until the
    /// bot has seen Start (stops when the sheet closes, or after ~6 minutes).
    private func connectTelegram() {
        stopLink()
        error = nil
        let api = model.api
        let name = form.trimmedName
        linkTask = Task {
            do {
                let start = try await api.notificationChannels.startTelegramLink()
                link = start
                if let url = URL(string: start.url) { openURL(url) }
                _ = try await TelegramLink.run {
                    try await api.notificationChannels.pollTelegramLink(code: start.code, name: name)
                }
                link = nil
                onAdded("Telegram connected. A test message is on its way.")
                dismiss()
            } catch {
                link = nil
                if !PlexPoll.isCancellation(error) {
                    self.error = error.localizedDescription
                }
            }
        }
    }

    private func stopLink() {
        linkTask?.cancel()
        linkTask = nil
        link = nil
    }
}

/// components/household-events-card.tsx — Settings › Integrations ›
/// Household channels: which events the household's Discord, ntfy,
/// Telegram, Pushover, email and webhook post. Hidden on a server before 0.45.
struct HouseholdEventsCard: View {
    @Environment(AppModel.self) private var model
    @State private var events: [API.HouseholdNotificationEvent]?
    @State private var error: String?
    @State private var saving = 0

    var body: some View {
        VStack(spacing: 0) {
            if let events {
                IntegrationCard(
                    title: "What the household channels post",
                    description: "The channels below are the household's: everything picked here goes to each one that's set up, once. Members can add their own Telegram, Pushover, email, Discord, ntfy or webhook under Settings › Account › Notifications, using the bot, app and mail server set up here."
                ) {
                    LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 8) {
                        ForEach(events) { event in
                            Toggle(event.label, isOn: Binding(
                                get: { event.enabled },
                                set: { toggle(event.event, $0) }
                            ))
                            .toggleStyle(.checkbox)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                        }
                    }
                    if let error {
                        InlineMessage(text: error)
                    } else if saving > 0 {
                        Text("Saving…")
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
        }
        .task(id: model.reloadToken) {
            do {
                let fresh = try await model.api.integrations.householdEvents()
                if Task.isCancelled || saving > 0 { return }
                events = fresh?.events
            } catch {
                // Not the admin, or unreachable: the card stays as it was.
            }
        }
    }

    private func toggle(_ event: String, _ enabled: Bool) {
        let previous = events
        events = events?.map { $0.event == event ? API.HouseholdNotificationEvent(event: $0.event, label: $0.label, enabled: enabled) : $0 }
        error = nil
        saving += 1
        let api = model.api
        Task {
            do {
                let answer = try await api.integrations.saveHouseholdEvents([event: enabled])
                if saving == 1 { events = answer.events }
            } catch {
                if saving == 1 { events = previous }
                self.error = error.localizedDescription
            }
            saving -= 1
        }
    }
}
