import SwiftUI

/// app/profile/[id]/page.tsx (0.53+): a member's profile, after Seerr's —
/// photo, name and when they joined; how many requests they've made and how
/// many they have left; and their Plex Watchlist. Yours from Settings ›
/// Account, anyone's for the admin from the household list.
struct MemberProfileSheet: View {
    let member: API.HouseholdMember

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var profile: API.MemberProfile?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header
            if let profile {
                stats(profile)
                if let watchlist = profile.watchlist {
                    watchlistRow(watchlist)
                }
            } else if let error {
                InlineMessage(text: error)
            } else {
                ProgressView().controlSize(.small)
            }
            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 640)
        .background(Theme.bg1)
        .task {
            do {
                profile = try await model.api.users.profile(member.id)
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private var header: some View {
        HStack(spacing: 16) {
            UserAvatarView(label: member.label, avatarUrl: member.avatarUrl, size: 72)
            VStack(alignment: .leading, spacing: 4) {
                Text(member.label)
                    .font(.marqueeDisplay(24, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(member.username)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
                HStack(spacing: 8) {
                    TonePill(
                        text: member.isAdmin ? String(localized: "Admin") : (member.presetTag ?? API.PermissionPreset.member.label),
                        tone: .accent,
                        small: true
                    )
                    Text("Joined \(member.createdAt.formatted(date: .long, time: .omitted))")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func stats(_ profile: API.MemberProfile) -> some View {
        HStack(spacing: 12) {
            statCard(
                String(localized: "Total requests"),
                profile.requests.total.formatted(),
                detail: [
                    String(localized: "\(profile.requests.movie) movies"),
                    String(localized: "\(profile.requests.tv) series"),
                ].joined(separator: " · ")
            )
            limitCard(String(localized: "Movie requests left"), profile.requestLimits.movie)
            limitCard(String(localized: "Series requests left"), profile.requestLimits.tv)
        }
    }

    /// "3 of 5", "Every 7 days" under it; "Unlimited" when there's no limit.
    private func limitCard(_ label: String, _ limit: API.RequestLimit?) -> some View {
        guard let limit else { return statCard(label, String(localized: "Unlimited"), detail: nil) }
        return statCard(
            label,
            String(localized: "\(limit.remaining) of \(limit.limit)"),
            detail: String(localized: "Every \(limit.days) days")
        )
    }

    private func statCard(_ label: String, _ value: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.textMuted)
            Text(value)
                .font(.marqueeDisplay(24, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let detail {
                Text(detail)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.bg2.opacity(0.5)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
    }

    @ViewBuilder
    private func watchlistRow(_ cards: [API.TitleCard]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Plex Watchlist")
                .font(.marqueeDisplay(18, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            if cards.isEmpty {
                Text("Nothing on the Watchlist yet.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 14) {
                        ForEach(cards) { card in
                            PosterCard(card: card, showsTypeLabel: true) {
                                dismiss()
                                model.openTitle(card.id)
                            }
                            .frame(width: 118)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
    }
}
