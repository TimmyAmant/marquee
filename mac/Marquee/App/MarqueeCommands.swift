import SwiftUI

/// Menu bar: Edit → Find, Go (the navigation menu and its sections), View → Reload, Library → Sync Now,
/// Marquee → Check for Updates… / Change Server… / Sign Out, and Help links that mirror the web footer.
struct MarqueeCommands: Commands {
    let model: AppModel
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL
    @Environment(\.openSettings) private var openSettings

    var body: some Commands {
        CommandGroup(replacing: .newItem) {}

        CommandGroup(after: .appInfo) {
            Button("Check for Updates…") {
                let model = self.model
                let openSettings = self.openSettings
                UpdateAlerts.checkNow(model.updater) {
                    // The download's progress shows in Settings › About.
                    model.settingsTab = .about
                    if model.viewer != nil { openSettings() }
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
            // The keyboard's way into the navigation menu (the rail opens it
            // on hover or a click). ⌃⌘S is the Mac's Show Sidebar shortcut,
            // and this menu is what replaced the sidebar.
            Button("Show Menu") {
                model.showMainWindow()
                model.navMenuRequest &+= 1
            }
            .keyboardShortcut("s", modifiers: [.command, .control])
            .disabled(model.phase != .ready)
            Divider()
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
