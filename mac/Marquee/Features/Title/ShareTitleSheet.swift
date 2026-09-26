import SwiftUI

/// components/share-title-button.tsx's dialog as a sheet: send the title to
/// someone else in the household (they get a "Shared with you" notification),
/// or share a link through macOS's share menu (Messages, Mail, AirDrop…).
struct ShareTitleSheet: View {
    @State private var share: ShareTitleModel

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    init(titleID: API.TitleID, titleName: String, imdbId: String?, serverURL: URL?) {
        _share = State(initialValue: ShareTitleModel(
            titleID: titleID, titleName: titleName, imdbId: imdbId, serverURL: serverURL
        ))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Share “\(share.titleName)”")
                .font(.marqueeDisplay(22))
                .fixedSize(horizontal: false, vertical: true)

            household
            Divider().overlay(Theme.border)
            linkSection

            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Theme.bg1)
        .task { await share.load(model.api) }
    }

    // MARK: Send to someone in the household

    @ViewBuilder
    private var household: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Send to someone in the household")
            switch share.members {
            case .loading:
                ProgressView().controlSize(.small)
            case let .unavailable(message):
                Text(message)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            case let .loaded(users) where users.isEmpty:
                Text("No one else has an account here yet.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textMuted)
            case let .loaded(users):
                memberList(users)
                noteField
                sendRow
            }
        }
    }

    private func memberList(_ users: [API.ShareableUser]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(users) { user in
                    MemberToggleRow(user: user, isOn: share.isSelected(user)) { share.toggle(user) }
                        .disabled(!share.isSelectable)
                }
            }
        }
        // Grows with the household up to about five rows, then scrolls.
        .frame(maxHeight: min(CGFloat(users.count) * 42, 210))
        .scrollBounceBehavior(.basedOnSize)
    }

    private var noteField: some View {
        VStack(alignment: .trailing, spacing: 4) {
            TextField("Add a note (optional)", text: $share.note, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 13))
                .disabled(share.sendState == .sending)
            if let count = share.noteCountLabel {
                Text(count)
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(Theme.textMuted)
            }
        }
    }

    private var sendRow: some View {
        HStack(spacing: 12) {
            switch share.sendState {
            case let .sent(message):
                InlineMessage(text: message, isError: false)
            case let .failed(message):
                InlineMessage(text: message)
            case .idle, .sending:
                EmptyView()
            }
            Spacer(minLength: 0)
            Button(share.sendState == .sending ? "Sending…" : "Send") {
                Task { await share.send(model.api) }
            }
            .buttonStyle(AccentButtonStyle())
            .keyboardShortcut(.defaultAction)
            .disabled(!share.canSend)
        }
    }

    // MARK: Share a link

    private var linkSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Share a link")
            let kinds = share.linkKinds
            if kinds.count > 1 {
                Picker("Link", selection: $share.linkKind) {
                    ForEach(kinds) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.radioGroup)
                .labelsHidden()
                .font(.system(size: 13))
            }
            if let url = share.linkURL {
                Text(url.absoluteString)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                HStack(spacing: 8) {
                    // The system share menu: Messages, Mail, AirDrop, Notes…
                    ShareLink(item: url, subject: Text(share.titleName)) {
                        Label("Share…", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(OutlineButtonStyle())
                    Button {
                        model.copyLink(url)
                    } label: {
                        Label("Copy link", systemImage: "link")
                    }
                    .buttonStyle(OutlineButtonStyle())
                }
            }
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
    }
}

/// One household member: photo (or initials), name, and a checkbox.
private struct MemberToggleRow: View {
    let user: API.ShareableUser
    let isOn: Bool
    let toggle: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 10) {
                UserAvatarView(label: user.label, avatarUrl: user.avatarUrl, size: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(user.label)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                    if user.label != user.username {
                        Text(user.username)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 16))
                    .foregroundStyle(isOn ? Theme.accent : Theme.textMuted)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 8).fill(hovering ? Theme.bg2 : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(user.label)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}
