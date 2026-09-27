import SwiftUI

/// The signed-in iPhone app: a tab bar, each tab with its own navigation stack.
struct PhoneRootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Text(verbatim: "Marquee")
    }
}
