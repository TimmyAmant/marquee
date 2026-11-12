import SwiftUI
import WebKit

/// components/season-episode-list.tsx — the server sends the seasons newest
/// first with their Sonarr counts; episodes load per expanded row.
struct SeasonAccordion: View {
    let screen: TitleDetailModel
    let seasons: [API.TitleDetail.SeasonSummary]

    @State private var openSeason: Int?

    private struct EpisodeLoadKey: Hashable {
        let season: Int?
        let generation: Int
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(seasons.enumerated()), id: \.element.seasonNumber) { index, season in
                if index > 0 { Divider().overlay(Theme.border) }
                seasonRow(season)
            }
        }
        .background(Theme.bg1)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
        // Loads the open row's episodes, and re-loads them after a full page
        // reload dropped the cached ones.
        .task(id: EpisodeLoadKey(season: openSeason, generation: screen.reloadGeneration)) {
            if let openSeason { screen.loadSeason(openSeason) }
        }
    }

    @ViewBuilder
    private func seasonRow(_ season: API.TitleDetail.SeasonSummary) -> some View {
        let isOpen = openSeason == season.seasonNumber

        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                openSeason = isOpen ? nil : season.seasonNumber
            }
        } label: {
            HStack {
                Text(season.name)
                    .font(.system(size: Metrics.text(14), weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                if let label = season.completenessLabel {
                    TonePill(text: label, tone: season.isComplete ? .owned : .info, small: true)
                }
                Image(systemName: "chevron.down")
                    .font(.system(size: Metrics.text(11), weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        if isOpen {
            Group {
                if let error = screen.seasonErrors[season.seasonNumber] {
                    InlineMessage(text: error)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                } else if let loaded = screen.episodes[season.seasonNumber] {
                    EpisodeList(season: loaded)
                } else {
                    Text(screen.loadingSeasons.contains(season.seasonNumber) ? "Loading…" : "No episode data for this season.")
                        .font(.system(size: Metrics.text(12.5)))
                        .foregroundStyle(Theme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                }
            }
            .background(Theme.bg0.opacity(0.4))
        }
    }
}

private struct EpisodeList: View {
    let season: API.SeasonEpisodes

    var body: some View {
        if season.episodes.isEmpty {
            Text("No episode data for this season.")
                .font(.system(size: Metrics.text(12.5)))
                .foregroundStyle(Theme.textMuted)
                .padding(18)
        } else {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(season.episodes) { episode in
                    HStack(alignment: .top, spacing: 14) {
                        ZStack {
                            Theme.bg2
                            if episode.stillPath.url(.w342) != nil {
                                RemoteImage(episode.stillPath, size: .w342)
                            }
                        }
                        .frame(width: 128, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 6))

                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(episode.episodeNumber). \(episode.name)")
                                    .font(.system(size: Metrics.text(13), weight: .medium))
                                    .foregroundStyle(Theme.textPrimary)
                                Spacer(minLength: 8)
                                if let hasFile = episode.hasFile {
                                    TonePill(text: hasFile ? String(localized: "Have it") : String(localized: "Missing"), tone: hasFile ? .owned : .neutral, small: true)
                                }
                            }
                            HStack(spacing: 8) {
                                Text(episode.code(season: season.seasonNumber))
                                if let airDate = episode.airDate {
                                    Text(airDate.mediumLabel)
                                }
                            }
                            .font(.system(size: Metrics.text(11.5)))
                            .foregroundStyle(Theme.textMuted)
                            if let overview = episode.shortOverview {
                                Text(overview)
                                    .font(.system(size: Metrics.text(12)))
                                    .foregroundStyle(Theme.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
            .padding(18)
        }
    }
}

// MARK: - Trailer (components/trailer-button.tsx)

struct TrailerSheet: View {
    let videoKey: String
    let title: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .font(.marqueeDisplay(17))
                Spacer()
                if let url = YouTubeTrailer.watchURL(videoKey) {
                    Button("Open on YouTube") { openURL(url) }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
                Button("Done") { dismiss() }
                    .buttonStyle(AccentButtonStyle(compact: true))
                    .keyboardShortcut(.cancelAction)
            }
            .padding(14)
            YouTubePlayer(videoKey: videoKey)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .background(Color.black)
        }
        .sheetWidth(960, alignment: .center)
        .background(Theme.bg1)
    }
}

#if os(macOS)
private struct YouTubePlayer: NSViewRepresentable {
    let videoKey: String

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.setValue(false, forKey: "drawsBackground")
        load(into: view)
        return view
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    static func dismantleNSView(_ nsView: WKWebView, coordinator: ()) {
        nsView.loadHTMLString("", baseURL: nil)
    }
}
#else
private struct YouTubePlayer: UIViewRepresentable {
    let videoKey: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        load(into: view)
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: ()) {
        uiView.loadHTMLString("", baseURL: nil)
    }
}
#endif

extension YouTubePlayer {
    fileprivate func load(into view: WKWebView) {
        // Only a key shaped like YouTube's goes into the page; anything else
        // leaves the player blank.
        guard let embed = YouTubeTrailer.embedURL(videoKey) else { return }
        // YouTube's embed player needs a real https origin + referrer policy.
        // i18n-ignore-next
        let html = """
        <!doctype html><html><head><meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
        <body><iframe src="\(embed.absoluteString)"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></body></html>
        """
        view.loadHTMLString(html, baseURL: URL(string: "https://marquee.local"))
    }
}

// MARK: - Relink (components/relink-title-form.tsx)

struct RelinkTitleSheet: View {
    let mediaType: API.MediaType
    /// Runs `POST …/relink` and navigates to the id it returns.
    let onSubmit: @MainActor (API.RelinkTarget) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var tmdbId = ""
    @State private var imdbId = ""
    @State private var tvdbId = ""
    @State private var pending = false
    @State private var error: String?

    /// The server checks tmdbId, then imdbId, then tvdbId (TV only).
    private var target: API.RelinkTarget? {
        if let value = Int(tmdbId.trimmingCharacters(in: .whitespaces)) { return .tmdb(value) }
        if let value = imdbId.nonBlank { return .imdb(value.trimmingCharacters(in: .whitespaces)) }
        if mediaType == .tv, let value = Int(tvdbId.trimmingCharacters(in: .whitespaces)) { return .tvdb(value) }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Fix this title's match")
                .font(.marqueeDisplay(22))
            Text("Fill in whichever id you have — this repoints your synced library to the correct title without needing to fix the match in Plex/Jellyfin/Sonarr itself.")
                .font(.system(size: Metrics.text(12.5)))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Form {
                TextField("TMDb ID", text: $tmdbId)
                TextField("IMDb ID (tt…)", text: $imdbId)
                if mediaType == .tv {
                    TextField("TVDB ID", text: $tvdbId)
                }
            }
            .formStyle(.grouped)
            .frame(height: mediaType == .tv ? 150 : 110)

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(pending ? "Fixing…" : "Save") { save() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(pending)
            }
        }
        .padding(24)
        .sheetWidth(460)
        .background(Theme.bg1)
    }

    private func save() {
        guard let target else {
            error = mediaType == .tv
                ? String(localized: "Enter a TMDb, IMDb or TheTVDB id.")
                : String(localized: "Enter a TMDb or IMDb id.")
            return
        }
        pending = true
        error = nil
        Task {
            do {
                try await onSubmit(target)
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}
