import SwiftUI

/// Menu bar: Edit → Find, Go (the navigation sections), View → Reload, Library → Sync Now,
/// Marquee → Check for Updates… / Change Server… / Sign Out, and Help links that mirror the web footer.
struct MarqueeCommands: Commands {
    let model: AppModel
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL

    var body: some Commands {
        CommandGroup(replacing: .newItem) {}

        // Settings is a page of the main window, not a window of its own.
        CommandGroup(replacing: .appSettings) {
            Button("Settings…") {
                model.openSettings()
            }
            .keyboardShortcut(",", modifiers: .command)
            .disabled(model.phase != .ready)
        }

        CommandGroup(after: .appInfo) {
            Button("Check for Updates…") {
                let model = self.model
                UpdateAlerts.checkNow(model.updater) {
                    // The download's progress shows in Settings › About.
                    if model.viewer != nil { model.openSettings(.about) }
                }
            }
            .disabled(model.updater.isInstalling)
        }

        // Replaces the text-view Find submenu, whose Find… would otherwise
        // claim ⌘F first; the toolbar search is the app's only search.
        CommandGroup(replacing: .textEditing) {
            Button("Find…") {
                model.showMainWindow()
                model.searchFocusRequest &+= 1
            }
            .keyboardShortcut("f", modifiers: .command)
            .disabled(model.phase != .ready)
        }

        CommandGroup(after: .sidebar) {
            Button("Reload") {
                model.reload()
            }
            .keyboardShortcut("r", modifiers: .command)
            .disabled(model.phase != .ready)
        }

        CommandMenu("Go") {
            ForEach(SidebarItem.sections) { item in
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
