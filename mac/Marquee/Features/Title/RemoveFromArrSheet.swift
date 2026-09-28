import SwiftUI

/// "Remove from Radarr/Sonarr"'s confirmation (components/remove-from-arr-button.tsx):
/// one Remove button, and "Also delete the files" as a checkbox that's off
/// each time it opens, so deleting is always a deliberate second choice.
struct RemoveFromArrSheet: View {
    let name: String
    /// "Radarr", "Sonarr 4K"…
    let arrName: String
    /// Runs the removal, after the sheet has closed.
    let onRemove: (_ deleteFiles: Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var deleteFiles = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Remove \(name) from \(arrName)?")
                .font(.marqueeDisplay(20))
                .fixedSize(horizontal: false, vertical: true)
            Text("\(arrName) stops tracking it on every server that has it. Its approved requests are marked removed, so it can be requested again.")
                .font(.system(size: Metrics.text(12.5)))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Toggle(isOn: $deleteFiles) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Also delete the files")
                        .font(.system(size: Metrics.text(13)))
                        .foregroundStyle(Theme.textPrimary)
                    Text("Gone from the disk for good — Plex and Jellyfin lose it too.")
                        .font(.system(size: Metrics.text(11.5)))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            #if os(macOS)
            .toggleStyle(.checkbox)
            #else
            .tint(Theme.danger)
            #endif

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(deleteFiles ? String(localized: "Remove and delete files") : String(localized: "Remove")) {
                    dismiss()
                    onRemove(deleteFiles)
                }
                .buttonStyle(DangerButtonStyle())
            }
        }
        .padding(24)
        #if os(macOS)
        .frame(width: 440)
        #else
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        #endif
        .background(Theme.bg1)
    }
}

/// The web dialog's red Remove button (bg-red-500, white text).
private struct DangerButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: Metrics.text(12.5), weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
            .background(Capsule().fill(Theme.danger.opacity(configuration.isPressed ? 0.8 : 1)))
            .opacity(isEnabled ? 1 : 0.6)
            .contentShape(Capsule())
    }
}
