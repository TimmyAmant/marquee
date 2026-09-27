import Foundation

/// What the admin can change about another member in the edit sheet: the
/// permission switches (0.48+, app/settings/permissions-editor.tsx), or on
/// an older server the role and auto-approval it had before. Pure, so the
/// sheet's rules (presets, Custom, the Review → See lock, the PATCH fields)
/// are unit tested.
struct MemberAccessEditor: Equatable, Sendable {
    enum Mode: Equatable, Sendable {
        /// The server sends `permissions`: the preset picker and switches.
        case permissions
        /// An older server: the auto-approve toggles and the role picker.
        case legacy
    }

    let mode: Mode
    /// The admin may change it at all (another, non-admin account).
    let isEditable: Bool
    /// Legacy mode: the role picker (0.39+ servers, not your own account).
    let showsLegacyRole: Bool

    /// The switches as the admin has set them.
    private(set) var switches: API.Permissions
    private let initialSwitches: API.Permissions

    /// Legacy mode's fields.
    var role: API.UserRole
    var autoApproveMovies: Bool
    var autoApproveTv: Bool

    /// - Parameter viewerIsAdmin: Only the admin changes what someone may do.
    init(member: API.HouseholdMember, viewerIsAdmin: Bool) {
        mode = member.permissions == nil ? .legacy : .permissions
        isEditable = viewerIsAdmin && !member.isAdmin
        showsLegacyRole = isEditable && !member.isCurrentUser && member.reportsRequestLimits
        switches = member.effectivePermissions
        initialSwitches = switches
        role = member.isTrusted ? .trusted : .member
        autoApproveMovies = member.autoApproveMovies
        autoApproveTv = member.autoApproveTv
    }

    // MARK: Permissions mode

    /// The permission editor is shown: the admin, on another member of a
    /// server that has permissions (never on your own account).
    func showsPermissions(isCurrentUser: Bool) -> Bool {
        isEditable && mode == .permissions && !isCurrentUser
    }

    /// Legacy mode's toggles and picker are shown instead.
    var showsLegacyAutoApproval: Bool { isEditable && mode == .legacy }

    /// The picker's value: whichever preset the switches are, else Custom.
    var preset: API.PermissionPreset { sent.preset }

    /// "Custom" is only picked by itself, never from the menu.
    func isPickable(_ preset: API.PermissionPreset) -> Bool {
        preset != .custom || self.preset == .custom
    }

    /// The picker's rows, as the website words them.
    static func pickerLabel(_ preset: API.PermissionPreset) -> String {
        switch preset {
        case .member: return String(localized: "Member — requests, and reports problems")
        case .trusted: return String(localized: "Trusted — also reviews requests and problem reports")
        case .custom: return String(localized: "Custom")
        }
    }

    /// Picking Member or Trusted fills in its switches; Custom changes nothing.
    mutating func pick(_ preset: API.PermissionPreset) {
        guard let permissions = preset.permissions else { return }
        switches = permissions
    }

    /// "See everyone's requests" comes with reviewing them: on and locked.
    func isLocked(_ permission: API.Permission) -> Bool {
        permission == .viewRequests && switches[.reviewRequests]
    }

    /// The checkbox shows on.
    func isOn(_ permission: API.Permission) -> Bool {
        switches[permission] || isLocked(permission)
    }

    /// Turning Review requests on turns See everyone's requests on too.
    mutating func set(_ permission: API.Permission, on: Bool) {
        guard !isLocked(permission) else { return }
        switches[permission] = on
        if permission == .reviewRequests && on {
            switches[.viewRequests] = true
        }
    }

    /// The line under a switch.
    func description(for item: API.PermissionGroup.Item) -> String {
        isLocked(item.permission) ? API.PermissionGroup.lockedViewRequestsLine : item.description
    }

    /// What's saved: the switches, with a locked one on.
    private var sent: API.Permissions {
        var permissions = switches
        if permissions[.reviewRequests] { permissions[.viewRequests] = true }
        return permissions
    }

    // MARK: The PATCH body

    /// Sets this editor's fields on the `PATCH /users/{id}` body: the full
    /// permissions map when a switch changed (0.48+), else — on an older
    /// server — the auto-approval and the role, as before.
    func apply(to request: inout API.UpdateUserRequest, isCurrentUser: Bool) {
        switch mode {
        case .permissions:
            if showsPermissions(isCurrentUser: isCurrentUser), sent != initialSwitches {
                request.permissions = sent
            }
        case .legacy:
            guard isEditable else { return }
            request.autoApproveMovies = autoApproveMovies
            request.autoApproveTv = autoApproveTv
            if showsLegacyRole { request.role = role }
        }
    }
}
