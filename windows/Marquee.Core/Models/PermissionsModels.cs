using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using Marquee.Core.Localization;

namespace Marquee.Core.Models;

// Per-member permissions (0.48+, api-v1.md "GET /me" and section 11): the
// switches the admin sets for each household member. lib/users/permissions.ts
// is the server's side of this; the presets and the "reviewing brings
// seeing" rule are copied from there.

/// <summary>One of the 15 switches, in the website's order.</summary>
public enum PermissionKey
{
    RequestMovies,
    RequestTv,
    Request4kMovies,
    Request4kTv,
    AutoApproveMovies,
    AutoApproveTv,
    AutoApprove4kMovies,
    AutoApprove4kTv,
    AdvancedRequests,
    ViewRequests,
    ReviewRequests,
    ManageIssues,
    ReportIssues,
    ManageBlocklist,
    BypassLimits,
}

/// <summary>What the switches amount to: one of the two presets, or neither.</summary>
public enum PermissionPreset
{
    Member,
    Trusted,
    Custom,
}

/// <summary>
/// <c>permissions</c> on <c>/me</c>, the login <c>user</c> and a
/// <c>HouseholdMember</c>: every switch, true or false. A missing key reads
/// as off and an unknown one is ignored, as the contract asks. Also the
/// <c>PATCH /users/{id}</c> body's <c>permissions</c>, sent whole.
/// </summary>
public sealed record Permissions
{
    public bool RequestMovies { get; init; }
    public bool RequestTv { get; init; }
    public bool Request4kMovies { get; init; }
    public bool Request4kTv { get; init; }
    public bool AutoApproveMovies { get; init; }
    public bool AutoApproveTv { get; init; }
    public bool AutoApprove4kMovies { get; init; }
    public bool AutoApprove4kTv { get; init; }
    public bool AdvancedRequests { get; init; }
    public bool ViewRequests { get; init; }
    public bool ReviewRequests { get; init; }
    public bool ManageIssues { get; init; }
    public bool ReportIssues { get; init; }
    public bool ManageBlocklist { get; init; }
    public bool BypassLimits { get; init; }

    /// <summary>Nothing at all.</summary>
    public static Permissions None { get; } = new();

    /// <summary>Everything: the admin, always.</summary>
    public static Permissions All { get; } = FromKeys(Enum.GetValues<PermissionKey>());

    /// <summary>What a new account can do, and what "Member" fills in.</summary>
    public static Permissions MemberPreset { get; } = FromKeys(
    [
        PermissionKey.RequestMovies,
        PermissionKey.RequestTv,
        PermissionKey.Request4kMovies,
        PermissionKey.Request4kTv,
        PermissionKey.ReportIssues,
    ]);

    /// <summary>What "Trusted" fills in: everything but the blocklist.</summary>
    public static Permissions TrustedPreset { get; } = All with { ManageBlocklist = false };

    /// <summary>
    /// Reviewing requests brings seeing them: <see cref="ViewRequests"/> is
    /// on whenever <see cref="ReviewRequests"/> is (the server's <c>can()</c>).
    /// </summary>
    public Permissions Normalize() => ReviewRequests && !ViewRequests ? this with { ViewRequests = true } : this;

    /// <summary>"See everyone's requests", counting the one reviewing brings.</summary>
    [JsonIgnore]
    public bool SeesEveryonesRequests => ViewRequests || ReviewRequests;

    /// <summary>Member, Trusted, or Custom when the switches match neither preset.</summary>
    [JsonIgnore]
    public PermissionPreset Preset
    {
        get
        {
            var normalized = Normalize();
            if (normalized == TrustedPreset)
            {
                return PermissionPreset.Trusted;
            }
            return normalized == MemberPreset ? PermissionPreset.Member : PermissionPreset.Custom;
        }
    }

    /// <summary>The switches a preset fills in; Custom has none of its own and answers null.</summary>
    public static Permissions? ForPreset(PermissionPreset preset) => preset switch
    {
        PermissionPreset.Member => MemberPreset,
        PermissionPreset.Trusted => TrustedPreset,
        _ => null,
    };

    public bool Get(PermissionKey key) => key switch
    {
        PermissionKey.RequestMovies => RequestMovies,
        PermissionKey.RequestTv => RequestTv,
        PermissionKey.Request4kMovies => Request4kMovies,
        PermissionKey.Request4kTv => Request4kTv,
        PermissionKey.AutoApproveMovies => AutoApproveMovies,
        PermissionKey.AutoApproveTv => AutoApproveTv,
        PermissionKey.AutoApprove4kMovies => AutoApprove4kMovies,
        PermissionKey.AutoApprove4kTv => AutoApprove4kTv,
        PermissionKey.AdvancedRequests => AdvancedRequests,
        PermissionKey.ViewRequests => ViewRequests,
        PermissionKey.ReviewRequests => ReviewRequests,
        PermissionKey.ManageIssues => ManageIssues,
        PermissionKey.ReportIssues => ReportIssues,
        PermissionKey.ManageBlocklist => ManageBlocklist,
        PermissionKey.BypassLimits => BypassLimits,
        _ => false,
    };

    /// <summary>A copy with one switch set.</summary>
    public Permissions With(PermissionKey key, bool on) => key switch
    {
        PermissionKey.RequestMovies => this with { RequestMovies = on },
        PermissionKey.RequestTv => this with { RequestTv = on },
        PermissionKey.Request4kMovies => this with { Request4kMovies = on },
        PermissionKey.Request4kTv => this with { Request4kTv = on },
        PermissionKey.AutoApproveMovies => this with { AutoApproveMovies = on },
        PermissionKey.AutoApproveTv => this with { AutoApproveTv = on },
        PermissionKey.AutoApprove4kMovies => this with { AutoApprove4kMovies = on },
        PermissionKey.AutoApprove4kTv => this with { AutoApprove4kTv = on },
        PermissionKey.AdvancedRequests => this with { AdvancedRequests = on },
        PermissionKey.ViewRequests => this with { ViewRequests = on },
        PermissionKey.ReviewRequests => this with { ReviewRequests = on },
        PermissionKey.ManageIssues => this with { ManageIssues = on },
        PermissionKey.ReportIssues => this with { ReportIssues = on },
        PermissionKey.ManageBlocklist => this with { ManageBlocklist = on },
        PermissionKey.BypassLimits => this with { BypassLimits = on },
        _ => this,
    };

    /// <summary>Only <paramref name="keys"/> on.</summary>
    public static Permissions FromKeys(IEnumerable<PermissionKey> keys) =>
        keys.Aggregate(None, (permissions, key) => permissions.With(key, true));

    /// <summary>
    /// What an account could do before permissions existed (a server older
    /// than 0.48, which doesn't send them): the admin everything, a trusted
    /// member everything but the blocklist, anyone else (an unknown role
    /// included) the Member preset plus their auto-approval, the 4K copy
    /// following the regular one.
    /// </summary>
    public static Permissions Legacy(UserRole role, bool? autoApproveMovies = null, bool? autoApproveTv = null)
    {
        if (role == UserRole.Admin)
        {
            return All;
        }
        if (role == UserRole.Trusted)
        {
            return TrustedPreset;
        }
        var movies = autoApproveMovies == true;
        var tv = autoApproveTv == true;
        return MemberPreset with
        {
            AutoApproveMovies = movies,
            AutoApprove4kMovies = movies,
            AutoApproveTv = tv,
            AutoApprove4kTv = tv,
        };
    }

    /// <summary>
    /// What the account may do: everything for the admin (whatever was
    /// sent), the server's switches with reviewing bringing seeing, or the
    /// <see cref="Legacy"/> answer when the server sent none.
    /// </summary>
    public static Permissions Effective(UserRole role, Permissions? sent, bool? autoApproveMovies = null, bool? autoApproveTv = null)
    {
        if (role == UserRole.Admin)
        {
            return All;
        }
        return sent?.Normalize() ?? Legacy(role, autoApproveMovies, autoApproveTv);
    }
}

// MARK: The admin's editor

/// <summary>
/// app/settings/permissions-editor.tsx: "What they can do" (a preset picker
/// that fills the switches in, reading "Custom" once they match neither)
/// over the switches in three groups, each with a line saying what it does.
/// Turning "Review requests" on turns "See everyone's requests" on too, and
/// holds it on ("Comes with reviewing requests.") while it stays on. The
/// Windows dialog binds to this; nothing here knows about the UI.
/// </summary>
public sealed class MemberPermissionsEditor : INotifyPropertyChanged
{
    public static string MemberChoice => Loc.Get("Permission_MemberChoice");
    public static string TrustedChoice => Loc.Get("Permission_TrustedChoice");
    public static string CustomChoice => Loc.Get("Permission_CustomChoice");
    public static string Footer => Loc.Get("Permission_Footer");
    public static string ViewLockedNote => Loc.Get("Permission_ViewLockedNote");

    /// <summary>The picker's entries, in <see cref="PermissionPreset"/> order; Custom is only ever picked by itself.</summary>
    public static IReadOnlyList<string> PresetChoices => [MemberChoice, TrustedChoice, CustomChoice];

    private Permissions current;

    public MemberPermissionsEditor(Permissions initial)
    {
        current = initial.Normalize();
        Groups =
        [
            new PermissionGroup(Loc.Get("Permission_GroupRequests"),
            [
                Toggle(PermissionKey.RequestMovies, Loc.Get("Permission_RequestMovies"), Loc.Get("Permission_RequestMoviesHelp")),
                Toggle(PermissionKey.RequestTv, Loc.Get("Permission_RequestTv"), Loc.Get("Permission_RequestTvHelp")),
                Toggle(PermissionKey.Request4kMovies, Loc.Get("Permission_Request4kMovies"), Loc.Get("Permission_Request4kMoviesHelp")),
                Toggle(PermissionKey.Request4kTv, Loc.Get("Permission_Request4kTv"), Loc.Get("Permission_Request4kTvHelp")),
                Toggle(PermissionKey.AdvancedRequests, Loc.Get("Permission_AdvancedRequests"), Loc.Get("Permission_AdvancedRequestsHelp")),
                Toggle(PermissionKey.BypassLimits, Loc.Get("Permission_BypassLimits"), Loc.Get("Permission_BypassLimitsHelp")),
            ]),
            new PermissionGroup(Loc.Get("Permission_GroupAutoApprove"),
            [
                Toggle(PermissionKey.AutoApproveMovies, Loc.Get("Permission_AutoApproveMovies"), Loc.Get("Permission_AutoApproveMoviesHelp")),
                Toggle(PermissionKey.AutoApproveTv, Loc.Get("Permission_AutoApproveTv"), Loc.Get("Permission_AutoApproveTvHelp")),
                Toggle(PermissionKey.AutoApprove4kMovies, Loc.Get("Permission_AutoApprove4kMovies"), Loc.Get("Permission_AutoApprove4kMoviesHelp")),
                Toggle(PermissionKey.AutoApprove4kTv, Loc.Get("Permission_AutoApprove4kTv"), Loc.Get("Permission_AutoApprove4kTvHelp")),
            ]),
            new PermissionGroup(Loc.Get("Permission_GroupHelping"),
            [
                Toggle(PermissionKey.ViewRequests, Loc.Get("Permission_ViewRequests"), Loc.Get("Permission_ViewRequestsHelp")),
                Toggle(PermissionKey.ReviewRequests, Loc.Get("Permission_ReviewRequests"), Loc.Get("Permission_ReviewRequestsHelp")),
                Toggle(PermissionKey.ManageIssues, Loc.Get("Permission_ManageIssues"), Loc.Get("Permission_ManageIssuesHelp")),
                Toggle(PermissionKey.ReportIssues, Loc.Get("Permission_ReportIssues"), Loc.Get("Permission_ReportIssuesHelp")),
                Toggle(PermissionKey.ManageBlocklist, Loc.Get("Permission_ManageBlocklist"), Loc.Get("Permission_ManageBlocklistHelp")),
            ]),
        ];
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>The switches as they'd be saved (reviewing brings seeing).</summary>
    public Permissions Current => current;

    public IReadOnlyList<PermissionGroup> Groups { get; }

    /// <summary>Every switch, across the groups.</summary>
    public IEnumerable<PermissionToggle> Toggles => Groups.SelectMany(group => group.Items);

    public PermissionPreset Preset => current.Preset;

    /// <summary>"Custom" can only be the answer, never picked: the picker offers it disabled.</summary>
    public bool IsCustom => Preset == PermissionPreset.Custom;

    /// <summary>
    /// The picker's selection, an index into <see cref="PresetChoices"/>.
    /// Picking Member or Trusted fills that preset in; Custom (or anything
    /// else) changes nothing and the picker snaps back to what the switches are.
    /// </summary>
    public int PresetIndex
    {
        get => (int)Preset;
        set
        {
            if (value == (int)Preset)
            {
                return;
            }
            if (value >= 0 && value < PresetChoices.Count && Permissions.ForPreset((PermissionPreset)value) is { } filled)
            {
                Replace(filled);
            }
            else
            {
                Raise(nameof(PresetIndex));
            }
        }
    }

    public bool IsOn(PermissionKey key) => current.Get(key);

    /// <summary>Whether a switch shows locked on: "See everyone's requests" while reviewing.</summary>
    public bool IsLocked(PermissionKey key) => key == PermissionKey.ViewRequests && current.ReviewRequests;

    /// <summary>Flips one switch. A locked one stays as it is.</summary>
    public void Set(PermissionKey key, bool on)
    {
        if (IsLocked(key))
        {
            // Snap the box back on.
            Toggle(key).Changed();
            return;
        }
        if (current.Get(key) != on)
        {
            Replace(current.With(key, on));
        }
    }

    /// <summary>The toggle row for <paramref name="key"/>.</summary>
    public PermissionToggle Toggle(PermissionKey key) => Toggles.First(toggle => toggle.Key == key);

    /// <summary>
    /// Adds the switches to the <c>PATCH /users/{id}</c> body: the whole
    /// map, and none of the older fields (the role and the two auto-approve
    /// flags) that it would otherwise be applied on top of.
    /// </summary>
    public UpdateUserRequest Apply(UpdateUserRequest request) =>
        request with { Permissions = current, Role = null, AutoApproveMovies = null, AutoApproveTv = null };

    private PermissionToggle Toggle(PermissionKey key, string label, string description) =>
        new(this, key, label, description);

    private void Replace(Permissions next)
    {
        var before = current;
        current = next.Normalize();
        if (before == current)
        {
            Raise(nameof(PresetIndex));
            return;
        }
        foreach (var toggle in Toggles)
        {
            toggle.Changed();
        }
        Raise(nameof(Current));
        Raise(nameof(Preset));
        Raise(nameof(IsCustom));
        Raise(nameof(PresetIndex));
    }

    private void Raise([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>"Requests", "Approved straight away" or "Helping run things", with its switches.</summary>
public sealed class PermissionGroup
{
    internal PermissionGroup(string title, IReadOnlyList<PermissionToggle> items)
    {
        Title = title;
        Items = items;
    }

    public string Title { get; }
    public IReadOnlyList<PermissionToggle> Items { get; }
}

/// <summary>One switch in <see cref="MemberPermissionsEditor"/>: its label, what it does, on or off.</summary>
public sealed class PermissionToggle : INotifyPropertyChanged
{
    private readonly MemberPermissionsEditor editor;

    internal PermissionToggle(MemberPermissionsEditor editor, PermissionKey key, string label, string description)
    {
        this.editor = editor;
        Key = key;
        Label = label;
        Description = description;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public PermissionKey Key { get; }
    public string Label { get; }

    /// <summary>What it lets them do.</summary>
    public string Description { get; }

    /// <summary>Two-way: setting it flips the switch in the editor (a locked one stays on).</summary>
    public bool IsOn
    {
        get => editor.IsOn(Key) || IsLocked;
        set => editor.Set(Key, value);
    }

    /// <summary><see cref="IsOn"/> as a check box's <c>IsChecked</c> reads and writes it (no third state).</summary>
    public bool? IsChecked
    {
        get => IsOn;
        set => IsOn = value == true;
    }

    /// <summary>Held on by another switch ("See everyone's requests" while reviewing).</summary>
    public bool IsLocked => editor.IsLocked(Key);

    public bool IsEnabled => !IsLocked;

    /// <summary>The line under the label: what it does, or why it's locked.</summary>
    public string Note => IsLocked ? MemberPermissionsEditor.ViewLockedNote : Description;

    internal void Changed()
    {
        foreach (var name in new[] { nameof(IsOn), nameof(IsChecked), nameof(IsLocked), nameof(IsEnabled), nameof(Note) })
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }
    }
}
