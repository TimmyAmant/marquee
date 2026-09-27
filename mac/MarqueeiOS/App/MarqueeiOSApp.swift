import SwiftUI

@main
struct MarqueeiOSApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            Text(verbatim: "Marquee")
                .environment(model)
        }
    }
}
