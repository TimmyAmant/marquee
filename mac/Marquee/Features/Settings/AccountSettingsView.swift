import SwiftUI

/// app/settings/page.tsx + household-members-list.tsx + create-user-form.tsx.
/// `GET /users` returns every account for an admin and only your own for a
/// member, so one list covers both.
struct AccountSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system.rawValue

    @State private var members: [API.HouseholdMember]?
    @State private var loadError: String?
    @State private var editing: API.HouseholdMember?
    @State private var removing: API.HouseholdMember?
    @State private var removeError: String?

    var body: some View {
        SettingsPane(title: "Account", subtitle: "Your Marquee account details.") {
            if let viewer = model.viewer {
                VStack(alignment: .leading, spacing: 14) {
                    detail("Name", viewer.displayName.nonBlank ?? "—")
                    detail("Username", viewer.username)
                    detail("Role", viewer.role.label)
                    detail("Server", model.session.server?.displayName ?? "—")
                    HStack {
                        Picker("Appearance", selection: $appearance) {
                            ForEach(AppearancePreference.allCases) { preference in
                                Text(preference.label).tag(preference.rawValue)
                            }
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 280)
                        Spacer()
                        Button("Sign out") { model.signOut() }
                            .buttonStyle(OutlineButtonStyle())
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: 520, alignment: .leading)
                .cardSurface()

                SettingsSectionLabel(text: viewer.isAdmin ? "Household members" : "Your account")
                Text(viewer.isAdmin
                     ? "Everyone with an account on this Marquee server."
                     : "Edit your name, username, or password below.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)

                if let members {
                    VStack(spacing: 0) {
                        ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
                            if index > 0 { Divider().overlay(Theme.border) }
                            memberRow(member, isAdmin: viewer.isAdmin)
                        }
                    }
                    .frame(maxWidth: 520)
                    .cardSurface(padding: 0)
                } else if let loadError {
                    InlineMessage(text: loadError)
                } else {
                    ProgressView().controlSize(.small)
                }

                if let removeError { InlineMessage(text: removeError) }

                if viewer.isAdmin {
                    SettingsSectionLabel(text: "Add a household member")
                    Text("There's no public signup — create accounts for other people in your household here.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                    CreateMemberForm()
                        .frame(maxWidth: 520)
                        .cardSurface()
                }
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .users))) {
            do {
                let fresh = try await model.api.users.list()
                if Task.isCancelled { return }
                members = fresh
                loadError = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if members == nil { loadError = error.localizedDescription }
            }
        }
        .sheet(item: $editing) { member in
            EditMemberSheet(member: member)
                .environment(model)
        }
        .confirmationDialog(
            "Remove \(removing?.username ?? "this member")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            presenting: removing
        ) { member in
            Button("Remove", role: .destructive) { remove(member) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Their favorites, requests, and notifications are removed with the account.")
        }
    }

    private func detail(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)
            Text(value)
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.textPrimary)
        }
    }

    private func memberRow(_ member: API.HouseholdMember, isAdmin: Bool) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(member.label)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.textPrimary)
                if member.displayName.nonBlank != nil {
                    Text(member.username)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            Spacer()
            if member.isAdmin {
                TonePill(text: "Admin", tone: .accent, small: true)
            }
            if member.isCurrentUser {
                TonePill(text: "You", tone: .neutral, small: true)
            }
            if isAdmin || member.isCurrentUser {
                Button("Edit") { editing = member }
                    .buttonStyle(QuietButtonStyle())
                    .font(.system(size: 12))
            }
            if isAdmin && !member.isAdmin {
                Button("Remove") { removing = member }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private func remove(_ member: API.HouseholdMember) {
        let previous = members
        // Drop the row straight away, like the web list.
        members?.removeAll { $0.id == member.id }
        removing = nil
        let api = model.api
        Task {
            do {
                try await api.users.remove(member.id)
                removeError = nil
            } catch {
                members = previous
                removeError = error.localizedDescription
            }
        }
    }
}

private struct CreateMemberForm: View {
    @Environment(AppModel.self) private var model
    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var pending = false
    @State private var error: String?
    @State private var createdName: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsField(label: "Name", text: $displayName)
            SettingsField(label: "Username", text: $username)
            SettingsField(label: "Password", text: $password, secure: true)
            if let error { InlineMessage(text: error) }
            if let createdName {
                InlineMessage(text: "Account created — \(createdName) can now sign in.", isError: false)
            }
            Button(pending ? "Creating…" : "Create account") { create() }
                .buttonStyle(AccentButtonStyle())
                .disabled(pending)
        }
    }

    private func create() {
        error = nil
        createdName = nil
        pending = true
        let request = API.CreateUserRequest(
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password,
            displayName: displayName.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let api = model.api
        Task {
            do {
                let created = try await api.users.create(request)
                createdName = created.label
                displayName = ""
                username = ""
                password = ""
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

private struct EditMemberSheet: View {
    let member: API.HouseholdMember

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var autoApproveMovies = false
    @State private var autoApproveTv = false
    @State private var pending = false
    @State private var error: String?

    /// Auto-approval is an admin setting, and only for non-admin accounts.
    private var showsAutoApproval: Bool {
        model.viewer?.isAdmin == true && !member.isAdmin
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Edit \(member.username)")
                .font(.marqueeDisplay(22))
            SettingsField(label: "Name", text: $displayName)
            SettingsField(label: "Username", text: $username)
            SettingsField(label: "New password", text: $password, placeholder: "Leave blank to keep current password", secure: true)

            if showsAutoApproval {
                Toggle("Auto-approve movie requests", isOn: $autoApproveMovies)
                Toggle("Auto-approve TV requests", isOn: $autoApproveTv)
            }

            if member.isCurrentUser {
                Text("Setting a new password signs you out of every device, including this Mac.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? "Saving…" : "Save") { save() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending)
            }
        }
        .toggleStyle(.checkbox)
        .padding(24)
        .frame(width: 420)
        .background(Theme.bg1)
        .onAppear {
            displayName = member.displayName ?? ""
            username = member.username
            autoApproveMovies = member.autoApproveMovies
            autoApproveTv = member.autoApproveTv
        }
    }

    private func save() {
        pending = true
        error = nil
        let request = API.UpdateUserRequest(
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password.nonBlank,
            autoApproveMovies: showsAutoApproval ? autoApproveMovies : nil,
            autoApproveTv: showsAutoApproval ? autoApproveTv : nil
        )
        let api = model.api
        Task {
            do {
                let result = try await api.users.update(member.id, request)
                dismiss()
                // Changing your own password revoked this Mac's token.
                if result.tokensRevoked && member.isCurrentUser {
                    model.signOut()
                }
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}
