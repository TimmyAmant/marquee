import SwiftUI

/// components/collection-prompt.tsx: "Part of The Matrix Collection" — the
/// other movies of a just-added or just-requested movie's collection, with
/// Not now and Add all / Request all. Shown by the Mac window and the iPhone
/// root view from `AppModel.collectionOffer`.
struct CollectionOfferSheet: View {
    let offer: CollectionOfferModel.Offer

    @Environment(AppModel.self) private var model

    private var adding: Bool { offer.action == .add }

    private var body_: String {
        let count = offer.items.count
        return adding
            ? String(localized: "\(count) other movies in this collection aren't in your library yet. Add them too?")
            : String(localized: "\(count) other movies in this collection aren't in the library yet. Request them too?")
    }

    private var confirmTitle: String {
        let count = offer.items.count
        if model.collectionOffer.isWorking {
            return adding ? String(localized: "Adding…") : String(localized: "Requesting…")
        }
        return adding ? String(localized: "Add all \(count)") : String(localized: "Request all \(count)")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Part of \(offer.name)")
                    .font(.marqueeDisplay(20))
                    .foregroundStyle(Theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(body_)
                    .font(.system(size: Metrics.text(13)))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
            .padding(.top, 22)
            .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(offer.items.enumerated()), id: \.element.tmdbId) { index, item in
                        if index > 0 { Divider().overlay(Theme.border) }
                        HStack(spacing: 12) {
                            RemoteImage(item.posterPath, size: .w92)
                                .frame(width: 36, height: 54)
                                .background(Theme.bg2)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: item.name)
                                    .font(.system(size: Metrics.text(13.5), weight: .medium))
                                    .foregroundStyle(Theme.textPrimary)
                                    .lineLimit(1)
                                if let year = item.year {
                                    Text(verbatim: year)
                                        .font(.system(size: Metrics.text(11.5)))
                                        .foregroundStyle(Theme.textMuted)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal, 24)
            }

            Divider().overlay(Theme.border)
            VStack(alignment: .trailing, spacing: 8) {
                if let error = model.collectionOffer.error {
                    Text(verbatim: error)
                        .font(.system(size: Metrics.text(12)))
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(spacing: 8) {
                    Spacer()
                    Button("Not now") { model.collectionOffer.decline() }
                        .buttonStyle(OutlineButtonStyle())
                        .keyboardShortcut(.cancelAction)
                    Button {
                        Task { await model.acceptCollectionOffer() }
                    } label: {
                        Text(verbatim: confirmTitle).frame(minWidth: 64)
                    }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                }
                .disabled(model.collectionOffer.isWorking)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        #if os(macOS)
        .frame(width: 440)
        .frame(minHeight: 240, maxHeight: 560)
        #endif
        .background(Theme.bg1)
        .interactiveDismissDisabled(model.collectionOffer.isWorking)
        .onExitCommandIfAvailable { model.collectionOffer.decline() }
    }
}
