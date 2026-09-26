import XCTest
@testable import Marquee

// Per-member permissions (0.48+): decoding `permissions` from the doc
// fixtures, the fallback for an older server, presets, the member editor's
// rules and PATCH body, and what the viewer's switches show.

final class PermissionsTests: XCTestCase {
    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixtureData(name))
    }

    private func decode<T: Decodable>(_ type: T.Type, json: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(json.utf8))
    }

    private func encodedObject(_ value: some Encodable) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(value)) as? [String: Any])
    }

    private static let memberId = "83c55a49-6153-4cb9-ae22-4a42d48f4cf3"

    /// A household member row; `extra` is spliced in (e.g. `"permissions":{…}`).
    private func member(role: String = "member", autoApproveMovies: Bool = false, autoApproveTv: Bool = false,
                        isCurrentUser: Bool = false, extra: String = "") throws -> API.HouseholdMember {
        let json = """
        {"id":"\(Self.memberId)","username":"kid","displayName":null,"role":"\(role)",\
        "autoApproveMovies":\(autoApproveMovies),"autoApproveTv":\(autoApproveTv),\
        "createdAt":"2026-09-17T17:12:40.991Z","isCurrentUser":\(isCurrentUser),\
        "movieQuotaLimit":null,"movieQuotaDays":7,"tvQuotaLimit":null,"tvQuotaDays":7\(extra.isEmpty ? "" : "," + extra)}
        """
        return try decode(API.HouseholdMember.self, json: json)
    }

    private func permissionsJSON(_ permissions: API.Permissions) throws -> String {
        let data = try APIClient.encoder.encode(permissions)
        return "\"permissions\":" + String(decoding: data, as: UTF8.self)
    }

    private func user(role: API.UserRole, permissions: API.Permissions? = nil) -> User {
        User(id: UUID(), username: "kid", displayName: nil, role: role, libraryOwnerId: UUID(), permissions: permissions)
    }

    // MARK: Decoding

    func testMeFixtureDecodesPermissions() throws {
        let me = try decode(API.Me.self, "me")
        XCTAssertEqual(me.permissions, .all, "The admin has every switch on")
        XCTAssertEqual(me.user.permissions, .all)
        for permission in API.Permission.allCases {
            XCTAssertTrue(me.user.can(permission), permission.rawValue)
        }
        // `/me` decodes as `User` too (ServerSession.refreshUser).
        let asUser = try decode(User.self, "me")
        XCTAssertEqual(asUser.permissions, .all)
        XCTAssertEqual(asUser.autoApproveMovies, true)
    }

    func testHouseholdFixturesDecodePermissions() throws {
        let member = try decode(API.HouseholdMember.self, "household-member")
        let permissions = try XCTUnwrap(member.permissions)
        XCTAssertEqual(permissions, API.Permissions([
            .requestMovies, .requestTv, .request4kMovies, .request4kTv, .autoApproveTv, .autoApprove4kTv, .reportIssues,
        ]))
        XCTAssertEqual(permissions.preset, .custom, "Member plus TV auto-approval is neither preset")
        XCTAssertEqual(member.presetTag, "Custom")

        XCTAssertNotNil(try decode(API.UpdateUserResult.self, "user-update").user.permissions)
        let users = try decode(API.ListResponse<API.HouseholdMember>.self, "users")
        XCTAssertTrue(users.results.allSatisfy { $0.permissions != nil })
        let imported = try decode(API.ImportUsersResult.self, "users-import-result")
        XCTAssertNotNil(imported.created.first?.permissions)
    }

    func testDecodingIgnoresUnknownAndTreatsMissingAsOff() throws {
        let permissions = try decode(
            API.Permissions.self,
            json: #"{"requestMovies":true,"requestTv":false,"reviewRequests":true,"teleport":true,"manageIssues":"yes"}"#
        )
        XCTAssertEqual(permissions, API.Permissions([.requestMovies, .reviewRequests]))
        XCTAssertFalse(permissions[.manageIssues], "A non-boolean value is off")
        XCTAssertFalse(permissions[.bypassLimits], "A missing key is off")
    }

    func testPermissionsEncodeTheFullMap() throws {
        let body = try encodedObject(API.Permissions.memberPreset)
        XCTAssertEqual(body.count, 15)
        XCTAssertEqual(body["requestMovies"] as? Bool, true)
        XCTAssertEqual(body["reviewRequests"] as? Bool, false)
    }

    // MARK: Older servers

    func testLegacyFallbackFromTheRole() throws {
        XCTAssertEqual(API.Permissions.legacy(role: .admin), .all)

        let trusted = API.Permissions.legacy(role: .trusted)
        XCTAssertFalse(trusted[.manageBlocklist], "Trusted never had the blocklist")
        XCTAssertEqual(trusted.granted.count, 14)

        let member = API.Permissions.legacy(role: .member, autoApproveMovies: true, autoApproveTv: false)
        XCTAssertEqual(member, API.Permissions([
            .requestMovies, .requestTv, .request4kMovies, .request4kTv, .reportIssues,
            .autoApproveMovies, .autoApprove4kMovies,
        ]), "4K auto-approval mirrors the non-4K one")
        XCTAssertEqual(API.Permissions.legacy(role: .unknown("guest")), .memberPreset, "An unknown role acts as a member")
    }

    func testOlderServerUserFallsBackToTheRole() throws {
        let json = """
        {"id":"\(Self.memberId)","username":"kid","displayName":null,"role":"member",\
        "libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1","autoApproveMovies":false,"autoApproveTv":true,\
        "createdAt":"2026-09-17T17:10:57.821Z"}
        """
        let me = try decode(API.Me.self, json: json)
        XCTAssertNil(me.permissions)
        let viewer = me.user
        XCTAssertTrue(viewer.can(.requestMovies))
        XCTAssertTrue(viewer.can(.reportIssues))
        XCTAssertTrue(viewer.can(.autoApproveTv))
        XCTAssertTrue(viewer.can(.autoApprove4kTv))
        XCTAssertFalse(viewer.can(.autoApproveMovies))
        XCTAssertFalse(viewer.can(.viewRequests))
        XCTAssertFalse(viewer.can(.manageBlocklist))

        let trusted = user(role: .trusted)
        XCTAssertTrue(trusted.can(.reviewRequests))
        XCTAssertTrue(trusted.can(.manageIssues))
        XCTAssertTrue(trusted.can(.advancedRequests))
        XCTAssertFalse(trusted.can(.manageBlocklist))
        XCTAssertEqual(trusted.roleLabel, "Trusted")

        let admin = user(role: .admin, permissions: API.Permissions())
        XCTAssertTrue(admin.can(.manageBlocklist), "The admin always may, whatever the switches say")
        XCTAssertEqual(admin.roleLabel, "Admin")

        let oldMember = try member(role: "trusted")
        XCTAssertNil(oldMember.permissions)
        XCTAssertEqual(oldMember.presetTag, "Trusted")
        XCTAssertNil(try member(role: "member").presetTag)
        XCTAssertNil(try member(role: "admin").presetTag)
    }

    // MARK: Rules

    func testReviewingBringsSeeing() {
        let permissions = API.Permissions([.reviewRequests])
        XCTAssertFalse(permissions[.viewRequests])
        XCTAssertTrue(permissions.can(.viewRequests))
        XCTAssertTrue(user(role: .member, permissions: permissions).can(.viewRequests))
        XCTAssertFalse(API.Permissions([.viewRequests]).can(.reviewRequests))
    }

    func testPresetDetection() {
        XCTAssertEqual(API.Permissions.memberPreset.preset, .member)
        XCTAssertEqual(API.Permissions.trustedPreset.preset, .trusted)
        XCTAssertEqual(API.Permissions.trustedPreset.granted.count, 14)
        XCTAssertFalse(API.Permissions.trustedPreset[.manageBlocklist])
        XCTAssertEqual(API.Permissions.all.preset, .custom, "Trusted plus the blocklist is Custom")
        XCTAssertEqual(API.Permissions().preset, .custom)

        XCTAssertEqual(user(role: .member, permissions: .trustedPreset).roleLabel, "Trusted")
        XCTAssertEqual(user(role: .member, permissions: .memberPreset).roleLabel, "Member")
        XCTAssertEqual(user(role: .member, permissions: API.Permissions([.requestMovies])).roleLabel, "Custom")
    }

    func testGroupsCoverEverySwitchOnce() {
        let items = API.PermissionGroup.all.flatMap(\.items)
        XCTAssertEqual(items.map(\.permission).sorted { $0.rawValue < $1.rawValue }, API.Permission.allCases.sorted { $0.rawValue < $1.rawValue })
        XCTAssertEqual(API.PermissionGroup.all.map(\.title), ["Requests", "Approved straight away", "Helping run things"])
    }

    // MARK: The member editor

    func testEditorPresetsFillTheSwitches() throws {
        let target = try member(extra: permissionsJSON(.memberPreset))
        var editor = MemberAccessEditor(member: target, viewerIsAdmin: true)
        XCTAssertEqual(editor.mode, .permissions)
        XCTAssertTrue(editor.showsPermissions(isCurrentUser: false))
        XCTAssertFalse(editor.showsLegacyAutoApproval)
        XCTAssertEqual(editor.preset, .member)
        XCTAssertFalse(editor.isPickable(.custom), "Custom isn't pickable while the switches are a preset")
        XCTAssertTrue(editor.isPickable(.trusted))

        editor.pick(.trusted)
        XCTAssertEqual(editor.switches, .trustedPreset)
        XCTAssertEqual(editor.preset, .trusted)

        editor.set(.manageBlocklist, on: true)
        XCTAssertEqual(editor.preset, .custom, "Custom by itself once they match neither preset")
        XCTAssertTrue(editor.isPickable(.custom))

        editor.pick(.custom)
        XCTAssertEqual(editor.preset, .custom, "Picking Custom changes nothing")
        editor.pick(.member)
        XCTAssertEqual(editor.switches, .memberPreset)
    }

    func testEditorReviewLocksSeeing() throws {
        var editor = MemberAccessEditor(member: try member(extra: permissionsJSON(.memberPreset)), viewerIsAdmin: true)
        XCTAssertFalse(editor.isLocked(.viewRequests))
        let viewItem = try XCTUnwrap(API.PermissionGroup.all.flatMap(\.items).first { $0.permission == .viewRequests })
        XCTAssertEqual(editor.description(for: viewItem), "The Requests page lists what everyone has asked for.")

        editor.set(.reviewRequests, on: true)
        XCTAssertTrue(editor.switches[.viewRequests], "Turning Review on turns See on")
        XCTAssertTrue(editor.isLocked(.viewRequests))
        XCTAssertTrue(editor.isOn(.viewRequests))
        XCTAssertEqual(editor.description(for: viewItem), "Comes with reviewing requests.")

        editor.set(.viewRequests, on: false)
        XCTAssertTrue(editor.isOn(.viewRequests), "Locked: can't be turned off while reviewing")

        editor.set(.reviewRequests, on: false)
        XCTAssertFalse(editor.isLocked(.viewRequests))
        XCTAssertTrue(editor.isOn(.viewRequests), "Stays on after Review is turned off")
        editor.set(.viewRequests, on: false)
        XCTAssertFalse(editor.isOn(.viewRequests))
    }

    func testEditorPatchBody() throws {
        let target = try member(extra: permissionsJSON(.memberPreset))
        var editor = MemberAccessEditor(member: target, viewerIsAdmin: true)

        var untouched = API.UpdateUserRequest(username: "kid")
        editor.apply(to: &untouched, isCurrentUser: false)
        XCTAssertEqual(Set(try encodedObject(untouched).keys), ["username"], "Nothing changed: no permissions sent")

        editor.set(.reviewRequests, on: true)
        var request = API.UpdateUserRequest(username: "kid")
        editor.apply(to: &request, isCurrentUser: false)
        let body = try encodedObject(request)
        XCTAssertEqual(Set(body.keys), ["username", "permissions"], "No role or legacy auto-approve alongside")
        let sent = try XCTUnwrap(body["permissions"] as? [String: Bool])
        XCTAssertEqual(sent.count, 15, "The full map")
        XCTAssertEqual(sent["reviewRequests"], true)
        XCTAssertEqual(sent["viewRequests"], true)
        XCTAssertEqual(sent["manageBlocklist"], false)

        var own = API.UpdateUserRequest(username: "kid")
        editor.apply(to: &own, isCurrentUser: true)
        XCTAssertNil(own.permissions, "Never on your own account")

        let notAdmin = MemberAccessEditor(member: target, viewerIsAdmin: false)
        XCTAssertFalse(notAdmin.showsPermissions(isCurrentUser: false))
        var byMember = API.UpdateUserRequest(username: "kid")
        notAdmin.apply(to: &byMember, isCurrentUser: false)
        XCTAssertEqual(Set(try encodedObject(byMember).keys), ["username"])

        let admin = try member(role: "admin", extra: permissionsJSON(.all))
        XCTAssertFalse(MemberAccessEditor(member: admin, viewerIsAdmin: true).showsPermissions(isCurrentUser: false))
    }

    func testEditorOnAnOlderServerSendsRoleAndAutoApproval() throws {
        var editor = MemberAccessEditor(member: try member(role: "member", autoApproveTv: true), viewerIsAdmin: true)
        XCTAssertEqual(editor.mode, .legacy)
        XCTAssertFalse(editor.showsPermissions(isCurrentUser: false))
        XCTAssertTrue(editor.showsLegacyAutoApproval)
        XCTAssertTrue(editor.showsLegacyRole)
        XCTAssertEqual(editor.role, .member)
        XCTAssertTrue(editor.autoApproveTv)

        editor.role = .trusted
        editor.autoApproveMovies = true
        var request = API.UpdateUserRequest(username: "kid")
        editor.apply(to: &request, isCurrentUser: false)
        let body = try encodedObject(request)
        XCTAssertEqual(Set(body.keys), ["username", "role", "autoApproveMovies", "autoApproveTv"])
        XCTAssertEqual(body["role"] as? String, "trusted")
        XCTAssertEqual(body["autoApproveMovies"] as? Bool, true)
        XCTAssertNil(body["permissions"])
    }

    // MARK: Everyone's requests

    func testEveryonesRequestsLeaveOutYoursNewestFirst() throws {
        let pending = try decode(API.PendingRequests.self, "requests-pending").results
        let history = try decode(API.ListResponse<API.ReviewedRequest>.self, "requests-history").results
        let all = EveryoneRequestRow.rows(pending: pending, reviewed: history, excluding: nil)
        XCTAssertEqual(all.count, pending.count + history.count)
        XCTAssertEqual(all.map(\.createdAt), all.map(\.createdAt).sorted(by: >), "Newest first")
        let pendingRow = try XCTUnwrap(all.first { $0.id == pending.first?.id })
        XCTAssertEqual(pendingRow.statusLabel, "Waiting for review")
        XCTAssertEqual(pendingRow.tone, .tracked)
        if let approved = history.first(where: { $0.status == .approved }) {
            XCTAssertEqual(all.first { $0.id == approved.id }?.tone, .owned)
        }

        let mine = try XCTUnwrap(UUID(uuidString: Self.memberId))
        let others = EveryoneRequestRow.rows(pending: pending, reviewed: history, excluding: mine)
        let myCount = pending.filter { $0.requestedBy.userId == mine }.count + history.filter { $0.requestedBy.userId == mine }.count
        XCTAssertGreaterThan(myCount, 0)
        XCTAssertEqual(others.count, all.count - myCount)
    }

    // MARK: Request-time Advanced

    func testRequestBodyWithOverrides() throws {
        let overrides = API.AddOverrides(serverId: "radarr-2", qualityProfileId: 4, rootFolderPath: "/movies", tags: [1], seriesType: nil)
        let body = try encodedObject(API.RequestCreateBody(seasons: nil, is4k: true, overrides: overrides))
        XCTAssertEqual(body["is4k"] as? Bool, true)
        XCTAssertEqual(body["serverId"] as? String, "radarr-2")
        XCTAssertEqual(body["qualityProfileId"] as? Int, 4)
        XCTAssertEqual(body["rootFolderPath"] as? String, "/movies")
        XCTAssertEqual(body["tags"] as? [Int], [1])
        XCTAssertNil(body["seasons"])
        XCTAssertNil(body["seriesType"])
    }
}
