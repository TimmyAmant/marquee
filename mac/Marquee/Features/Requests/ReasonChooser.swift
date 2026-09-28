import SwiftUI

/// The decline chooser's reasons (components/decline-reason-chooser.tsx
/// `ReasonChoices`): the presets plus "Other" with a free-text field. The
/// Decline sheet requires one; the Remove from Radarr/Sonarr sheet passes
/// `optional`, which lists "No reason" first (a nil `choice`).
struct ReasonChooser: View {
    let reasons: [String]
    @Binding var choice: String?
    @Binding var customReason: String
    var optional = false

    /// The free-text choice. Only the chooser's label: what gets sent is the
    /// admin's own words, never this word itself.
    static let other = String(localized: "Other")
    /// The server's cap, counted in Unicode scalars the way the server counts
    /// code points (not Characters, which would let a run of emoji through
    /// that the server then shortens), so what's typed is what's stored.
    static let maxReasonLength = 200

    /// What would be sent: the preset, the trimmed custom text, or nil for
    /// nothing chosen, "No reason", or "Other" left blank.
    static func reason(choice: String?, customReason: String) -> String? {
        guard let choice else { return nil }
        guard choice == other else { return choice }
        let trimmed = customReason.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// nil is "No reason", when that's offered.
    private var options: [String?] { (optional ? [nil] : []) + reasons.map(Optional.some) + [Self.other] }

    private func label(_ option: String?) -> String { option ?? String(localized: "No reason") }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            #if os(iOS)
            // A menu with nothing chosen yet shows no label on iOS: the
            // reasons are listed as rows to tap instead.
            VStack(spacing: 0) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    if index > 0 { Divider().overlay(Theme.border) }
                    Button {
                        choice = option
                    } label: {
                        HStack {
                            Text(label(option))
                                .foregroundStyle(Theme.textPrimary)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 8)
                            if choice == option {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Theme.accent)
                            }
                        }
                        .font(.system(size: Metrics.text(14)))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(choice == option ? .isSelected : [])
                }
            }
            .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
            #else
            Picker("Reason", selection: $choice) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                    Text(label(option)).tag(option)
                }
            }
            .choicePickerStyle()
            .labelsHidden()
            .font(.system(size: Metrics.text(13)))
            #endif

            if choice == Self.other {
                TextField("Tell them why", text: $customReason)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: Metrics.text(13)))
                    .onChange(of: customReason) { _, value in
                        let scalars = value.unicodeScalars
                        if scalars.count > Self.maxReasonLength {
                            customReason = String(scalars.prefix(Self.maxReasonLength))
                        }
                    }
            }
        }
    }
}
