import SwiftUI
import Observation

// components/comment-thread.tsx (0.46+): the conversation on a request or a
// problem report, between whoever asked (or reported) and the reviewers.
// Collapsed to a "Comments (2)" button until opened; the thread loads then.
// Plain text only, line breaks kept.

/// The thread's state, apart from the view so it's testable.
@MainActor
@Observable
final class CommentThreadModel {
    let parent: API.CommentParent

    private(set) var thread: API.CommentThread?
    private(set) var loadError: String?
    /// The "Write a comment" box, cut to `maxLength` as it's typed.
    var draft = "" {
        didSet {
            let clamped = Self.clamp(draft, to: maxLength)
            if clamped != draft { draft = clamped }
        }
    }
    private(set) var isSending = false
    private(set) var sendError: String?
    /// The comment being edited in place, and its text.
    private(set) var editingId: String?
    var editDraft = "" {
        didSet {
            let clamped = Self.clamp(editDraft, to: maxLength)
            if clamped != editDraft { editDraft = clamped }
        }
    }
    /// A comment whose Save / Delete is in flight.
    private(set) var busyCommentId: String?
    /// What went wrong saving or deleting a comment, under it.
    private(set) var commentErrors: [String: String] = [:]

    /// The server's own limit (2000) until the thread says otherwise.
    static let defaultMaxLength = 2000

    init(parent: API.CommentParent) {
        self.parent = parent
    }

    var maxLength: Int { thread?.maxLength ?? Self.defaultMaxLength }
    var comments: [API.Comment] { thread?.results ?? [] }
    /// What "Comments (N)" should read once the thread has loaded.
    var commentCount: Int? { thread?.commentCount }
    var canComment: Bool { thread?.canComment == true }

    var canSend: Bool { !isSending && draft.nonBlank != nil }
    var canSaveEdit: Bool { busyCommentId == nil && editDraft.nonBlank != nil }

    /// "150 left", once the draft is within 200 of the limit.
    var remainingLabel: String? {
        let used = draft.unicodeScalars.count
        return used > maxLength - 200 ? "\(maxLength - used) left" : nil
    }

    func load(_ api: MarqueeAPI) async {
        do {
            let fresh = try await api.comments.thread(parent)
            if Task.isCancelled { return }
            thread = fresh
            loadError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            if thread == nil { loadError = "This conversation isn't available." }
        } catch {
            if thread == nil { loadError = error.localizedDescription }
        }
    }

    func send(_ api: MarqueeAPI) async {
        guard canSend else { return }
        isSending = true
        sendError = nil
        do {
            try await api.comments.add(draft, to: parent)
            draft = ""
            await load(api)
        } catch {
            sendError = error.localizedDescription
        }
        isSending = false
    }

    func startEditing(_ comment: API.Comment) {
        guard comment.canEdit else { return }
        editingId = comment.id
        editDraft = comment.body
        commentErrors[comment.id] = nil
    }

    func cancelEditing() {
        editingId = nil
        editDraft = ""
    }

    func saveEdit(_ api: MarqueeAPI) async {
        guard let id = editingId, canSaveEdit else { return }
        busyCommentId = id
        commentErrors[id] = nil
        do {
            try await api.comments.edit(id, in: parent, body: editDraft)
            cancelEditing()
            await load(api)
        } catch {
            commentErrors[id] = Self.message(for: error)
        }
        busyCommentId = nil
    }

    func delete(_ comment: API.Comment, _ api: MarqueeAPI) async {
        guard comment.canDelete, busyCommentId == nil else { return }
        busyCommentId = comment.id
        commentErrors[comment.id] = nil
        do {
            try await api.comments.delete(comment.id, in: parent)
            if editingId == comment.id { cancelEditing() }
            await load(api)
        } catch {
            commentErrors[comment.id] = Self.message(for: error)
        }
        busyCommentId = nil
    }

    /// `APIError.forbidden` carries no text of its own ("Only an admin can
    /// do that."), so a 403 on a comment says what the server's does.
    nonisolated static let tooLateMessage = "Comments can only be changed for 15 minutes after posting."

    nonisolated static func message(for error: any Error) -> String {
        if let failure = error as? APIError, failure == .forbidden { return tooLateMessage }
        return error.localizedDescription
    }

    /// At most `limit` characters, counted the server's way (code points).
    nonisolated static func clamp(_ text: String, to limit: Int) -> String {
        let scalars = text.unicodeScalars
        guard scalars.count > limit else { return text }
        return String(String.UnicodeScalarView(scalars.prefix(limit)))
    }

    /// The toggle's label: "Comment" with none yet, "Comments (2)", and
    /// "Hide comments" while it's open.
    nonisolated static func toggleLabel(count: Int, isOpen: Bool) -> String {
        if isOpen { return "Hide comments" }
        return count == 0 ? "Comment" : "Comments (\(count))"
    }
}

/// "Comments (2)" / "Hide comments".
struct CommentsToggle: View {
    let count: Int
    @Binding var isOpen: Bool

    var body: some View {
        Button(CommentThreadModel.toggleLabel(count: count, isOpen: isOpen)) { isOpen.toggle() }
            .buttonStyle(QuietButtonStyle())
            .font(.system(size: 11.5))
            .accessibilityValue(isOpen ? "Expanded" : "Collapsed")
    }
}

/// The thread itself: the messages, oldest first, and a box to add one.
struct CommentThreadPanel: View {
    /// Keeps the toggle's count current once the thread has loaded.
    var onCountChange: ((Int) -> Void)?

    @Environment(AppModel.self) private var model
    @State private var thread: CommentThreadModel

    init(parent: API.CommentParent, onCountChange: ((Int) -> Void)? = nil) {
        self.onCountChange = onCountChange
        _thread = State(initialValue: CommentThreadModel(parent: parent))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let error = thread.loadError, thread.thread == nil {
                InlineMessage(text: error)
            } else if thread.thread == nil {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Loading…")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            } else {
                if thread.comments.isEmpty {
                    Text("No comments yet.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(thread.comments) { comment in
                            CommentItemView(comment: comment, thread: thread)
                        }
                    }
                }
                if thread.canComment {
                    composer
                }
            }
        }
        .padding(12)
        .frame(maxWidth: 640, alignment: .leading)
        .background(Theme.bg1.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
        .task { await thread.load(model.api) }
        .onChange(of: thread.commentCount) { _, count in
            if let count { onCountChange?(count) }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            CommentTextEditor(text: $thread.draft, placeholder: "Write a comment", height: 56)
                .disabled(thread.isSending)
            HStack {
                if let remaining = thread.remainingLabel {
                    Text(remaining)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer()
                Button(thread.isSending ? "Sending…" : "Send") {
                    let api = model.api
                    Task { await thread.send(api) }
                }
                .buttonStyle(AccentButtonStyle(compact: true))
                .disabled(!thread.canSend)
            }
            if let error = thread.sendError {
                InlineMessage(text: error)
            }
        }
    }
}

/// One message: photo, name, role, note kind, time, "edited", the text, and
/// Edit / Delete while allowed.
private struct CommentItemView: View {
    let comment: API.Comment
    let thread: CommentThreadModel

    @Environment(AppModel.self) private var model

    private var isEditing: Bool { thread.editingId == comment.id }
    private var isBusy: Bool { thread.busyCommentId == comment.id }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            UserAvatarView(label: comment.author.label, avatarUrl: comment.author.avatarUrl, size: 28)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                header
                if isEditing {
                    editor
                } else {
                    Text(comment.body)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                    if comment.canEdit || comment.canDelete {
                        HStack(spacing: 12) {
                            if comment.canEdit {
                                Button("Edit") { thread.startEditing(comment) }
                                    .buttonStyle(QuietButtonStyle(color: Theme.textMuted))
                            }
                            if comment.canDelete {
                                Button(isBusy ? "Deleting…" : "Delete") {
                                    let api = model.api
                                    Task { await thread.delete(comment, api) }
                                }
                                .buttonStyle(QuietButtonStyle(color: Theme.textMuted))
                                .disabled(thread.busyCommentId != nil)
                            }
                        }
                        .font(.system(size: 11.5))
                    }
                }
                if let error = thread.commentErrors[comment.id] {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(comment.author.label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.textPrimary)
            Text(comment.headerParts.joined(separator: " · "))
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.textMuted)
                .help(comment.editedAt.map { "Edited \(Format.dateTime($0))" } ?? "")
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 6) {
            CommentTextEditor(text: Binding(get: { thread.editDraft }, set: { thread.editDraft = $0 }), placeholder: "", height: 72)
                .disabled(isBusy)
            HStack(spacing: 8) {
                Button(isBusy ? "Saving…" : "Save") {
                    let api = model.api
                    Task { await thread.saveEdit(api) }
                }
                .buttonStyle(AccentButtonStyle(compact: true))
                .disabled(!thread.canSaveEdit)
                Button("Cancel") { thread.cancelEditing() }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(isBusy)
            }
        }
    }
}

/// A multi-line text box in the page's style, with a placeholder.
private struct CommentTextEditor: View {
    @Binding var text: String
    let placeholder: String
    let height: CGFloat

    var body: some View {
        TextEditor(text: $text)
            .font(.system(size: 13))
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 5)
            .padding(.vertical, 6)
            .frame(height: height)
            .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border))
            .overlay(alignment: .topLeading) {
                if text.isEmpty, !placeholder.isEmpty {
                    Text(placeholder)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .allowsHitTesting(false)
                }
            }
            .accessibilityLabel(placeholder.isEmpty ? "Comment" : placeholder)
    }
}
