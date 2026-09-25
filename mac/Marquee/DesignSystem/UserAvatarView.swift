import SwiftUI

/// components/user-avatar.tsx — a round profile picture: the account's photo
/// when it has one (fetched with the session's token, see `AvatarImageStore`),
/// otherwise its initials on the accent gradient, which is also what shows
/// while the photo loads or if it can't. Decorative: the name always sits
/// beside it or in the control's label.
struct UserAvatarView: View {
    let label: String
    /// The account's `avatarUrl`; nil for initials.
    let avatarUrl: String?
    let size: CGFloat

    @Environment(AppModel.self) private var model
    @State private var photo: NSImage?
    /// Which URL `photo` is, so a new photo (a new `?v=`) never shows the old one.
    @State private var photoURL: String?

    var body: some View {
        // Already in memory (another avatar loaded it): no initials first.
        let image = avatarUrl.flatMap { url in photoURL == url ? photo : model.avatars.cachedImage(for: url) }

        ZStack {
            Circle().fill(Theme.avatarGradient)
            Text(Self.initials(of: label))
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(Theme.bg0)
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        // `ring-2 ring-white/15`, drawn outside the circle.
        .overlay(Circle().strokeBorder(Color.white.opacity(0.15), lineWidth: 2).padding(-2))
        .accessibilityHidden(true)
        .task(id: avatarUrl) { await load() }
    }

    private func load() async {
        guard let avatarUrl, model.avatars.cachedImage(for: avatarUrl) == nil else { return }
        let image = await model.avatars.image(for: avatarUrl, api: model.api)
        guard !Task.isCancelled, let image else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            photo = image
            photoURL = avatarUrl
        }
    }

    /// The first letter of the first two words, uppercased; "?" for none.
    nonisolated static func initials(of label: String) -> String {
        let letters = label
            .split(whereSeparator: \.isWhitespace)
            .prefix(2)
            .compactMap { $0.first.map { String($0).uppercased() } }
        return letters.isEmpty ? "?" : letters.joined()
    }
}
