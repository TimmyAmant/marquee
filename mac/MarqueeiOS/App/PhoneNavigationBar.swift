import UIKit

/// The navigation bar's titles in the pages' serif (New York, the system's
/// stand-in for the website's Fraunces): the large title every page shows
/// inline in the bar, and the small one a pushed page shows.
enum PhoneNavigationBar {
    @MainActor
    static func applyStyle() {
        let bar = UINavigationBar.appearance()
        bar.largeTitleTextAttributes = [.font: serif(.largeTitle, size: 30, weight: .regular)]
        bar.titleTextAttributes = [.font: serif(.headline, size: 17, weight: .semibold)]
    }

    /// A serif font at `size` that follows Dynamic Type like `style`.
    private static func serif(_ style: UIFont.TextStyle, size: CGFloat, weight: UIFont.Weight) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        let font = base.fontDescriptor.withDesign(.serif).map { UIFont(descriptor: $0, size: size) } ?? base
        return UIFontMetrics(forTextStyle: style).scaledFont(for: font, maximumPointSize: size * 1.35)
    }
}
