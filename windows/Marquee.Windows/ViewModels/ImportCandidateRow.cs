using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core.Models;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// A row of "Import from Plex/Jellyfin": the person's name, the username
/// under it when there is a name, a checkbox, and "Already a member" (ticked
/// and disabled) for someone who already has a linked account.
/// </summary>
public sealed partial class ImportCandidateRow : ObservableObject
{
    public ImportCandidateRow(ImportCandidate candidate)
    {
        Id = candidate.Id;
        Label = candidate.Label;
        UsernameLine = candidate.DisplayName.NonBlank() != null ? candidate.Username : "";
        CanSelect = !candidate.AlreadyMember;
        MemberTag = candidate.AlreadyMember ? "Already a member" : "";
        IsSelected = candidate.AlreadyMember;
    }

    // Internal: bindings use the flattened properties (see HouseholdMemberRow.Member).
    internal ExternalId Id { get; }

    public string Label { get; }

    /// <summary>The username, under a display name; empty when <see cref="Label"/> already is the username.</summary>
    public string UsernameLine { get; }

    /// <summary>False for an existing member: shown, not selectable.</summary>
    public bool CanSelect { get; }

    /// <summary>"Already a member", or empty (the pill collapses).</summary>
    public string MemberTag { get; }

    public BadgeTone MemberTone { get; } = BadgeTone.Neutral;

    /// <summary>The checkbox; <c>bool?</c> to match <c>CheckBox.IsChecked</c>.</summary>
    [ObservableProperty]
    private bool? isSelected;

    /// <summary>Picked for import.</summary>
    internal bool IsPicked => CanSelect && IsSelected == true;
}
