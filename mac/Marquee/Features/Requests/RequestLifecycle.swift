import SwiftUI

// components/request-lifecycle.tsx and components/my-title-requests.tsx
// (0.46+): changing your mind about a request while it waits for review —
// Edit (other seasons, or 4K) and Cancel — and reviewers' Edit on anyone's
// pending request before approving. The server re-checks everything.

/// The Edit sheet's choices, apart from the view so they're testable: the
/// request's seasons ticked, "The whole series" / "Just these seasons" for a
/// show, and "In 4K" when 4K is set up (always the whole title).
struct RequestEditForm: Hashable, Sendable {
    let options: API.RequestEditOptions
    let rows: [SeasonPickerRow]
    var selection: SeasonPickerSelection
    /// "The whole series" (TV).
    var wholeSeries: Bool
    var fourK: Bool

    init(_ options: API.RequestEditOptions) {
        self.options = options
        rows = options.seasonRows.map(SeasonPickerRow.init)
        selection = SeasonPickerSelection(rows: rows, selected: options.seasons ?? [])
        wholeSeries = options.seasons == nil
        fourK = options.is4k
    }

    var isTV: Bool { options.isTV }

    /// The season checkboxes don't apply: a movie, the whole series, or 4K.
    var listDisabled: Bool { !isTV || wholeSeries || fourK }

    /// "There's nothing to change": a movie without 4K set up.
    var hasAnythingToChange: Bool { options.hasAnythingToChange }

    /// "Save changes" is on: something to change, and seasons picked when
    /// the choice is "Just these seasons".
    var canSave: Bool {
        hasAnythingToChange && (listDisabled || !selection.seasons.isEmpty)
    }

    /// "In 4K (always the whole show)" / "In 4K".
    var fourKLabel: String { isTV ? "In 4K (always the whole show)" : "In 4K" }

    /// What Save sends: 4K always; for a show, the whole series (4K, or
    /// "The whole series") or the ticked seasons; a movie sends no seasons.
    var edit: API.RequestEdit {
        let seasons: API.SeasonsChange
        if !isTV {
            seasons = .unchanged
        } else if fourK || wholeSeries {
            seasons = .wholeSeries
        } else {
            seasons = .seasons(selection.seasons)
        }
        return API.RequestEdit(seasons: seasons, is4k: fourK)
    }
}

/// "Change request": loads what Edit can offer, then the season picker with
/// the scope and 4K choices and "Save changes". Errors stay in the sheet.
struct RequestEditSheet: View {
    let requestId: UUID
    /// Runs after a save went through (the sheet then closes).
    let onSaved: @MainActor () async -> Void

    private enum Phase {
        case loading
        case failed(String)
        case loaded
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var phase = Phase.loading
    @State private var form: RequestEditForm?
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Change request")
                .font(.marqueeDisplay(22))
            content
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(saving ? "Saving…" : "Save changes") { save() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(saving || form?.canSave != true)
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Theme.bg1)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Loading…")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textMuted)
            }
        case let .failed(message):
            InlineMessage(text: message)
        case .loaded:
            if let form {
                loaded(form)
            }
        }
    }

    @ViewBuilder
    private func loaded(_ current: RequestEditForm) -> some View {
        Text(current.options.title)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.textSecondary)

        VStack(alignment: .leading, spacing: 6) {
            if current.isTV {
                Picker("Scope", selection: formBinding(\.wholeSeries)) {
                    Text("The whole series").tag(true)
                    Text("Just these seasons").tag(false)
                }
                .pickerStyle(.radioGroup)
                .labelsHidden()
                .disabled(current.fourK || saving)
            }
            if current.options.fourKAvailable {
                Toggle(current.fourKLabel, isOn: formBinding(\.fourK))
                    .toggleStyle(.checkbox)
                    .disabled(saving)
            } else if !current.isTV {
                Text("There's nothing to change: 4K isn't set up on this server.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(.system(size: 13))

        if current.isTV, !current.rows.isEmpty {
            SeasonPickerList(
                rows: current.rows,
                selection: formBinding(\.selection),
                disabled: saving || current.listDisabled
            )
        }

        if let error { InlineMessage(text: error) }
    }

    private func formBinding<Value>(_ keyPath: WritableKeyPath<RequestEditForm, Value>) -> Binding<Value> {
        Binding(
            get: { form![keyPath: keyPath] },
            set: { form?[keyPath: keyPath] = $0 }
        )
    }

    private func load() async {
        do {
            let options = try await model.api.requests.editOptions(requestId)
            if Task.isCancelled { return }
            form = RequestEditForm(options)
            phase = .loaded
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func save() {
        guard let form, form.canSave, !saving else { return }
        saving = true
        error = nil
        let api = model.api
        let edit = form.edit
        Task {
            do {
                try await api.requests.edit(requestId, edit)
                await onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

/// "Edit" under a pending request: opens `RequestEditSheet`.
struct EditRequestButton: View {
    let requestId: UUID
    var onSaved: @MainActor () async -> Void = {}

    @State private var editing = false

    var body: some View {
        Button("Edit") { editing = true }
            .buttonStyle(QuietButtonStyle())
            .font(.system(size: 11.5))
            .help("Change the seasons or 4K before it's reviewed.")
            .sheet(isPresented: $editing) {
                RequestEditSheet(requestId: requestId, onSaved: onSaved)
            }
    }
}

/// "Cancel request", then "Cancel it? Yes, cancel / Keep it".
struct CancelRequestControl: View {
    let requestId: UUID
    var onCancelled: @MainActor () async -> Void = {}

    @Environment(AppModel.self) private var model
    @State private var confirming = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                if confirming {
                    Text("Cancel it?")
                        .foregroundStyle(Theme.textSecondary)
                    Button(busy ? "Cancelling…" : "Yes, cancel") { cancel() }
                        .buttonStyle(QuietButtonStyle(color: Theme.danger))
                        .disabled(busy)
                    Button("Keep it") { confirming = false }
                        .buttonStyle(QuietButtonStyle())
                        .disabled(busy)
                } else {
                    Button("Cancel request") { confirming = true }
                        .buttonStyle(QuietButtonStyle())
                }
            }
            if let error {
                Text(error)
                    .foregroundStyle(Theme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(.system(size: 11.5))
    }

    private func cancel() {
        busy = true
        error = nil
        let api = model.api
        Task {
            do {
                try await api.requests.cancel(requestId)
                confirming = false
                await onCancelled()
            } catch APIError.forbidden {
                // The server's own words; `.forbidden` carries none.
                self.error = "Only whoever asked can cancel it — decline it instead."
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

/// components/my-title-requests.tsx: under the title page's actions, the
/// viewer's own requests for the title — what was asked for and where it
/// stands, Edit / Cancel while it's pending, and its conversation.
struct MyTitleRequestsList: View {
    let requests: [API.TitleRequestSummary]
    /// Refreshes the page's status after an edit or a cancel.
    let onChanged: @MainActor () async -> Void

    var body: some View {
        if !requests.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(requests) { request in
                    MyTitleRequestRow(request: request, onChanged: onChanged)
                }
            }
            .frame(maxWidth: 560, alignment: .leading)
        }
    }
}

private struct MyTitleRequestRow: View {
    let request: API.TitleRequestSummary
    let onChanged: @MainActor () async -> Void

    @State private var showsComments = false
    @State private var shownCount: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            FlowLayout(spacing: 12, lineSpacing: 4) {
                Text(request.sentence)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if request.canEdit {
                    EditRequestButton(requestId: request.id, onSaved: onChanged)
                }
                if request.canCancel {
                    CancelRequestControl(requestId: request.id, onCancelled: onChanged)
                }
            }
            CommentsToggle(count: shownCount ?? request.commentCount, isOpen: $showsComments)
            if showsComments {
                CommentThreadPanel(parent: .request(request.id)) { shownCount = $0 }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.bg1.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
        .onChange(of: request.commentCount) { _, _ in shownCount = nil }
    }
}
