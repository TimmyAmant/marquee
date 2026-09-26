import Foundation

// Per-member permissions (0.48+, api-v1.md `GET /me` and §11): the switches
// the admin sets in the household member editor, mirroring
// lib/users/permissions.ts. The server enforces every one of them; the app
// uses them only to decide what to show.

extension API {
    /// One switch. The wire name is the case name.
    enum Permission: String, CaseIterable, Codable, Hashable, Sendable {
        case requestMovies
        case requestTv
        case request4kMovies
        case request4kTv
        case autoApproveMovies
        case autoApproveTv
        case autoApprove4kMovies
        case autoApprove4kTv
        case advancedRequests
        case viewRequests
        case reviewRequests
        case manageIssues
        case reportIssues
        case manageBlocklist
        case bypassLimits
    }

    /// "Member" / "Trusted" (the presets the editor's picker fills in), or
    /// "Custom" when the switches match neither.
    enum PermissionPreset: String, CaseIterable, Hashable, Sendable {
        case member
        case trusted
        case custom

        var label: String {
            switch self {
            case .member: return "Member"
            case .trusted: return "Trusted"
            case .custom: return "Custom"
            }
        }

        /// The switches the preset fills in; nil for Custom.
        var permissions: Permissions? {
            switch self {
            case .member: return .memberPreset
            case .trusted: return .trustedPreset
            case .custom: return nil
            }
        }
    }

    /// `permissions` on `/me`, login's `user` and household members: every
    /// switch on or off. Decoding is forgiving: an unknown key is ignored and
    /// a missing (or non-boolean) one is off. Encodes the full map.
    struct Permissions: Codable, Hashable, Sendable {
        private(set) var granted: Set<Permission>

        init(_ granted: Set<Permission> = []) {
            self.granted = granted
        }

        init(_ granted: [Permission]) {
            self.init(Set(granted))
        }

        /// Everything (the admin).
        static let all = Permissions(Set(Permission.allCases))

        /// What a new account can do, and what "Member" fills in.
        static let memberPreset = Permissions([
            .requestMovies, .requestTv, .request4kMovies, .request4kTv, .reportIssues,
        ])

        /// What "Trusted" fills in: Member plus reviewing requests and
        /// problem reports, auto-approval, Advanced options and no limits.
        /// Not the blocklist.
        static let trustedPreset = Permissions(memberPreset.granted.union([
            .autoApproveMovies, .autoApproveTv, .autoApprove4kMovies, .autoApprove4kTv,
            .advancedRequests, .viewRequests, .reviewRequests, .manageIssues, .bypassLimits,
        ]))

        /// What an account could do before permissions existed (a server
        /// older than 0.48 sends no `permissions`): the admin everything,
        /// a trusted member everything but the blocklist, anyone else the
        /// Member preset plus their auto-approval (the 4K one mirroring it).
        static func legacy(role: UserRole, autoApproveMovies: Bool = false, autoApproveTv: Bool = false) -> Permissions {
            switch role {
            case .admin:
                return .all
            case .trusted:
                var permissions = Permissions.all
                permissions[.manageBlocklist] = false
                return permissions
            case .member, .unknown:
                var permissions = Permissions.memberPreset
                permissions[.autoApproveMovies] = autoApproveMovies
                permissions[.autoApprove4kMovies] = autoApproveMovies
                permissions[.autoApproveTv] = autoApproveTv
                permissions[.autoApprove4kTv] = autoApproveTv
                return permissions
            }
        }

        /// Whether the switch itself is on.
        subscript(_ permission: Permission) -> Bool {
            get { granted.contains(permission) }
            set {
                if newValue { granted.insert(permission) } else { granted.remove(permission) }
            }
        }

        /// Whether this lets them do it. Reviewing requests brings seeing
        /// them (`can()` in lib/users/permissions.ts).
        func can(_ permission: Permission) -> Bool {
            if granted.contains(permission) { return true }
            return permission == .viewRequests && granted.contains(.reviewRequests)
        }

        /// Which preset these switches are, "Custom" when neither.
        var preset: PermissionPreset {
            if self == .trustedPreset { return .trusted }
            if self == .memberPreset { return .member }
            return .custom
        }

        /// Every switch, on or off.
        var map: [String: Bool] {
            Dictionary(uniqueKeysWithValues: Permission.allCases.map { ($0.rawValue, granted.contains($0)) })
        }

        private struct AnyKey: CodingKey {
            let stringValue: String
            var intValue: Int? { nil }
            init(stringValue: String) { self.stringValue = stringValue }
            init?(intValue: Int) { nil }
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: AnyKey.self)
            var granted: Set<Permission> = []
            for permission in Permission.allCases {
                let key = AnyKey(stringValue: permission.rawValue)
                if (try? container.decodeIfPresent(Bool.self, forKey: key)) == true {
                    granted.insert(permission)
                }
            }
            self.granted = granted
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: AnyKey.self)
            for permission in Permission.allCases {
                try container.encode(granted.contains(permission), forKey: AnyKey(stringValue: permission.rawValue))
            }
        }
    }

    /// The editor's switches with their plain-language lines, grouped as the
    /// website shows them (PERMISSION_GROUPS in lib/users/permissions.ts).
    struct PermissionGroup: Hashable, Sendable, Identifiable {
        struct Item: Hashable, Sendable, Identifiable {
            let permission: Permission
            let label: String
            let description: String
            var id: Permission { permission }
        }

        let title: String
        let items: [Item]
        var id: String { title }

        static let all: [PermissionGroup] = [
            PermissionGroup(title: "Requests", items: [
                Item(permission: .requestMovies, label: "Request movies", description: "Ask for movies to be added."),
                Item(permission: .requestTv, label: "Request TV", description: "Ask for shows, or some of their seasons, to be added."),
                Item(permission: .request4kMovies, label: "Request 4K movies", description: "Ask for the 4K copy of a movie, once there's a 4K Radarr."),
                Item(permission: .request4kTv, label: "Request 4K TV", description: "Ask for the 4K copy of a show, once there's a 4K Sonarr."),
                Item(
                    permission: .advancedRequests, label: "Advanced request options",
                    description: "Pick the server, quality profile, folder and tags when asking for or approving a title."
                ),
                Item(permission: .bypassLimits, label: "No request limits", description: "Request limits don't apply to them."),
            ]),
            PermissionGroup(title: "Approved straight away", items: [
                Item(permission: .autoApproveMovies, label: "Movies", description: "Their movie requests skip the review queue."),
                Item(permission: .autoApproveTv, label: "TV", description: "Their TV requests skip the review queue."),
                Item(permission: .autoApprove4kMovies, label: "4K movies", description: "Their 4K movie requests skip the review queue."),
                Item(permission: .autoApprove4kTv, label: "4K TV", description: "Their 4K TV requests skip the review queue."),
            ]),
            PermissionGroup(title: "Helping run things", items: [
                Item(permission: .viewRequests, label: "See everyone's requests", description: "The Requests page lists what everyone has asked for."),
                Item(
                    permission: .reviewRequests, label: "Review requests",
                    description: "Approve, decline and change other people's requests, and handle Can't find and Couldn't add."
                ),
                Item(permission: .manageIssues, label: "Handle problem reports", description: "See everyone's problem reports and mark them fixed."),
                Item(permission: .reportIssues, label: "Report problems", description: "Tell you when something's wrong with a title."),
                Item(permission: .manageBlocklist, label: "Manage the blocklist", description: "Choose titles nobody can request."),
            ]),
        ]

        /// The line under "See everyone's requests" while it's locked on.
        static let lockedViewRequestsLine = "Comes with reviewing requests."
        /// Under the switches.
        static let footer = "Settings, integrations, household accounts, API keys and sign-in stay yours alone."
    }
}

extension User {
    /// What this account may do: the server's switches, or (from a server
    /// older than 0.48) what its role allowed. The admin always may.
    var effectivePermissions: API.Permissions {
        if role == .admin { return .all }
        return permissions ?? .legacy(role: role, autoApproveMovies: autoApproveMovies ?? false, autoApproveTv: autoApproveTv ?? false)
    }

    func can(_ permission: API.Permission) -> Bool {
        isAdmin || effectivePermissions.can(permission)
    }

    /// "Admin", or the preset the switches match ("Member", "Trusted",
    /// "Custom"). An unknown role from a newer server shows as it is.
    var roleLabel: String {
        switch role {
        case .admin, .unknown: return role.label
        case .member, .trusted: return effectivePermissions.preset.label
        }
    }
}

extension API.HouseholdMember {
    /// Their switches, or (from a server older than 0.48) what the role allowed.
    var effectivePermissions: API.Permissions {
        if isAdmin { return .all }
        return permissions ?? .legacy(role: role, autoApproveMovies: autoApproveMovies, autoApproveTv: autoApproveTv)
    }

    /// The row's "Trusted" / "Custom" tag; nil for the admin and for the
    /// Member preset.
    var presetTag: String? {
        guard !isAdmin else { return nil }
        if permissions == nil {
            return isTrusted ? API.PermissionPreset.trusted.label : nil
        }
        let preset = effectivePermissions.preset
        return preset == .member ? nil : preset.label
    }
}
