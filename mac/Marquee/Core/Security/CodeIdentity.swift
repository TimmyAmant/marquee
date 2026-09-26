import Foundation
import Security

/// Who this build of Marquee is to macOS: its designated requirement, the
/// rule a login-keychain item's access list checks. For an ad-hoc signed
/// build (what CI makes) it's `cdhash H"…"`, different for every build; a
/// Developer ID signature would make it the same across updates.
enum CodeIdentity {
    static let current: String? = {
        var code: SecCode?
        guard SecCodeCopySelf(SecCSFlags(), &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, SecCSFlags(), &staticCode) == errSecSuccess, let staticCode else { return nil }
        var requirement: SecRequirement?
        guard SecCodeCopyDesignatedRequirement(staticCode, SecCSFlags(), &requirement) == errSecSuccess, let requirement else {
            return nil
        }
        var text: CFString?
        guard SecRequirementCopyString(requirement, SecCSFlags(), &text) == errSecSuccess else { return nil }
        return text as String?
    }()
}
