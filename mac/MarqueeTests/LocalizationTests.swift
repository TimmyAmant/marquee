import XCTest
@testable import Marquee

// The Mac and iPhone apps in every language Marquee ships
// (Resources/Localizable.xcstrings, shared by both; docs/i18n-glossary.md):
// each string translated with the same placeholders, every string the code
// uses in the catalog, no English prose slipping past localization, and the
// account's language on /me. Runs in both test targets.

final class LocalizationTests: XCTestCase {
    static let languages = ["es", "fr", "de", "pt-BR"]

    /// mac/ in the source tree.
    private static let macRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()

    private static func catalog() throws -> [String: Any] {
        let url = macRoot.appendingPathComponent("Marquee/Resources/Localizable.xcstrings")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try XCTUnwrap(object as? [String: Any])
    }

    private static func strings() throws -> [String: [String: Any]] {
        try XCTUnwrap(catalog()["strings"] as? [String: [String: Any]])
    }

    // MARK: Catalog

    /// `%@`, `%lld`, `%1$@`… with the position dropped, sorted: what a
    /// translation has to keep.
    static func placeholders(_ text: String) -> [String] {
        let pattern = /%(?:(\d+)\$)?(#@[A-Za-z0-9_]+@|@|lld|ld|lu|llu|d|i|u|f|\.\d+f|lf|s|c|x|%)/
        return text.matches(of: pattern).compactMap { match -> String? in
            let spec = String(match.output.2)
            return spec == "%" ? nil : spec
        }.sorted()
    }

    /// Every text in one localization: a plain unit, or each form of its
    /// plural (top-level or through a `%#@…@` substitution).
    private static func texts(of localization: [String: Any]) -> [String: String] {
        var result: [String: String] = [:]
        if let unit = localization["stringUnit"] as? [String: Any] {
            result["value"] = (unit["state"] as? String) == "translated" ? unit["value"] as? String : nil
            if result["value"] == nil { result["untranslated"] = "" }
        }
        if let plural = (localization["variations"] as? [String: Any])?["plural"] as? [String: [String: Any]] {
            for (form, variation) in plural {
                let unit = variation["stringUnit"] as? [String: Any]
                result["plural." + form] = (unit?["state"] as? String) == "translated" ? unit?["value"] as? String : ""
            }
        }
        if let substitutions = localization["substitutions"] as? [String: [String: Any]] {
            for (name, substitution) in substitutions {
                for (form, text) in texts(of: substitution) {
                    result["\(name).\(form)"] = text
                }
            }
        }
        return result
    }

    func testEveryStringIsTranslatedWithTheSamePlaceholders() throws {
        let strings = try Self.strings()
        XCTAssertGreaterThan(strings.count, 500, "The catalog holds the app's strings")
        var problems: [String] = []
        for (key, entry) in strings.sorted(by: { $0.key < $1.key }) {
            if entry["shouldTranslate"] as? Bool == false { continue }
            let localizations = entry["localizations"] as? [String: [String: Any]] ?? [:]
            let english = localizations["en"].map(Self.texts(of:))
            let englishOther = english?["plural.other"] ?? english?["value"] ?? key
            let expected = Self.placeholders(englishOther)
            for language in Self.languages {
                guard let localization = localizations[language] else {
                    problems.append("\(language) missing: \(key)")
                    continue
                }
                let texts = Self.texts(of: localization)
                if texts.isEmpty || texts.values.contains(where: \.isEmpty) {
                    problems.append("\(language) untranslated: \(key)")
                    continue
                }
                if let value = texts["value"], !value.contains("%#@") {
                    if Self.placeholders(value) != expected {
                        problems.append("\(language) placeholders differ: \(key) → \(value)")
                    }
                }
                if let other = texts["plural.other"], Self.placeholders(other) != expected {
                    problems.append("\(language) plural placeholders differ: \(key) → \(other)")
                }
            }
        }
        XCTAssertEqual(problems, [], "\(problems.count) catalog problems")
    }

    /// What the catalog marks as the iPhone app's alone (its own screens, and
    /// the iPhone wording of `PlatformText`): the Mac never looks these up.
    static let iPhoneOnlyComment = "Marquee for iPhone only."

    /// The compiler's own list of what the app looks up (`SWIFT_EMIT_LOC_STRINGS`
    /// writes a .stringsdata beside every object file) against the catalog:
    /// nothing missing, nothing left over. The Mac uses every entry but the
    /// iPhone-only ones; the iPhone app uses every iPhone-only one.
    func testCatalogHoldsEveryStringTheCodeUses() throws {
        let strings = try Self.strings()
        let objects = try XCTUnwrap(Self.appObjectsDirectory(), "No .stringsdata found for the app target")
        var used = Set<String>()
        let files = try FileManager.default.contentsOfDirectory(at: objects, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "stringsdata" }
        XCTAssertGreaterThan(files.count, 50)
        for file in files {
            let object = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
            let tables = object?["tables"] as? [String: [[String: Any]]] ?? [:]
            for entry in tables["Localizable"] ?? [] {
                if let key = entry["key"] as? String { used.insert(key) }
            }
        }
        let missing = used.subtracting(strings.keys).sorted()
        let iPhoneOnly = Set(strings.filter { ($0.value["comment"] as? String) == Self.iPhoneOnlyComment }.keys)
        XCTAssertEqual(missing, [], "In the code but not in Localizable.xcstrings — run Scripts/sync-strings.sh and translate them")
        #if os(macOS)
        let unused = Set(strings.keys).subtracting(used).subtracting(iPhoneOnly).sorted()
        XCTAssertEqual(unused, [], "In Localizable.xcstrings but no longer in the code")
        XCTAssertEqual(used.intersection(iPhoneOnly).sorted(), [], "Marked \"\(Self.iPhoneOnlyComment)\" but the Mac app uses it")
        #else
        let unused = iPhoneOnly.subtracting(used).sorted()
        XCTAssertEqual(unused, [], "Marked \"\(Self.iPhoneOnlyComment)\" but the iPhone app no longer uses it")
        #endif
    }

    /// Build/Products/Debug/Marquee.app/Contents/PlugIns/MarqueeTests.xctest →
    /// Build/Intermediates.noindex/Marquee.build/Debug/Marquee.build/Objects-normal/<arch>
    /// (…/Debug-iphonesimulator/Marquee iOS.build/… for the iPhone app).
    private static func appObjectsDirectory() -> URL? {
        #if os(iOS)
        // The test bundle runs from inside the simulator's app container, so
        // the build folder is found from the source tree instead: the
        // derived data path CI and mac/README.md use.
        let objects = macRoot.appendingPathComponent(
            "build/DerivedDataiOS/Build/Intermediates.noindex/Marquee.build/Debug-iphonesimulator/\(appTargetBuildFolder)/Objects-normal"
        )
        #if arch(arm64)
        let simulatorArch = "arm64"
        #else
        let simulatorArch = "x86_64"
        #endif
        let simulatorDirectory = objects.appendingPathComponent(simulatorArch)
        return FileManager.default.fileExists(atPath: simulatorDirectory.path) ? simulatorDirectory : nil
        #else
        var url = Bundle(for: LocalizationTests.self).bundleURL
        while url.pathComponents.count > 1, url.lastPathComponent != "Products" {
            url = url.deletingLastPathComponent()
        }
        guard url.lastPathComponent == "Products" else { return nil }
        let configuration = Bundle(for: LocalizationTests.self).bundleURL.pathComponents
            .dropFirst(url.pathComponents.count).first ?? "Debug"
        let objectsNormal = url.deletingLastPathComponent()
            .appendingPathComponent("Intermediates.noindex/Marquee.build/\(configuration)/\(appTargetBuildFolder)/Objects-normal")
        #if arch(arm64)
        let arch = "arm64"
        #else
        let arch = "x86_64"
        #endif
        let directory = objectsNormal.appendingPathComponent(arch)
        return FileManager.default.fileExists(atPath: directory.path) ? directory : nil
        #endif
    }

    #if os(macOS)
    private static let appTargetBuildFolder = "Marquee.build"
    #else
    private static let appTargetBuildFolder = "Marquee iOS.build"
    #endif

    func testTheAppShipsEveryLanguage() {
        let localizations = Set(Bundle.main.localizations)
        for language in ["en"] + Self.languages {
            XCTAssertTrue(localizations.contains(language), "Marquee.app has \(language).lproj")
        }
        XCTAssertEqual(Set(AppLanguage.allCases.map(\.rawValue)), Set(["en"] + Self.languages))
    }

    /// A string as one language's .lproj in the built app says it, plurals included.
    private static func format(_ key: String, in language: String, _ arguments: any CVarArg...) throws -> String {
        let path = try XCTUnwrap(Bundle.main.path(forResource: language, ofType: "lproj"))
        let bundle = try XCTUnwrap(Bundle(path: path))
        let format = bundle.localizedString(forKey: key, value: "MISSING", table: nil)
        return String(format: format, locale: Locale(identifier: language), arguments: arguments)
    }

    func testTranslationsAndPluralsResolveInTheBuiltApp() throws {
        XCTAssertEqual(try Self.format("Settings", in: "de"), "Einstellungen")
        XCTAssertEqual(try Self.format("Requests", in: "fr"), "Demandes")
        XCTAssertEqual(try Self.format("%lld titles", in: "en", 1), "1 title")
        XCTAssertEqual(try Self.format("%lld titles", in: "en", 3), "3 titles")
        XCTAssertEqual(try Self.format("%lld titles", in: "es", 1), "1 título")
        XCTAssertEqual(try Self.format("%lld titles", in: "pt-BR", 2), "2 títulos")
        // Several arguments: the count picks the form, the others still fill in.
        let one = try Self.format("%@ (+%lld more)", in: "en", "Dune", 1)
        let more = try Self.format("%@ (+%lld more)", in: "en", "Dune", 4)
        XCTAssertEqual(one, "Dune (+1 more)")
        XCTAssertEqual(more, "Dune (+4 more)")
        let spanish = try Self.format("%@ (+%lld more)", in: "es", "Dune", 4)
        XCTAssertTrue(spanish.hasPrefix("Dune") && spanish.contains("4"), spanish)
    }

    func testPlaceholders() {
        XCTAssertEqual(Self.placeholders("%1$@ has %2$lld of %%"), ["@", "lld"])
        XCTAssertEqual(Self.placeholders("%lld de %@"), Self.placeholders("%@: %lld"))
    }

    // MARK: Untranslated text in the code

    func testNoEnglishProseEscapesLocalization() throws {
        var findings: [String] = []
        // The shared sources and the iPhone app's own.
        for folder in ["Marquee", "MarqueeiOS"] {
            let source = Self.macRoot.appendingPathComponent(folder)
            let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: source, includingPropertiesForKeys: nil))
            for case let file as URL in enumerator where file.pathExtension == "swift" {
                let text = try String(contentsOf: file, encoding: .utf8)
                for finding in UntranslatedTextLint.scan(text) {
                    findings.append("\(file.lastPathComponent):\(finding.line): \"\(finding.text)\"")
                }
            }
        }
        XCTAssertEqual(findings, [], """
            English text shown as a plain String: wrap it in String(localized:) (or pass the literal \
            straight to Text/Button/Label…), or mark a real exception with // i18n-ignore
            """)
    }

    func testTheLintCatchesPlainStrings() {
        let flagged = UntranslatedTextLint.scan(#"""
            let a = Text("Fine here")
            let b = String(localized: "Fine too")
            let c = EmptyStateView(title: "Not localized")
            let d = Text(verbatim: "Also not")
            let e = "Plex"
            let f = "marquee.server.baseURL"
            let g = InlineMessage(text: "Ignored") // i18n-ignore
            let h = Text(flag ? "Yes" : "No")
            let i = hint("Saved")
            """#).map(\.text)
        XCTAssertEqual(flagged, ["Not localized", "Also not", "Saved"])
    }

    // MARK: The account's language

    func testMeDecodesTheLanguage() throws {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/me.json")
        let data = try Data(contentsOf: url)
        XCTAssertEqual(try APIClient.decoder.decode(API.Me.self, from: data).language, "fr")
        let user = try APIClient.decoder.decode(User.self, from: data)
        XCTAssertEqual(user.language, "fr")
        XCTAssertTrue(user.sendsLanguage)

        // null follows the Mac; an older server sends nothing (no picker).
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        object["language"] = NSNull()
        let automatic = try APIClient.decoder.decode(User.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(automatic.language)
        XCTAssertTrue(automatic.sendsLanguage)
        object.removeValue(forKey: "language")
        let older = try APIClient.decoder.decode(User.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(older.language)
        XCTAssertFalse(older.sendsLanguage)
    }

    func testPatchMeSendsTheLanguageOrNull() throws {
        let french = try String(decoding: APIClient.encoder.encode(MeLanguageUpdate(language: "fr")), as: UTF8.self)
        XCTAssertEqual(french, #"{"language":"fr"}"#)
        let automatic = try String(decoding: APIClient.encoder.encode(MeLanguageUpdate(language: nil)), as: UTF8.self)
        XCTAssertEqual(automatic, #"{"language":null}"#, "null is sent, not left out")
    }

    func testLanguageCodes() {
        XCTAssertEqual(AppLanguage(code: "pt-br"), .portugueseBrazil)
        XCTAssertEqual(AppLanguage(code: "pt_BR"), .portugueseBrazil)
        XCTAssertEqual(AppLanguage(code: "DE"), .german)
        XCTAssertNil(AppLanguage(code: "it"))
        XCTAssertNil(AppLanguage(code: nil))
        XCTAssertEqual(AppLanguage.current, .english, "The tests run with -AppleLanguages (en)")
        XCTAssertEqual(AppLanguage.acceptLanguageHeader, "en")
    }

    func testAccountLanguageBecomesTheAppsAndAutomaticUndoesOnlyThat() throws {
        let suite = "LocalizationTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        // What's saved in the domain (the test run's own -AppleLanguages
        // argument outranks it when read through `array(forKey:)`).
        func saved() -> [String]? {
            defaults.persistentDomain(forName: suite)?[AppLanguage.appleLanguagesKey] as? [String]
        }
        func adopt(_ code: String?) -> AppLanguage? {
            AppLanguage.adoptAccountPreference(code, defaults: defaults, domain: suite)
        }

        XCTAssertEqual(adopt("fr"), .french)
        XCTAssertEqual(saved(), ["fr"])
        XCTAssertEqual(adopt("pt-BR"), .portugueseBrazil)
        XCTAssertEqual(saved(), ["pt-BR"])

        XCTAssertNil(adopt(nil))
        XCTAssertNil(saved())

        // A language picked in System Settings (not by Marquee) stays.
        defaults.set(["de"], forKey: AppLanguage.appleLanguagesKey)
        XCTAssertNil(adopt(nil))
        XCTAssertEqual(saved(), ["de"])
    }

    func testRequestsSendAcceptLanguage() async throws {
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, Data(#"{"ok":true}"#.utf8)) }
        defer {
            StubURLProtocol.handler = nil
            StubURLProtocol.requests = []
        }
        StubURLProtocol.requests = []
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let _: OKResponse = try await client.get("/health")
        XCTAssertEqual(StubURLProtocol.requests.first?.value(forHTTPHeaderField: "Accept-Language"), "en")
    }
}

/// A heuristic for English prose that never reaches localization: a string
/// literal with words in it that isn't the title argument of a SwiftUI API
/// (`Text`, `Button`, `Label`, `.help`…, which take a LocalizedStringKey) or
/// inside `String(localized:)`. Brand names alone, identifiers, keys, paths,
/// SF Symbol names and log messages pass; `// i18n-ignore` on the literal's
/// line marks a deliberate exception. `#Preview` blocks at the end of a file
/// are skipped.
enum UntranslatedTextLint {
    struct Finding: Equatable {
        let line: Int
        let text: String
    }

    static let localizingCalls: Set<String> = [
        "Text", "Button", "Label", "Toggle", "help", "navigationTitle", "navigationSubtitle", "Section",
        "Picker", "TextField", "SecureField", "Menu", "Link", "alert", "confirmationDialog",
        "ContentUnavailableView", "LabeledContent", "Stepper", "accessibilityLabel", "accessibilityHint",
        "accessibilityValue", "GroupBox", "DisclosureGroup", "ProgressView", "badge", "CommandMenu",
        "CommandGroup", "Tab", "Window", "WindowGroup", "Settings", "TextEditor", "DatePicker", "ShareLink",
        "MenuBarExtra", "TableColumn", "Slider", "Gauge", "ColorPicker", "searchable", "Group",
    ]
    static let ignoredCalls: Set<String> = [
        "setValue", "print", "fatalError", "precondition", "preconditionFailure", "assert",
        "assertionFailure", "debug", "info", "notice", "error", "warning", "fault", "trace", "log",
        "Logger", "os_log", "NSLog", "dump", "XCTFail",
    ]
    static let brands = [
        "Marquee", "Plex", "Jellyfin", "Emby", "Sonarr", "Radarr", "TMDb", "TheTVDB", "TVDB", "IMDb",
        "Trakt", "Discord", "Telegram", "Pushover", "ntfy", "Gotify", "Slack", "Homepage", "Homarr",
        "Organizr", "Unraid", "GitHub", "OpenAPI", "Plex Watchlist", "Quick Connect", "Dolby Vision",
        "HDR", "HDR10", "HDR10+", "HLG", "4K", "SSO", "OIDC", "API", "URL", "JSON", "macOS", "Mac",
        "Apple", "Google", "Authentik", "Authelia", "Keycloak", "Webhook", "Email", "SMTP", "Atmos", "DTS", "TrueHD", "DV", "SDR", "AAC",
        "AC3", "EAC3", "FLAC", "Opus", "MP3", "HEVC", "AV1", "H.264",
    ]

    private struct Literal {
        let start: Int
        let text: String
    }

    static func scan(_ source: String) -> [Finding] {
        var chars = Array(source)
        if let preview = source.range(of: "#Preview") {
            chars = Array(source[..<preview.lowerBound])
        }
        let lines = String(chars).components(separatedBy: "\n")
        var findings: [Finding] = []
        for literal in literals(in: chars) where isProse(literal.text) {
            let line = chars[..<literal.start].reduce(1) { $1 == "\n" ? $0 + 1 : $0 }
            if lines[line - 1].contains("i18n-ignore") { continue }
            if line >= 2, lines[line - 2].contains("i18n-ignore-next") { continue }
            if isLocalized(chars, at: literal.start) { continue }
            findings.append(Finding(line: line, text: literal.text))
        }
        return findings
    }

    /// Outer string literals ("…", """…""", #"…"#), interpolations as `%@`.
    private static func literals(in chars: [Character]) -> [Literal] {
        var result: [Literal] = []
        var index = 0
        let count = chars.count
        func has(_ string: String, at position: Int) -> Bool {
            let pattern = Array(string)
            guard position + pattern.count <= count else { return false }
            return Array(chars[position..<position + pattern.count]) == pattern
        }
        while index < count {
            if has("//", at: index) {
                while index < count, chars[index] != "\n" { index += 1 }
                continue
            }
            if has("/*", at: index) {
                index += 2
                while index < count, !has("*/", at: index) { index += 1 }
                index += 2
                continue
            }
            guard chars[index] == "\"" || chars[index] == "#" else { index += 1; continue }
            var hashes = 0
            var probe = index
            while probe < count, chars[probe] == "#" { hashes += 1; probe += 1 }
            guard probe < count, chars[probe] == "\"" else { index = probe + (hashes == 0 ? 1 : 0); continue }
            let multiline = has("\"\"\"", at: probe)
            let start = index
            index = probe + (multiline ? 3 : 1)
            let close = (multiline ? "\"\"\"" : "\"") + String(repeating: "#", count: hashes)
            var text = ""
            while index < count {
                if has(close, at: index) { index += close.count; break }
                if chars[index] == "\\", has("\\" + String(repeating: "#", count: hashes) + "(", at: index) {
                    index += hashes + 2
                    var depth = 1
                    text += "%@"
                    while index < count, depth > 0 {
                        if chars[index] == "\"" {
                            index += 1
                            while index < count, chars[index] != "\"" { index += chars[index] == "\\" ? 2 : 1 }
                            index += 1
                            continue
                        }
                        if chars[index] == "(" { depth += 1 } else if chars[index] == ")" { depth -= 1 }
                        index += 1
                    }
                    continue
                }
                if chars[index] == "\\", hashes == 0 {
                    index += 2
                    text += " "
                    continue
                }
                if !multiline, chars[index] == "\n" { break }
                text.append(chars[index])
                index += 1
            }
            result.append(Literal(start: start, text: text))
        }
        return result
    }

    static func isProse(_ literal: String) -> Bool {
        let text = literal.replacing(/%(\d+\$)?(@|lld|ld|d|f|\.\d+f|s|%)/, with: " ")
        if text.contains("://") || text.hasPrefix("/") || text.hasPrefix(".") { return false }
        let word = /[A-Za-zÀ-ÿ']{2,}/
        guard text.contains(word) else { return false }
        var rest = text
        for brand in brands.sorted(by: { $0.count > $1.count }) {
            rest = rest.replacingOccurrences(of: brand, with: " ")
        }
        guard rest.contains(word) else { return false }
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if !trimmed.contains(" ") {
            // One token: identifiers, keys, symbols, headers and codes pass;
            // a capitalized word ("Cancel", "Movies…") is prose.
            let bare = trimmed.trimmingCharacters(in: CharacterSet(charactersIn: " .,:;…!?()"))
            return bare.wholeMatch(of: /[A-Z][a-zà-ÿ]+(['’][a-z]+)?/) != nil
        }
        return true
    }

    /// Whether the literal at `position` is looked up: the title argument of
    /// a localizing call, or `String(localized:)`.
    private static func isLocalized(_ chars: [Character], at position: Int) -> Bool {
        var depth = 0
        var index = position - 1
        while index >= 0 {
            let char = chars[index]
            if char == ")" || char == "]" {
                depth += 1
            } else if char == "(" || char == "[" {
                if depth == 0 {
                    guard char == "(" else { return false }
                    var end = index - 1
                    while end >= 0, chars[end] == " " || chars[end] == "\t" { end -= 1 }
                    var begin = end
                    while begin >= 0, chars[begin].isLetter || chars[begin].isNumber || chars[begin] == "_" { begin -= 1 }
                    let name = begin < end ? String(chars[(begin + 1)...end]) : ""
                    let label = argumentLabel(String(chars[(index + 1)..<position]))
                    if ignoredCalls.contains(name) { return true }
                    if name == "String" || name == "AttributedString" { return label == "localized" || label == "comment" }
                    if ["LocalizedStringResource", "LocalizedStringKey", "NSLocalizedString"].contains(name) {
                        return label == nil || label == "defaultValue"
                    }
                    return localizingCalls.contains(name)
                        && [nil, "titleKey", "prompt", "placeholder", "label", "message", "title"].contains(label)
                }
                depth -= 1
            } else if char == "{", depth == 0 {
                return false
            } else if char == "}" {
                var braces = 1
                index -= 1
                while index >= 0, braces > 0 {
                    if chars[index] == "}" { braces += 1 } else if chars[index] == "{" { braces -= 1 }
                    index -= 1
                }
                continue
            }
            index -= 1
        }
        return false
    }

    /// The label of the argument being written at the end of `arguments`.
    private static func argumentLabel(_ arguments: String) -> String? {
        var depth = 0
        var current = Substring(arguments)
        var index = arguments.startIndex
        while index < arguments.endIndex {
            let char = arguments[index]
            if "([{".contains(char) { depth += 1 } else if ")]}".contains(char) { depth -= 1 }
            if char == ",", depth == 0 { current = arguments[arguments.index(after: index)...] }
            index = arguments.index(after: index)
        }
        guard let match = current.prefixMatch(of: /\s*([A-Za-z_]+)\s*:(?!:)/) else { return nil }
        return String(match.output.1)
    }
}
