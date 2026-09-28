import SwiftUI

/// app/settings/blocklist-settings.tsx — Settings › Blocklist: what nobody may request. Titles are blocked from their page;
/// keywords and genres here. A server older than 0.41 answers 404, and then
/// the whole section stays hidden.
struct BlocklistSettingsSection: View {
    @Environment(AppModel.self) private var model

    @State private var entries: [API.BlocklistEntry]?
    @State private var unsupported = false
    @State private var loadError: String?
    @State private var removingIds: Set<String> = []
    @State private var listError: String?

    @State private var ruleKind: RuleKind = .keyword
    @State private var keyword = ""
    @State private var region = Locale.current.region?.identifier ?? "US"
    @State private var certification = ""
    @State private var reason = ""
    @State private var blocking = false
    @State private var previewing = false
    @State private var preview: API.BlockPreview?
    @State private var formError: String?

    /// "Block by" (0.58+ for the last two; an older server only takes keywords).
    enum RuleKind: String, CaseIterable, Identifiable {
        case keyword, certification, adult
        var id: String { rawValue }
        var title: String {
            switch self {
            case .keyword: return String(localized: "Keyword or genre")
            case .certification: return String(localized: "Age rating")
            case .adult: return String(localized: "Adult content")
            }
        }
    }

    /// Common ratings offered while typing one (any can be typed).
    private static let ratingSuggestions = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA", "12", "16", "18"]

    /// The countries TMDb lists ratings for, as the website offers them.
    private static let regions = [
        "AR", "AT", "AU", "BE", "BR", "CA", "CH", "CL", "CO", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
        "GB", "GR", "HK", "HU", "ID", "IE", "IL", "IN", "IT", "JP", "KR", "LT", "LV", "MX", "MY", "NL",
        "NO", "NZ", "PE", "PH", "PL", "PT", "RO", "RU", "SE", "SG", "TH", "TR", "TW", "US", "VE", "ZA",
    ]

    var body: some View {
        if !unsupported {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    list
                    Divider().overlay(Theme.border)
                    form
                        .padding(18)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface(padding: 0)

                if let listError { InlineMessage(text: listError) }
            }
            .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .settings))) {
                await load()
            }
        }
    }

    @ViewBuilder
    private var list: some View {
        if let entries {
            if entries.isEmpty {
                Text("Nothing blocked. Block a title from its page, or a keyword below.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
            } else {
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { Divider().overlay(Theme.border) }
                    row(entry)
                }
            }
        } else if let loadError {
            InlineMessage(text: loadError)
                .padding(18)
        } else {
            ProgressView()
                .controlSize(.small)
                .padding(18)
        }
    }

    private func row(_ entry: API.BlocklistEntry) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if let titleID = entry.titleID {
                    Button(entry.label) {
                        model.openTitle(titleID)
                        model.showMainWindow()
                    }
                    .buttonStyle(QuietButtonStyle(color: Theme.textPrimary))
                    .font(.system(size: 13.5))
                } else if entry.kind == .keyword {
                    Text("Keyword: \(Text(entry.keyword ?? "").fontWeight(.medium))")
                        .foregroundStyle(Theme.textPrimary)
                        .font(.system(size: 13.5))
                } else {
                    Text(entry.label)
                        .foregroundStyle(Theme.textPrimary)
                        .font(.system(size: 13.5))
                }
                if let reason = entry.reason.nonBlank {
                    Text(reason)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            }
            Spacer()
            Button(removingIds.contains(entry.id) ? "Removing…" : "Remove") { remove(entry) }
                .buttonStyle(QuietButtonStyle(color: Theme.danger))
                .font(.system(size: 12))
                .disabled(removingIds.contains(entry.id))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Block automatically")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text("Every title that matches can't be requested — you can still add it yourself. Preview shows what it would catch among the titles Marquee has looked up.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Picker("Block by", selection: $ruleKind) {
                ForEach(RuleKind.allCases) { kind in
                    Text(kind.title).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: ruleKind) { _, _ in preview = nil }

            switch ruleKind {
            case .keyword:
                VStack(alignment: .leading, spacing: 5) {
                    SettingsField(label: String(localized: "Block a keyword or genre"), text: $keyword, placeholder: String(localized: "e.g. anime, reality, horror"))
                    Text("Any title with this TMDb keyword or genre can't be requested (you can still add it yourself).")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            case .certification:
                HStack(alignment: .bottom, spacing: 12) {
                    Picker("Country", selection: $region) {
                        ForEach(Self.regions, id: \.self) { code in
                            Text(Locale.current.localizedString(forRegionCode: code) ?? code).tag(code)
                        }
                    }
                    .frame(maxWidth: 260)
                    SettingsField(label: String(localized: "Rating"), text: $certification, placeholder: "NC-17") // i18n-ignore: a rating
                }
                HStack(spacing: 6) {
                    ForEach(Self.ratingSuggestions, id: \.self) { rating in
                        Button(rating) { certification = rating }
                            .buttonStyle(QuietButtonStyle())
                            .font(.system(size: 11.5))
                    }
                }
                Text("As TMDb lists it for that country: NC-17, TV-MA, 18…")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
            case .adult:
                Text(adultBlocked ? String(localized: "Already blocked — remove it from the list above to allow it again.") : String(localized: "Everything TMDb marks as adult."))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
            }
            SettingsField(label: String(localized: "Reason (optional, shown to whoever asks)"), text: $reason)
                .onChange(of: reason) { _, value in
                    if value.count > API.BlockTitleRequest.maxReasonLength {
                        reason = String(value.prefix(API.BlockTitleRequest.maxReasonLength))
                    }
                }
            if let preview { previewView(preview) }
            if let formError { InlineMessage(text: formError) }
            HStack(spacing: 10) {
                Button(blocking ? "Blocking…" : "Block") { block() }
                    .buttonStyle(AccentButtonStyle())
                    .disabled(blocking || !ready)
                Button(previewing ? "Looking…" : "Preview") { runPreview() }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(previewing || !ready)
            }
        }
    }

    private var adultBlocked: Bool { entries?.contains { $0.kind == .adult } == true }

    private var ready: Bool {
        switch ruleKind {
        case .keyword: return keyword.nonBlank != nil
        case .certification: return certification.nonBlank != nil
        case .adult: return !adultBlocked
        }
    }

    private var rule: API.BlockRuleBody {
        var body = API.BlockRuleBody(kind: ruleKind.rawValue)
        switch ruleKind {
        case .keyword: body.keyword = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        case .certification:
            body.region = region
            body.certification = certification.trimmingCharacters(in: .whitespacesAndNewlines)
        case .adult: break
        }
        body.reason = reason.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines)
        return body
    }

    private func previewView(_ preview: API.BlockPreview) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(preview.matched == 0
                ? String(localized: "Nothing among the \(preview.scanned) titles Marquee has looked up.")
                : String(localized: "Would block \(preview.matched) of the \(preview.scanned) titles Marquee has looked up."))
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(Theme.textPrimary)
            if !preview.titles.isEmpty {
                Text(preview.titles.map(\.label).formatted(.list(type: .and)))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !preview.pendingRequests.isEmpty {
                Text("Requests waiting for review for these: \(preview.pendingRequests.count)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.unmonitored)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.bg0))
    }

    private func runPreview() {
        guard ready, !previewing else { return }
        formError = nil
        previewing = true
        let api = model.api
        let rule = rule
        Task {
            do {
                preview = try await api.blocklist.preview(rule)
            } catch APIError.notFound {
                formError = String(localized: "This server can only block keywords and genres. Update it to preview or block by rating.")
            } catch {
                formError = error.localizedDescription
            }
            previewing = false
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.blocklist.list()
            if Task.isCancelled { return }
            entries = fresh
            loadError = nil
        } catch APIError.notFound {
            unsupported = true
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if entries == nil { loadError = error.localizedDescription }
        }
    }

    private func block() {
        guard ready, !blocking else { return }
        formError = nil
        blocking = true
        let api = model.api
        let rule = rule
        let kind = ruleKind
        Task {
            do {
                if kind == .keyword {
                    // Without a kind, so an older server takes it too.
                    try await api.blocklist.blockKeyword(rule.keyword ?? "", reason: rule.reason)
                } else {
                    try await api.blocklist.block(rule)
                }
                self.keyword = ""
                self.certification = ""
                self.reason = ""
                self.preview = nil
            } catch {
                formError = error.localizedDescription
            }
            blocking = false
        }
    }

    private func remove(_ entry: API.BlocklistEntry) {
        removingIds.insert(entry.id)
        listError = nil
        let api = model.api
        Task {
            do {
                try await api.blocklist.remove(entry.id)
                entries?.removeAll { $0.id == entry.id }
            } catch {
                listError = error.localizedDescription
            }
            removingIds.remove(entry.id)
        }
    }
}
