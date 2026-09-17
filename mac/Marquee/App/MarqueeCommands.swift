import SwiftUI

/// Menu bar: Go (sidebar sections), View → Reload, Library → Sync Now,
/// Marquee → Change Server… / Sign Out, and Help links that mirror the web footer.
struct MarqueeCommands: Commands {
    let model: AppModel
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL

    var body: some Commands {
        CommandGroup(replacing: .newItem) {}

        CommandGroup(after: .sidebar) {
            Button("Reload") {
                model.reload()
            }
            .keyboardShortcut("r", modifiers: .command)
            .disabled(model.phase != .ready)
        }

        CommandMenu("Go") {
            ForEach(SidebarItem.allCases) { item in
                Button(item.title) {
                    model.select(item)
                }
                .keyboardShortcut(item.shortcut, modifiers: .command)
                .disabled(model.phase != .ready)
            }
            Divider()
            Button("Back") {
                if !model.path.isEmpty { model.path.removeLast() }
            }
            .keyboardShortcut("[", modifiers: .command)
            .disabled(model.path.isEmpty)
        }

        CommandMenu("Library") {
            Button("Sync Now") {
                let api = model.api
                Task {
                    do {
                        try await api.integrations.syncNow()
                        model.flash("Synced.")
                    } catch {
                        model.flash(error: error)
                    }
                }
            }
            .keyboardShortcut("r", modifiers: [.command, .shift])
            .disabled(model.phase != .ready)

            Button("Surprise Me") {
                let api = model.api
                Task {
                    do {
                        model.openTitle(try await api.discover.surprise())
                    } catch {
                        model.flash(error: error)
                    }
                }
            }
            .keyboardShortcut("e", modifiers: [.command, .shift])
            .disabled(model.phase != .ready)
        }

        CommandGroup(after: .appSettings) {
            Button("Change Server…") {
                model.changeServer()
            }
            .disabled(model.phase == .launching || model.phase == .connect)

            Button("Sign Out") {
                model.signOut()
            }
            .disabled(model.phase != .ready)
        }

        CommandGroup(replacing: .help) {
            Button("Error Reference") {
                openWindow(id: "error-reference")
            }
            Button("Marquee Releases") {
                openWindow(id: "changelog")
            }
            Divider()
            Button("Marquee on GitHub") {
                openURL(AppInfo.repositoryURL)
            }
            Button("Report an Issue") {
                openURL(AppInfo.issuesURL)
            }
        }
    }
}
